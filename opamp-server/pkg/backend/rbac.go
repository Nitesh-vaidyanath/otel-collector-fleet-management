package main

import (
	"fmt"
	"net/http"
	"strings"
)

type Role int

const (
	RoleViewer Role = iota
	RoleEditor
	RoleAdmin
)

type reqCtx struct {
	OrgID    int64
	Role     Role
	UserID   int64
	UserName string
	IsAdmin  bool
}

func roleFromHeader(r *http.Request) Role {
	// Check for Grafana admin status
	// Grafana passes user info via headers when using resource handlers
	isGrafanaAdmin := r.Header.Get("X-Grafana-User-IsGrafanaAdmin")
	if isGrafanaAdmin == "true" {
		return RoleAdmin
	}

	// Check for role override header (for testing)
	v := strings.ToLower(r.Header.Get("X-Role"))
	switch v {
	case "admin":
		return RoleAdmin
	case "editor":
		return RoleEditor
	default:
		// Try to infer from Grafana role headers
		grafanaRole := strings.ToLower(r.Header.Get("X-Grafana-Role"))
		switch grafanaRole {
		case "admin":
			return RoleAdmin
		case "editor":
			return RoleEditor
		default:
			return RoleViewer
		}
	}
}

func getUserFromRequest(r *http.Request) (int64, string) {
	// Try to get user from Grafana headers (X-Grafana-User-Id, X-Grafana-User-Name)
	// Grafana passes these headers for authenticated requests through resource handlers
	userID := int64(1)
	userName := "unknown"

	// Primary: Try Grafana headers (most reliable)
	if uid := r.Header.Get("X-Grafana-User-Id"); uid != "" {
		fmt.Sscanf(uid, "%d", &userID)
	}
	if uname := r.Header.Get("X-Grafana-User-Name"); uname != "" && uname != "user" {
		userName = uname
	}

	// Secondary: Try other possible Grafana headers
	if userName == "unknown" || userName == "user" {
		if uname := r.Header.Get("X-User-Name"); uname != "" {
			userName = uname
		}
	}

	// Fallback for testing
	if userName == "unknown" || userName == "user" {
		if uname := r.Header.Get("X-User"); uname != "" {
			userName = uname
		}
	}

	// Last resort: use user ID as string if nothing else works
	if userName == "unknown" || userName == "user" {
		userName = fmt.Sprintf("user-%d", userID)
	}

	return userID, userName
}

func getOrgFromRequest(r *http.Request) int64 {
	// Get org ID from query parameter (for UI selection)
	if orgParam := r.URL.Query().Get("org_id"); orgParam != "" {
		var orgID int64
		if _, err := fmt.Sscanf(orgParam, "%d", &orgID); err == nil && orgID > 0 {
			return orgID
		}
	}
	// Get org ID from Grafana header
	if orgHeader := r.Header.Get("X-Grafana-Org-Id"); orgHeader != "" {
		var orgID int64
		if _, err := fmt.Sscanf(orgHeader, "%d", &orgID); err == nil && orgID > 0 {
			return orgID
		}
	}
	// Default to org 1
	return 1
}

func allow(have Role, need Role) bool { return int(have) >= int(need) }

// wrap converts handler with reqCtx to standard http.HandlerFunc
func wrap(next func(http.ResponseWriter, *http.Request, reqCtx)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				if appLogger != nil {
					appLogger.Error("panic recovered in handler", nil, map[string]interface{}{
						"path":   r.URL.Path,
						"method": r.Method,
						"panic":  rec,
					})
				}
				writeJSONError(w, http.StatusInternalServerError, "internal server error")
			}
		}()

		role := roleFromHeader(r)
		userID, userName := getUserFromRequest(r)
		orgID := getOrgFromRequest(r)
		isAdmin := role == RoleAdmin || r.Header.Get("X-Grafana-User-IsGrafanaAdmin") == "true"
		next(w, r, reqCtx{OrgID: orgID, Role: role, UserID: userID, UserName: userName, IsAdmin: isAdmin})
	}
}

// rbac wraps a handler and enforces minimum role
func rbac(min Role, next func(http.ResponseWriter, *http.Request, reqCtx)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				if appLogger != nil {
					appLogger.Error("panic recovered in RBAC handler", nil, map[string]interface{}{
						"path":   r.URL.Path,
						"method": r.Method,
						"panic":  rec,
					})
				}
				writeJSONError(w, http.StatusInternalServerError, "internal server error")
			}
		}()

		role := roleFromHeader(r)
		if !allow(role, min) {
			writeJSONError(w, http.StatusForbidden, "forbidden: insufficient role")
			return
		}
		userID, userName := getUserFromRequest(r)
		orgID := getOrgFromRequest(r)
		isAdmin := role == RoleAdmin || r.Header.Get("X-Grafana-User-IsGrafanaAdmin") == "true"
		next(w, r, reqCtx{OrgID: orgID, Role: role, UserID: userID, UserName: userName, IsAdmin: isAdmin})
	}
}
