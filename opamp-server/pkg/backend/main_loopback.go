//go:build loopback
// +build loopback

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// This entry point runs the backend HTTP API + OpAMP server as a standalone process.
// It shares the same handlers as the Grafana plugin backend but exposes them over
// a dedicated listener so we can front it with Grafana's plugin proxy.

var (
	loopbackServer *http.Server
)

func main() {
	appLogger = NewLogger("otel-collector-agent-fleet-management-loopback")

	// Initialize OpAMP server just like the plugin backend does.
	opampServerMode := os.Getenv("OPAMP_SERVER_MODE")
	opampServerURL := os.Getenv("OPAMP_SERVER_URL")

	if opampServerMode == "external" {
		appLogger.Info("OpAMP server mode: External (standalone)", map[string]interface{}{
			"opamp_server_url": opampServerURL,
		})
	} else {
		appLogger.Info("OpAMP server mode: Embedded (loopback)", nil)

		var err error
		globalOpampManager, err = NewOpampManager()
		if err != nil {
			appLogger.Error("Failed to create OPAMP manager", err)
			log.Fatalf("Failed to create OPAMP manager: %v", err)
		}

		opampEndpoint := os.Getenv("OPAMP_ENDPOINT")
		if opampEndpoint == "" {
			opampEndpoint = "0.0.0.0:4321"
		}

		certFile := os.Getenv("OPAMP_TLS_CERT")
		keyFile := os.Getenv("OPAMP_TLS_KEY")
		tlsEnabled := certFile != "" && keyFile != ""

		appLogger.Info("Starting embedded OPAMP server", map[string]interface{}{
			"endpoint": opampEndpoint,
			"tls":      tlsEnabled,
		})

		go func() {
			if err := globalOpampManager.Start(opampEndpoint, certFile, keyFile); err != nil {
				appLogger.Error("Failed to start OPAMP server", err, map[string]interface{}{
					"endpoint": opampEndpoint,
					"tls":      tlsEnabled,
				})
			} else {
				protocol := "ws://"
				if tlsEnabled {
					protocol = "wss://"
				}
				appLogger.Info("OPAMP server started successfully", map[string]interface{}{
					"endpoint": opampEndpoint,
					"protocol": protocol,
				})
			}
		}()
	}

	httpHandler := newHTTPHandler()
	addr := os.Getenv("LOOPBACK_LISTEN_ADDR")
	if addr == "" {
		addr = "0.0.0.0:5801"
	}

	loopbackServer = &http.Server{
		Addr:    addr,
		Handler: httpHandler,
	}

	go func() {
		appLogger.Info("Starting loopback HTTP server", map[string]interface{}{"addr": addr})
		if err := loopbackServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			appLogger.Error("Loopback server stopped unexpectedly", err, map[string]interface{}{"addr": addr})
			log.Fatalf("Loopback server stopped: %v", err)
		}
	}()

	// Handle graceful shutdown.
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs

	appLogger.Info("Shutting down loopback backend")

	if loopbackServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := loopbackServer.Shutdown(ctx); err != nil {
			appLogger.Error("Loopback server shutdown error", err)
		}
	}

	if globalOpampManager != nil {
		appLogger.Info("Shutting down OPAMP server")
		globalOpampManager.Stop()
	}
}
