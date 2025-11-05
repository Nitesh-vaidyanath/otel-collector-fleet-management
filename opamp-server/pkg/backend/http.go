package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func newHTTPMux() *http.ServeMux {
	mux := http.NewServeMux()

	// Get plugin directory
	pluginDir := os.Getenv("GF_PLUGIN_DIR")
	if pluginDir == "" {
		pluginDir = "/var/lib/grafana/plugins/otel-collector-agent-fleet-management"
	}
	publicDir := filepath.Join(pluginDir, "public")

	// Serve the main index.html at root path - NO AUTHENTICATION REQUIRED FOR UI
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			// Serve HTML directly without any auth/RBAC wrapper
			http.ServeFile(w, r, filepath.Join(publicDir, "index.html"))
			return
		}
		// Let other handlers process non-root paths
		http.NotFound(w, r)
	})

	// Serve static assets (JS, CSS, fonts)
	mux.HandleFunc("/public/", func(w http.ResponseWriter, r *http.Request) {
		filePath := strings.TrimPrefix(r.URL.Path, "/public/")
		fullPath := filepath.Join(publicDir, filePath)

		if strings.HasSuffix(filePath, ".js") {
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		} else if strings.HasSuffix(filePath, ".css") {
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		} else if strings.HasSuffix(filePath, ".ttf") {
			w.Header().Set("Content-Type", "font/ttf")
		}

		http.ServeFile(w, r, fullPath)
	})

	mux.HandleFunc("/health", wrap(healthHandler))
	mux.HandleFunc("/settings", wrap(settingsHandler))
	mux.HandleFunc("/user-role", wrap(userRoleHandler))
	mux.HandleFunc("/organizations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(organizationsHandler)(w, r) // Viewer+
		case http.MethodPost:
			rbac(RoleAdmin, organizationsHandler)(w, r) // Admin only for creation
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/agents", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(agentsCollectionHandler)(w, r) // Viewer+
		case http.MethodPost:
			wrap(agentsCollectionHandler)(w, r) // Viewer+
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/agents/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/agents/")
		// Check for special endpoints first
		if strings.HasSuffix(path, "/operations") {
			if r.Method == http.MethodPost {
				wrap(agentOperationsHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/current-config") {
			if r.Method == http.MethodGet {
				wrap(agentCurrentConfigHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/config-sync-status") {
			if r.Method == http.MethodGet {
				wrap(agentConfigSyncStatusHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/activity") {
			if r.Method == http.MethodGet {
				wrap(agentActivityLogHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/config-compare") {
			if r.Method == http.MethodGet {
				wrap(agentConfigCompareHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/config-diff") {
			if r.Method == http.MethodGet {
				wrap(agentConfigDiffHandler)(w, r) // Viewer+ (for comparing two database configs)
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/telemetry") {
			if r.Method == http.MethodGet {
				wrap(agentTelemetryHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/health") {
			if r.Method == http.MethodGet {
				wrap(agentHealthHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/pipelines") {
			if r.Method == http.MethodGet {
				wrap(agentPipelinesHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		// Regular agent entity operations
		switch r.Method {
		case http.MethodGet:
			wrap(agentEntityHandler)(w, r) // Viewer+
		case http.MethodPatch:
			wrap(agentEntityHandler)(w, r) // Viewer+
		case http.MethodDelete:
			wrap(agentEntityHandler)(w, r) // Viewer+
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/configs", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(configsCollectionHandler)(w, r) // Viewer+
		case http.MethodPost:
			wrap(configsCollectionHandler)(w, r) // Viewer+
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/configs/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/configs/")
		// Check for /revert endpoint (can be /revert or /{id}/revert)
		if path == "revert" || strings.HasSuffix(path, "/revert") {
			if r.Method == http.MethodPost {
				wrap(configRevertHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/approve") {
			if r.Method == http.MethodPost {
				// Use wrap() instead of rbac() to allow handler to decide (handler allows testing mode)
				wrap(configApprovalHandler)(w, r) // Handler checks admin internally but allows testing
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		if strings.HasSuffix(path, "/diff") {
			if r.Method == http.MethodGet {
				wrap(configDiffHandler)(w, r) // Viewer+
			} else {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		// Get config by ID
		if r.Method == http.MethodGet {
			wrap(configEntityHandler)(w, r) // Viewer+
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/config-generator", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			wrap(configGeneratorHandler)(w, r) // Allow Viewer+ (Grafana auth handles permission)
		} else {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/config-templates", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(configTemplatesHandler)(w, r) // Viewer+
		case http.MethodPost:
			wrap(configTemplatesHandler)(w, r) // Viewer+
		case http.MethodDelete:
			wrap(configTemplatesHandler)(w, r) // Viewer+
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/stats", wrap(statsHandler))
	mux.HandleFunc("/component-types", wrap(componentTypesHandler))
	return mux
}
