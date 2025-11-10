package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type Role int

const (
	RoleViewer Role = iota
	RoleEditor
	RoleAdmin
)

type reqCtx struct {
	OrgID           int64
	OrgName         string
	GrafanaOrgID    int64
	GrafanaOrgName  string
	Role            Role
	UserID          int64
	UserName        string
	UserDisplayName string
	IsAdmin         bool
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
		if grafanaRole == "" {
			grafanaRole = strings.ToLower(r.Header.Get("X-Grafana-Org-Role"))
		}
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

func getUserFromRequest(r *http.Request, ctx *grafanaContext) (int64, string) {
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
		if ctx != nil {
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

func splitTrailingNumericToken(value string) (string, int64, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", 0, false
	}
	fields := strings.Fields(trimmed)
	if len(fields) < 2 {
		return trimmed, 0, false
	}
	last := fields[len(fields)-1]
	if id, err := strconv.ParseInt(last, 10, 64); err == nil {
		name := strings.Join(fields[:len(fields)-1], " ")
		return strings.TrimSpace(name), id, true
	}
	return trimmed, 0, false
}

func detectGrafanaOrg(r *http.Request, ctx *grafanaContext) (int64, string) {
	numericHeaders := []string{
		r.Header.Get("X-Scoper-Org-Id"),
		r.Header.Get("X-Scoper-OrgID"),
		r.Header.Get("X-Grafana-Org-Id"),
		r.URL.Query().Get("org_id"),
	}
	for _, raw := range numericHeaders {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		if id, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64); err == nil && id > 0 {
			name := strings.TrimSpace(r.Header.Get("X-Scoper-Org-Name"))
			if name == "" && ctx != nil && strings.TrimSpace(ctx.OrgName) != "" {
				name = ctx.OrgName
			}
			if name == "" {
				name = fmt.Sprintf("Organization %d", id)
			}
			return id, name
		}
	}

	if ctx != nil && ctx.OrgID > 0 {
		name := ctx.OrgName
		if name == "" {
			name = fmt.Sprintf("Organization %d", ctx.OrgID)
		}
		return ctx.OrgID, name
	}

	tenantHeader := strings.TrimSpace(r.Header.Get("X-Scoper-Tenant"))
	if tenantHeader == "" {
		tenantHeader = strings.TrimSpace(r.Header.Get("X-Grafana-Org-Name"))
	}
	if tenantHeader != "" {
		if name, id, ok := splitTrailingNumericToken(tenantHeader); ok {
			return id, name
		}
		return 0, tenantHeader
	}

	return 0, ""
}

func resolveOrgContext(r *http.Request, ctx *grafanaContext) (int64, string, int64, string) {
	grafanaOrgID, grafanaOrgName := detectGrafanaOrg(r, ctx)

	name := strings.TrimSpace(r.Header.Get("X-Scoper-Tenant"))
	if name == "" {
		name = strings.TrimSpace(r.Header.Get("X-Grafana-Org-Name"))
	}
	if name == "" && grafanaOrgName != "" {
		name = grafanaOrgName
	}
	if name == "" && ctx != nil && strings.TrimSpace(ctx.OrgName) != "" {
		name = ctx.OrgName
	}
	if parsedName, parsedID, ok := splitTrailingNumericToken(name); ok {
		name = parsedName
		if grafanaOrgID == 0 {
			grafanaOrgID = parsedID
			grafanaOrgName = parsedName
		}
	}
	if name == "" {
		name = "Default Organization"
	}

	orgID := int64(1)
	if id, ok := ensureOrgIDByName(name); ok {
		orgID = id
	}

	if grafanaOrgName == "" {
		grafanaOrgName = name
	}
	if grafanaOrgID == 0 {
		grafanaOrgID = orgID
	}

	return orgID, name, grafanaOrgID, grafanaOrgName
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

		ctx := parseGrafanaContext(r)
		role := roleFromHeader(r)
		orgID, orgName, grafanaOrgID, grafanaOrgName := resolveOrgContext(r, ctx)
		userID, rawUserName := getUserFromRequest(r, ctx)
		displayName := sanitizeDisplayName(rawUserName, grafanaOrgID)
		isAdmin := role == RoleAdmin || r.Header.Get("X-Grafana-User-IsGrafanaAdmin") == "true"
		if ctx != nil && ctx.IsGrafanaAdmin {
			isAdmin = true
		}
		next(w, r, reqCtx{
			OrgID:           orgID,
			OrgName:         orgName,
			GrafanaOrgID:    grafanaOrgID,
			GrafanaOrgName:  grafanaOrgName,
			Role:            role,
			UserID:          userID,
			UserName:        displayName,
			UserDisplayName: displayName,
			IsAdmin:         isAdmin,
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

		ctx := parseGrafanaContext(r)
		role := roleFromHeader(r)
		if !allow(role, min) {
			writeJSONError(w, http.StatusForbidden, "forbidden: insufficient role")
			return
		}
		orgID, orgName, grafanaOrgID, grafanaOrgName := resolveOrgContext(r, ctx)
		userID, rawUserName := getUserFromRequest(r, ctx)
		displayName := sanitizeDisplayName(rawUserName, grafanaOrgID)
		isAdmin := role == RoleAdmin || r.Header.Get("X-Grafana-User-IsGrafanaAdmin") == "true"
		if ctx != nil && ctx.IsGrafanaAdmin {
			isAdmin = true
		}
		next(w, r, reqCtx{
			OrgID:           orgID,
			OrgName:         orgName,
			GrafanaOrgID:    grafanaOrgID,
			GrafanaOrgName:  grafanaOrgName,
			Role:            role,
			UserID:          userID,
			UserName:        displayName,
			UserDisplayName: displayName,
			IsAdmin:         isAdmin,
		})
	}
}

func sanitizeDisplayName(value string, trailingID int64) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return trimmed
	}
	if trailingID > 0 {
		suffix := fmt.Sprintf(" %d", trailingID)
		if strings.HasSuffix(trimmed, suffix) {
			trimmed = strings.TrimSpace(strings.TrimSuffix(trimmed, suffix))
			return trimmed
		}
	}
	if cleaned, _, ok := splitTrailingNumericToken(trimmed); ok {
		return cleaned
	}
	return trimmed
}
