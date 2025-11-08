//go:build !standalone && !loopback
// +build !standalone,!loopback

package main

// This is the plugin backend main - used when running as Grafana plugin

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

var loopbackServer *http.Server

func main() {
	backend.SetupPluginEnvironment("otel-collector-agent-fleet-management")
	appLogger = NewLogger("otel-collector-agent-fleet-management")

	// Check if OpAMP server should run in external mode (standalone)
	opampServerMode := os.Getenv("OPAMP_SERVER_MODE")
	opampServerURL := os.Getenv("OPAMP_SERVER_URL")

	// If external mode is enabled, don't start embedded OpAMP server
	if opampServerMode == "external" {
		appLogger.Info("OpAMP server mode: External (standalone)", map[string]interface{}{
			"opamp_server_url": opampServerURL,
		})
		// Note: The plugin will still work, but agents should connect to the external OpAMP server
		// The plugin backend will only handle API requests, not OpAMP connections
	} else {
		// Embedded mode: Start OpAMP server inside the plugin
		appLogger.Info("OpAMP server mode: Embedded (plugin)", map[string]interface{}{})

		// Initialize OPAMP manager
		var err error
		globalOpampManager, err = NewOpampManager()
		if err != nil {
			appLogger.Error("Failed to create OPAMP manager", err)
			log.Fatalf("Failed to create OPAMP manager: %v", err)
		}

		// Start OPAMP server
		opampEndpoint := os.Getenv("OPAMP_ENDPOINT")
		if opampEndpoint == "" {
			opampEndpoint = "0.0.0.0:4321"
		}

		// Get TLS configuration from environment variables
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
	startLoopbackProxy(httpHandler)

	appLogger.Info("Starting Grafana plugin backend")
	if err := backend.Serve(backend.ServeOpts{
		CallResourceHandler: newResourceAdapter(httpHandler),
	}); err != nil {
		appLogger.Error("Failed to start backend", err)
		log.Fatal(err)
	}

	// Cleanup on shutdown
	if globalOpampManager != nil {
		appLogger.Info("Shutting down OPAMP server")
		globalOpampManager.Stop()
	}
	if loopbackServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := loopbackServer.Shutdown(ctx); err != nil {
			appLogger.Error("Failed to shut down loopback proxy", err)
		}
	}
}

func startLoopbackProxy(handler http.Handler) {
	if handler == nil {
		return
	}
	addr := os.Getenv("PLUGIN_LOOPBACK_ADDR")
	if addr == "" {
		addr = "127.0.0.1:5801"
	}
	if os.Getenv("PLUGIN_LOOPBACK_DISABLE") == "1" {
		appLogger.Info("Loopback proxy disabled", map[string]interface{}{"addr": addr})
		return
	}
	loopbackServer = &http.Server{
		Addr:    addr,
		Handler: handler,
	}
	go func() {
		appLogger.Info("Starting loopback proxy", map[string]interface{}{"addr": addr})
		if err := loopbackServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			appLogger.Error("Loopback proxy stopped unexpectedly", err, map[string]interface{}{"addr": addr})
		}
	}()
}
