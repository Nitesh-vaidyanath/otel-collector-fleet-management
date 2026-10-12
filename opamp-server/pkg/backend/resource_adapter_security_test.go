package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type capturedResourceResponse struct{ response *backend.CallResourceResponse }

func (c *capturedResourceResponse) Send(response *backend.CallResourceResponse) error {
	c.response = response
	return nil
}

func TestResourceAdapterIgnoresCallerRoleAndIdentityHeaders(t *testing.T) {
	var observed reqCtx
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observed = getRequestContext(r)
		if r.Header.Get("X-Role") != "" || r.Header.Get("X-Grafana-Org-Role") != "" {
			t.Error("caller identity headers reached the production request")
		}
		w.WriteHeader(http.StatusOK)
	})
	sender := &capturedResourceResponse{}
	req := &backend.CallResourceRequest{
		Path: "/", Method: http.MethodGet,
		PluginContext: backend.PluginContext{OrgID: 42, User: &backend.User{Name: "Editor Display", Login: "editor", Role: "Viewer"}},
		Headers:       map[string][]string{"X-Role": {"admin"}, "X-Grafana-Org-Role": {"Admin"}, "X-User": {"spoofed"}},
	}
	if err := newResourceAdapterWithOrgLookup(handler, func(grafanaOrgID int64) (int64, bool) {
		if grafanaOrgID == 42 {
			return 900, true
		}
		return 0, false
	}).CallResource(context.Background(), req, sender); err != nil {
		t.Fatal(err)
	}
	if observed.Role != RoleViewer || observed.OrgID != 900 || observed.GrafanaOrgID != 42 || observed.UserName != "Editor Display" || observed.UserLogin != "editor" {
		t.Fatalf("identity was not sourced from PluginContext: %#v", observed)
	}
	if sender.response == nil || sender.response.Status != http.StatusOK {
		t.Fatalf("unexpected adapter response: %#v", sender.response)
	}
}

func TestUnmappedGrafanaOrganizationFailsClosedDespiteSpoofedHeaders(t *testing.T) {
	called := false
	handler := wrap(func(w http.ResponseWriter, _ *http.Request, _ reqCtx) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	sender := &capturedResourceResponse{}
	req := &backend.CallResourceRequest{
		Path: "/agents", Method: http.MethodGet,
		PluginContext: backend.PluginContext{OrgID: 42, User: &backend.User{Login: "viewer", Role: "Viewer"}},
		Headers: map[string][]string{
			"X-Role": {"admin"}, "X-Scoper-Org-Id": {"900"},
			"X-Grafana-Context": {`{"OrgID":900,"OrgRole":"Admin"}`},
		},
	}
	if err := newResourceAdapterWithOrgLookup(handler, func(grafanaOrgID int64) (int64, bool) {
		if grafanaOrgID == 42 {
			return 0, false
		}
		return grafanaOrgID, true
	}).CallResource(context.Background(), req, sender); err != nil {
		t.Fatal(err)
	}
	if called {
		t.Fatal("handler ran for an unmapped Grafana organization")
	}
	if sender.response == nil || sender.response.Status != http.StatusForbidden {
		t.Fatalf("unmapped organization should be forbidden, got %#v", sender.response)
	}
}

func TestProductionHTTPResourceRequestsCannotAuthenticateWithHeaders(t *testing.T) {
	if allowHeaderIdentityFallback() {
		t.Skip("standalone build intentionally retains the local test pathway")
	}
	called := false
	handler := wrap(func(w http.ResponseWriter, _ *http.Request, _ reqCtx) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodPost, "/agents/agent-1/operations", strings.NewReader(`{"action":"upgrade"}`))
	req.Header.Set("X-Role", "Admin")
	req.Header.Set("X-Scoper-Org-Id", "900")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	if called || recorder.Code != http.StatusForbidden {
		t.Fatalf("untrusted HTTP request reached handler: called=%v status=%d", called, recorder.Code)
	}
}

func TestAgentOperationsDenyUnauthorizedActionsBeforeDatabaseAccess(t *testing.T) {
	for _, tc := range []struct {
		name   string
		role   Role
		action string
	}{
		{name: "viewer cannot push config", role: RoleViewer, action: "push-config"},
		{name: "editor cannot restart", role: RoleEditor, action: "upgrade"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/agents/agent-1/operations", strings.NewReader(`{"action":"`+tc.action+`"}`))
			resp := httptest.NewRecorder()
			agentOperationsHandler(resp, req, reqCtx{Role: tc.role, OrgID: 42})
			if resp.Code != http.StatusForbidden {
				t.Fatalf("status=%d body=%s", resp.Code, resp.Body.String())
			}
		})
	}
}

func TestAgentRestartRequiresTrustedLoginAndTenantOwnedTarget(t *testing.T) {
	request := func(action string) *http.Request {
		return httptest.NewRequest(http.MethodPost, "/agents/target-uid/operations", strings.NewReader(`{"action":"`+action+`"}`))
	}
	admin := reqCtx{Role: RoleAdmin, OrgID: 12, UserName: "Administrator"}
	response := httptest.NewRecorder()
	agentOperationsHandler(response, request("restart"), admin)
	if response.Code != http.StatusForbidden {
		t.Fatalf("restart without trusted login should be denied, got %d", response.Code)
	}

	previousLookup := agentTargetInOrganization
	agentTargetInOrganization = func(orgID int64, uid string) (bool, error) {
		if orgID != 12 || uid != "target-uid" {
			t.Fatalf("ownership lookup got org=%d uid=%q", orgID, uid)
		}
		return false, nil
	}
	t.Cleanup(func() { agentTargetInOrganization = previousLookup })
	admin.UserLogin = "admin-login"
	response = httptest.NewRecorder()
	agentOperationsHandler(response, request("restart"), admin)
	if response.Code != http.StatusNotFound {
		t.Fatalf("cross-tenant restart target should be hidden, got %d body=%s", response.Code, response.Body.String())
	}
}

func TestConfigPushRequiresTrustedLoginBeforeDatabaseAccess(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/agents/target-uid/operations", strings.NewReader(`{"action":"push-config","config":"receivers: {}"}`))
	response := httptest.NewRecorder()
	agentOperationsHandler(response, req, reqCtx{Role: RoleEditor, OrgID: 12, UserName: "Display Name"})
	if response.Code != http.StatusForbidden {
		t.Fatalf("config push without trusted login should be denied, got %d", response.Code)
	}
}
