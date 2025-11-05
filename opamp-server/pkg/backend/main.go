//go:build !standalone
// +build !standalone

package main

// This is the plugin backend main - used when running as Grafana plugin

import (
	"log"
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

var (
	globalOpampManager *OpampManager
	appLogger          *Logger
)

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

		appLogger.Info("Starting embedded OPAMP server", map[string]interface{}{
			"endpoint": opampEndpoint,
		})

		go func() {
			if err := globalOpampManager.Start(opampEndpoint); err != nil {
				appLogger.Error("Failed to start OPAMP server", err, map[string]interface{}{
					"endpoint": opampEndpoint,
				})
			} else {
				appLogger.Info("OPAMP server started successfully", map[string]interface{}{
					"endpoint": opampEndpoint,
				})
			}
		}()
	}

	mux := newHTTPMux()

	appLogger.Info("Starting Grafana plugin backend")
	if err := backend.Serve(backend.ServeOpts{
		CallResourceHandler: httpadapter.New(mux),
	}); err != nil {
		appLogger.Error("Failed to start backend", err)
		log.Fatal(err)
	}

	// Cleanup on shutdown
	if globalOpampManager != nil {
		appLogger.Info("Shutting down OPAMP server")
		globalOpampManager.Stop()
	}
}
