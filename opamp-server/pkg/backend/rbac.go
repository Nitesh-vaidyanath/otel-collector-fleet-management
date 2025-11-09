package main

import (
	"database/sql"
	"encoding/json"
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
	OrgName  string
	Role     Role
	UserID   int64
	UserName string
	IsAdmin  bool
}

type grafanaContext struct {
	UserID         int64  `json:"UserID"`
	OrgID          int64  `json:"OrgID"`
	OrgName        string `json:"OrgName"`
	OrgRole        string `json:"OrgRole"`
	Login          string `json:"Login"`
	Name           string `json:"Name"`
	IsGrafanaAdmin bool   `json:"IsGrafanaAdmin"`
}

func parseGrafanaContext(r *http.Request) *grafanaContext {
	raw := strings.TrimSpace(r.Header.Get("X-Grafana-Context"))
	if raw == "" {
		return nil
	}
	var ctx grafanaContext
	if err := json.Unmarshal([]byte(raw), &ctx); err != nil {
		return nil
	}
	return &ctx
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
			if ctx := parseGrafanaContext(r); ctx != nil {
				if ctx.IsGrafanaAdmin {
					return RoleAdmin
				}
				switch strings.ToLower(ctx.OrgRole) {
				case "admin":
					return RoleAdmin
				case "editor":
					return RoleEditor
				}
			}
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

	// Grafana context fallback
	if userName == "unknown" || userName == "user" || userID == 1 {
		if ctx := parseGrafanaContext(r); ctx != nil {
			if ctx.UserID > 0 {
				userID = ctx.UserID
			}
			if ctx.Name != "" {
				userName = ctx.Name
			} else if ctx.Login != "" {
				userName = ctx.Login
			}
		}
	}

	// Last resort: use user ID as string if nothing else works
	if userName == "unknown" || userName == "user" {
		userName = fmt.Sprintf("user-%d", userID)
	}

	return userID, userName
}

func resolveOrgContext(r *http.Request) (int64, string) {
	name := strings.TrimSpace(r.Header.Get("X-Scoper-Tenant"))
	if name == "" {
		name = strings.TrimSpace(r.Header.Get("X-Grafana-Org-Name"))
	}
	ctx := parseGrafanaContext(r)
	if name == "" && ctx != nil && strings.TrimSpace(ctx.OrgName) != "" {
		name = ctx.OrgName
	}
	if name == "" {
		name = "Default Organization"
	}
	if id, ok := ensureOrgIDByName(name); ok {
		return id, name
	}
	if ctx != nil && ctx.OrgID > 0 {
		return ctx.OrgID, name
	}
	numericSources := []string{
		r.Header.Get("X-Scoper-Org-Id"),
		r.Header.Get("X-Scoper-OrgID"),
		r.URL.Query().Get("org_id"),
		r.Header.Get("X-Grafana-Org-Id"),
	}
	for _, raw := range numericSources {
		if raw == "" {
			continue
		}
		var orgID int64
		if _, err := fmt.Sscanf(raw, "%d", &orgID); err == nil && orgID > 0 {
			return orgID, lookupOrgNameByID(orgID)
		}
	}
	return 1, "Default Organization"
}

func lookupOrgNameByID(orgID int64) string {
	db := mustDB()
	defer db.Close()
	var orgName sql.NullString
	if err := db.QueryRow(`SELECT name FROM organizations WHERE id=?`, orgID).Scan(&orgName); err == nil && orgName.Valid && strings.TrimSpace(orgName.String) != "" {
		return orgName.String
	}
	return fmt.Sprintf("Organization %d", orgID)
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
		orgID, orgName := resolveOrgContext(r)
		ctx := parseGrafanaContext(r)
		isAdmin := role == RoleAdmin || r.Header.Get("X-Grafana-User-IsGrafanaAdmin") == "true"
		if ctx != nil && ctx.IsGrafanaAdmin {
			isAdmin = true
		}
		next(w, r, reqCtx{
			OrgID:    orgID,
			OrgName:  orgName,
			Role:     role,
			UserID:   userID,
			UserName: userName,
			IsAdmin:  isAdmin,
		})
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
		orgID, orgName := resolveOrgContext(r)
		ctx := parseGrafanaContext(r)
		isAdmin := role == RoleAdmin || r.Header.Get("X-Grafana-User-IsGrafanaAdmin") == "true"
		if ctx != nil && ctx.IsGrafanaAdmin {
			isAdmin = true
		}
		next(w, r, reqCtx{
			OrgID:    orgID,
			OrgName:  orgName,
			Role:     role,
			UserID:   userID,
			UserName: userName,
			IsAdmin:  isAdmin,
		})
	}
}
