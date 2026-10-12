package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGrafanaAgentPermissionMatrixRejectsUnauthorizedMutationsBeforeDatabase(t *testing.T) {
	router := newAPIMux()
	tests := []struct {
		name   string
		method string
		path   string
		body   string
		role   Role
	}{
		{"viewer cannot save config", http.MethodPost, "/configs", `{}`, RoleViewer},
		{"viewer cannot revert config", http.MethodPost, "/configs/revert", `{}`, RoleViewer},
		{"viewer cannot generate config", http.MethodPost, "/config-generator", `{}`, RoleViewer},
		{"viewer cannot save template", http.MethodPost, "/config-templates", `{}`, RoleViewer},
		{"viewer cannot delete template", http.MethodDelete, "/config-templates?id=1", "", RoleViewer},
		{"viewer cannot add component", http.MethodPost, "/component-types", `{}`, RoleViewer},
		{"viewer cannot edit component", http.MethodPatch, "/component-types", `{}`, RoleViewer},
		{"viewer cannot delete component", http.MethodDelete, "/component-types?id=1", "", RoleViewer},
		{"editor cannot approve config", http.MethodPost, "/configs/1/approve", `{}`, RoleEditor},
		{"editor cannot create deployment", http.MethodPost, "/agent-deployments", `{}`, RoleEditor},
		{"editor cannot restart deployment", http.MethodPost, "/agent-deployments/fleetid/restart", "", RoleEditor},
		{"editor cannot delete deployment", http.MethodDelete, "/agent-deployments/fleetid", "", RoleEditor},
		{"editor cannot change telemetry settings", http.MethodPost, "/telemetry-settings", `{}`, RoleEditor},
		{"editor cannot patch agent", http.MethodPatch, "/agents/agentid", `{}`, RoleEditor},
		{"editor cannot delete agent", http.MethodDelete, "/agents/agentid", "", RoleEditor},
		{"editor cannot delete bridge", http.MethodDelete, "/bridges/bridgeid/delete", "", RoleEditor},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req = req.WithContext(context.WithValue(req.Context(), pluginPrincipalKey{}, pluginPrincipal{
				orgID: 1, grafanaOrgID: 1, orgMapped: true, role: tc.role, userLogin: "test-user",
			}))
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != http.StatusForbidden {
				t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
			}
		})
	}
}

func TestConfigApprovalDirectHandlerRequiresAdmin(t *testing.T) {
	for _, role := range []Role{RoleViewer, RoleEditor} {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/configs/1/approve", strings.NewReader(`{"action":"approve"}`))
		configApprovalHandler(response, request, reqCtx{Role: role, OrgID: 1})
		if response.Code != http.StatusForbidden {
			t.Fatalf("role=%d status=%d", role, response.Code)
		}
	}
}
