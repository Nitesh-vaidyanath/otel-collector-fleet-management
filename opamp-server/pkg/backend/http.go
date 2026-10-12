package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// newHTTPHandler constructs the root handler used for all resource calls.
// It mounts the JSON API under /plugin-api (as recommended by Grafana’s app
// plugin docs) and keeps static assets available for standalone smoke testing.
func newHTTPHandler() http.Handler {
	apiMux := newAPIMux()
	staticMux := newStaticMux()

	root := http.NewServeMux()

	pluginAPIDispatch := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/plugin-api" {
			r.URL.Path = "/"
		}
		http.StripPrefix("/plugin-api", apiMux).ServeHTTP(w, r)
	})
	root.Handle("/plugin-api", pluginAPIDispatch)
	root.Handle("/plugin-api/", http.StripPrefix("/plugin-api", apiMux))

	legacyDispatch := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/r" {
			r.URL.Path = "/"
		}
		http.StripPrefix("/r", apiMux).ServeHTTP(w, r)
	})
	root.Handle("/r", legacyDispatch)
	root.Handle("/r/", http.StripPrefix("/r", apiMux))

	root.Handle("/", staticMux)

	return withLogging(root)
}

func newStaticMux() http.Handler {
	mux := http.NewServeMux()

	pluginDir := os.Getenv("GF_PLUGIN_DIR")
	if pluginDir == "" {
		pluginDir = "/var/lib/grafana/plugins/otel-collector-agent-fleet-management"
	}
	publicDir := filepath.Join(pluginDir, "public")

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			http.ServeFile(w, r, filepath.Join(publicDir, "index.html"))
			return
		}
		http.NotFound(w, r)
	})

	mux.HandleFunc("/public/", func(w http.ResponseWriter, r *http.Request) {
		filePath := strings.TrimPrefix(r.URL.Path, "/public/")
		fullPath := filepath.Join(publicDir, filePath)

		switch {
		case strings.HasSuffix(filePath, ".js"):
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		case strings.HasSuffix(filePath, ".css"):
			w.Header().Set("Content-Type", "text/css; charset=utf-8")
		case strings.HasSuffix(filePath, ".ttf"):
			w.Header().Set("Content-Type", "font/ttf")
		}

		http.ServeFile(w, r, fullPath)
	})

	return mux
}

func newAPIMux() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", wrap(healthHandler))
	mux.HandleFunc("/settings", wrap(settingsHandler))
	mux.HandleFunc("/telemetry-settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(telemetrySettingsGetHandler)(w, r)
		case http.MethodPost:
			rbac(RoleAdmin, telemetrySettingsPostHandler)(w, r)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/user-role", wrap(userRoleHandler))
	mux.HandleFunc("/agent-deployments", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(agentDeploymentsCollectionHandler)(w, r) // Viewer+, scoped to stable user login and organization
		case http.MethodPost:
			rbac(RoleAdmin, agentDeploymentsCollectionHandler)(w, r) // Admin only: creates a workload with a selected privilege profile.
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/agent-deployments/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/agent-deployments/"), "/")
		parts := strings.Split(path, "/")
		if len(parts) == 2 && (parts[1] == "start" || parts[1] == "stop" || parts[1] == "restart" || parts[1] == "security-profile") {
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			rbac(RoleAdmin, agentDeploymentEntityHandler)(w, r)
			return
		}
		if len(parts) == 1 {
			if r.Method != http.MethodDelete {
				methodNotAllowed(w)
				return
			}
			rbac(RoleAdmin, agentDeploymentEntityHandler)(w, r)
			return
		}
		notFound(w)
	})
	mux.HandleFunc("/organizations", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(organizationsHandler)(w, r) // Viewer+
		case http.MethodPost:
			rbac(RoleAdmin, organizationsHandler)(w, r) // Admin only for creation
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/bridges", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			wrap(bridgesCollectionHandler)(w, r) // Viewer+
		} else {
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/bridges/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/bridges/")
		if strings.HasSuffix(path, "/delete") {
			if r.Method == http.MethodDelete || r.Method == http.MethodPost {
				rbac(RoleAdmin, bridgeDeleteHandler)(w, r)
			} else {
				methodNotAllowed(w)
			}
			return
		}
		notFound(w)
	})
	mux.HandleFunc("/agents", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(agentsCollectionHandler)(w, r) // Viewer+
		case http.MethodPost:
			rbac(RoleAdmin, agentsCollectionHandler)(w, r)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/agents/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/agents/")
		if strings.HasSuffix(path, "/operations") {
			if r.Method == http.MethodPost {
				rbac(RoleEditor, agentOperationsHandler)(w, r) // Action also enforces editor/admin split.
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/current-config") {
			if r.Method == http.MethodGet {
				wrap(agentCurrentConfigHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/config-sync-status") {
			if r.Method == http.MethodGet {
				wrap(agentConfigSyncStatusHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/activity") {
			if r.Method == http.MethodGet {
				wrap(agentActivityLogHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/config-compare") {
			if r.Method == http.MethodGet {
				wrap(agentConfigCompareHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/config-diff") {
			if r.Method == http.MethodGet {
				wrap(agentConfigDiffHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/telemetry") {
			if r.Method == http.MethodGet {
				wrap(agentTelemetryHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/health") {
			if r.Method == http.MethodGet {
				wrap(agentHealthHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/pipelines") {
			if r.Method == http.MethodGet {
				wrap(agentPipelinesHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}

		switch r.Method {
		case http.MethodGet:
			wrap(agentEntityHandler)(w, r) // Viewer+
		case http.MethodPatch:
			rbac(RoleAdmin, agentEntityHandler)(w, r)
		case http.MethodDelete:
			rbac(RoleAdmin, agentEntityHandler)(w, r)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/configs", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(configsCollectionHandler)(w, r) // Viewer+
		case http.MethodPost:
			rbac(RoleEditor, configsCollectionHandler)(w, r)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/configs/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/configs/")
		if path == "revert" || strings.HasSuffix(path, "/revert") {
			if r.Method == http.MethodPost {
				rbac(RoleEditor, configRevertHandler)(w, r)
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/approve") {
			if r.Method == http.MethodPost {
				rbac(RoleAdmin, configApprovalHandler)(w, r)
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if strings.HasSuffix(path, "/diff") {
			if r.Method == http.MethodGet {
				wrap(configDiffHandler)(w, r) // Viewer+
			} else {
				methodNotAllowed(w)
			}
			return
		}
		if r.Method == http.MethodGet {
			wrap(configEntityHandler)(w, r) // Viewer+
			return
		}
		methodNotAllowed(w)
	})
	mux.HandleFunc("/config-generator", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			rbac(RoleEditor, configGeneratorHandler)(w, r)
			return
		}
		methodNotAllowed(w)
	})
	mux.HandleFunc("/config-templates", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(configTemplatesHandler)(w, r) // Viewer+
		case http.MethodPost:
			rbac(RoleEditor, configTemplatesHandler)(w, r)
		case http.MethodDelete:
			rbac(RoleEditor, configTemplatesHandler)(w, r)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/stats", wrap(statsHandler))
	mux.HandleFunc("/component-types", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(componentTypesHandler)(w, r)
		case http.MethodPost, http.MethodPatch, http.MethodDelete:
			rbac(RoleEditor, componentTypesHandler)(w, r)
		default:
			methodNotAllowed(w)
		}
	})
	mux.HandleFunc("/logging", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			wrap(loggingConfigGetHandler)(w, r)
		case http.MethodPost:
			rbac(RoleAdmin, loggingConfigUpdateHandler)(w, r)
		default:
			methodNotAllowed(w)
		}
	})

	return mux
}

func withLogging(next http.Handler) http.Handler {
	if next == nil {
		return http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if appLogger != nil {
			appLogger.Debug("HTTP request received", map[string]interface{}{
				"method": r.Method,
				"path":   r.URL.Path,
			})
		}
		next.ServeHTTP(w, r)
	})
}
