package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func securityProfileTestConfig() AgentDeploymentConfig {
	runAsNonRoot := true
	readOnly := true
	return AgentDeploymentConfig{
		Namespace: "agents", OpAMPTokenAudience: managedOpAMPTokenAudience, PermittedNodes: []string{"worker-a", "win-worker"}, PermittedServiceAccounts: []string{"agent-runtime"},
		Profiles: map[string]AgentDeploymentProfile{
			"collector": {Image: "registry.example/collector:1", ServiceAccount: "agent-runtime", SupportsOpAMPTokenFile: true, OpAMPEndpoint: "wss://opamp.example/v1", SecurityProfiles: []string{"restricted", "observer"}, DefaultSecurityProfile: "restricted"},
			"windows":   {Image: "registry.example/windows-agent:1", ServiceAccount: "agent-runtime", SupportsOpAMPTokenFile: true, OpAMPEndpoint: "wss://opamp.example/v1", OS: "windows", SecurityProfiles: []string{"host-process"}, DefaultSecurityProfile: "host-process"},
		},
		SecurityProfiles: map[string]AgentSecurityProfile{
			"restricted":   {OS: "linux", RunAsNonRoot: &runAsNonRoot, ReadOnlyRootFilesystem: &readOnly},
			"observer":     {OS: "linux", Summary: "Host observer", HostPID: true, HostNetwork: true, HostIPC: true, CapabilitiesAdd: []string{"SYS_ADMIN"}, AllowPrivilegeEscalation: true, RunAsNonRoot: &runAsNonRoot, ReadOnlyRootFilesystem: &readOnly},
			"host-process": {OS: "windows", HostProcess: true, HostNetwork: true, RunAsUserName: `NT AUTHORITY\SYSTEM`},
		},
	}
}

func TestSecurityProfileConfigValidation(t *testing.T) {
	base := `{"namespace":"agents","opampTokenAudience":"fleet-opamp","permittedNodes":["worker-a"],"permittedServiceAccounts":["agent-runtime"],"profiles":{"collector":{"image":"registry.example/collector:1","serviceAccount":"agent-runtime","supportsOpampTokenFile":true,"opampEndpoint":"wss://opamp.example/v1"}}}`
	if _, err := LoadAgentDeploymentConfig(base); err != nil {
		t.Fatalf("secure config should receive restricted defaults: %v", err)
	}
	valid := `{"namespace":"agents","opampTokenAudience":"fleet-opamp","permittedNodes":["worker-a"],"permittedServiceAccounts":["agent-runtime"],"securityProfiles":{"observer":{"hostPID":true,"capabilitiesAdd":["SYS_ADMIN"],"allowPrivilegeEscalation":true}},"profiles":{"collector":{"image":"registry.example/collector:1","serviceAccount":"agent-runtime","supportsOpampTokenFile":true,"opampEndpoint":"wss://opamp.example/v1","securityProfiles":["restricted","observer"],"defaultSecurityProfile":"restricted"}}}`
	if _, err := LoadAgentDeploymentConfig(valid); err != nil {
		t.Fatalf("valid elevated operator profile rejected: %v", err)
	}
	for name, profile := range map[string]AgentSecurityProfile{
		"unknown capability":            {CapabilitiesAdd: []string{"NOT_A_CAPABILITY"}},
		"duplicate capability":          {CapabilitiesAdd: []string{"NET_ADMIN", "NET_ADMIN"}},
		"sys admin without escalation":  {CapabilitiesAdd: []string{"SYS_ADMIN"}},
		"privileged without escalation": {Privileged: true},
		"windows linux field":           {OS: "windows", HostPID: true},
		"host process without network":  {OS: "windows", HostProcess: true, RunAsUserName: "SYSTEM"},
		"host process without user":     {OS: "windows", HostProcess: true, HostNetwork: true},
		"linux host process field":      {RunAsUserName: "SYSTEM"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := validateAgentSecurityProfile("test", profile); err == nil {
				t.Fatal("invalid profile accepted")
			}
		})
	}
}

func TestSecurityProfileRenderAndUpdatePreserveRuntimeAndRolloutStatus(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := NewAgentDeploymentService(securityProfileTestConfig(), adapter)
	created, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 21, Owner: "admin.login"})
	if err != nil {
		t.Fatal(err)
	}
	before := adapter.created[0]
	manifest := kubernetesDeploymentFromManifest(before)
	body, _ := json.Marshal(manifest)
	for _, expected := range []string{`"nodeSelector":{"kubernetes.io/os":"linux"}`, `"drop":["ALL"]`, `"runAsNonRoot":true`, `"readOnlyRootFilesystem":true`} {
		if !strings.Contains(string(body), expected) {
			t.Errorf("restricted manifest missing %s: %s", expected, body)
		}
	}
	for _, forbidden := range []string{`"hostPID":true`, `"hostNetwork":true`, `"privileged":true`, `"SYS_ADMIN"`} {
		if strings.Contains(string(body), forbidden) {
			t.Errorf("restricted manifest contains %s: %s", forbidden, body)
		}
	}
	updated, err := service.UpdateSecurityProfile(context.Background(), created.FleetID, 21, "admin.login", "observer", created.UID, "1")
	if err != nil {
		t.Fatal(err)
	}
	if updated.SecurityProfile != "observer" || updated.SecurityProfileHash == "" || updated.Status != "Updating" || updated.Generation != 1 || updated.ObservedGeneration != 0 {
		t.Fatalf("security update response lacks profile/hash/rollout: %#v", updated)
	}
	got := adapter.objects[adapter.key(created.Namespace, created.Name)]
	if got.Image != before.Image || got.ServiceAccount != before.ServiceAccount || strings.Join(got.Command, "\x00") != strings.Join(before.Command, "\x00") || strings.Join(got.Args, "\x00") != strings.Join(before.Args, "\x00") || got.OpAMPEndpoint != before.OpAMPEndpoint || got.NodeAffinityValues[0] != "worker-a" || got.Replicas != before.Replicas || got.Security.Privileged || !got.HostPID || !got.HostNetwork || !got.HostIPC || !containsString(got.Security.CapabilitiesAdd, "SYS_ADMIN") {
		t.Fatalf("security profile update changed runtime or failed to apply security: %#v", got)
	}
	if _, err := service.UpdateSecurityProfile(context.Background(), created.FleetID, 21, "admin.login", "restricted", created.UID, "1"); !errors.Is(err, ErrAgentDeploymentConflict) {
		t.Fatalf("stale RV error=%v", err)
	}
	if _, err := service.UpdateSecurityProfile(context.Background(), created.FleetID, 22, "admin.login", "restricted", created.UID, "2"); !errors.Is(err, ErrAgentDeploymentForbidden) {
		t.Fatalf("cross-org error=%v", err)
	}
	if err := service.Stop(context.Background(), created.FleetID, 21, "admin.login"); err != nil {
		t.Fatal(err)
	}
	stopped, err := service.UpdateSecurityProfile(context.Background(), created.FleetID, 21, "admin.login", "restricted", created.UID, "3")
	if err != nil {
		t.Fatal(err)
	}
	if stopped.DesiredReplicas != 0 || adapter.objects[adapter.key(created.Namespace, created.Name)].Replicas != 0 {
		t.Fatalf("security update changed stopped replica count: record=%#v manifest=%#v", stopped, adapter.objects[adapter.key(created.Namespace, created.Name)])
	}
	other, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 21, Owner: "admin.login"})
	if err != nil {
		t.Fatal(err)
	}
	otherManifest := adapter.objects[adapter.key(other.Namespace, other.Name)]
	otherManifest.OS = "windows"
	otherManifest.NodeSelector["kubernetes.io/os"] = "windows"
	adapter.objects[adapter.key(other.Namespace, other.Name)] = otherManifest
	beforeUpdates := adapter.securityUpdates
	if _, err := service.UpdateSecurityProfile(context.Background(), other.FleetID, 21, "admin.login", "observer", other.UID, other.ResourceVersion); !errors.Is(err, ErrAgentDeploymentConflict) {
		t.Fatalf("OS mismatch was accepted: %v", err)
	}
	if adapter.securityUpdates != beforeUpdates {
		t.Fatal("OS mismatch reached the adapter")
	}
}

func TestWindowsSecurityManifestOmitsLinuxFields(t *testing.T) {
	service := NewAgentDeploymentService(securityProfileTestConfig(), newFakeAgentDeploymentAdapter())
	created, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "windows", Node: "win-worker", OrgID: 21, Owner: "admin.login"})
	if err != nil {
		t.Fatal(err)
	}
	manifest := kubernetesDeploymentFromManifest(service.adapter.(*fakeAgentDeploymentAdapter).created[0])
	body, _ := json.Marshal(manifest)
	for _, expected := range []string{`"os":{"name":"windows"}`, `"nodeSelector":{"kubernetes.io/os":"windows"}`, `"hostProcess":true`, `"runAsUserName":"NT AUTHORITY\\SYSTEM"`} {
		if !strings.Contains(string(body), expected) {
			t.Errorf("Windows manifest missing %s: %s", expected, body)
		}
	}
	for _, forbidden := range []string{`"hostPID"`, `"hostIPC"`, `"privileged"`, `"capabilities"`, `"runAsNonRoot"`} {
		if strings.Contains(string(body), forbidden) {
			t.Errorf("Windows manifest contains Linux field %s: %s", forbidden, body)
		}
	}
	if created.SecurityProfile != "host-process" {
		t.Fatalf("unexpected default security profile: %#v", created)
	}
}

func TestSecurityProfileUpdateHTTPRoleOwnershipAndInputBoundary(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := NewAgentDeploymentService(securityProfileTestConfig(), adapter)
	created, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 41, Owner: "user.login"})
	if err != nil {
		t.Fatal(err)
	}
	previous := agentDeploymentServiceProvider
	agentDeploymentServiceProvider = func() (*AgentDeploymentService, error) { return service, nil }
	t.Cleanup(func() { agentDeploymentServiceProvider = previous })
	router := newAPIMux()
	createRequest := httptest.NewRequest(http.MethodPost, "/agent-deployments", strings.NewReader(`{"profile":"collector","node":"worker-a","securityProfile":"observer"}`))
	createPrincipal := pluginPrincipal{orgID: 41, grafanaOrgID: 77, orgMapped: true, role: RoleAdmin, user: "user.login", userLogin: "user.login"}
	createRequest = createRequest.WithContext(context.WithValue(createRequest.Context(), pluginPrincipalKey{}, createPrincipal))
	createResponse := httptest.NewRecorder()
	router.ServeHTTP(createResponse, createRequest)
	if createResponse.Code != http.StatusAccepted {
		t.Fatalf("Admin create with permitted security profile status=%d body=%s", createResponse.Code, createResponse.Body)
	}
	var selected AgentDeploymentRecord
	if err := json.Unmarshal(createResponse.Body.Bytes(), &selected); err != nil {
		t.Fatal(err)
	}
	if selected.SecurityProfile != "observer" || selected.ResourceVersion == "" {
		t.Fatalf("create did not return selected profile and RV: %#v", selected)
	}
	makeRequest := func(role Role, login string, orgID int64, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/agent-deployments/"+created.FleetID+"/security-profile", strings.NewReader(body))
		principal := pluginPrincipal{orgID: orgID, grafanaOrgID: 77, orgMapped: true, role: role, user: login, userLogin: login}
		req = req.WithContext(context.WithValue(req.Context(), pluginPrincipalKey{}, principal))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	body := `{"securityProfile":"observer","uid":"` + created.UID + `","resourceVersion":"1"}`
	if got := makeRequest(RoleViewer, "user.login", 41, body); got.Code != http.StatusForbidden {
		t.Fatalf("Viewer status=%d", got.Code)
	}
	if got := makeRequest(RoleEditor, "user.login", 41, body); got.Code != http.StatusForbidden {
		t.Fatalf("Editor status=%d", got.Code)
	}
	if got := makeRequest(RoleAdmin, "other.login", 41, body); got.Code != http.StatusForbidden {
		t.Fatalf("cross-owner status=%d", got.Code)
	}
	if got := makeRequest(RoleAdmin, "user.login", 42, body); got.Code != http.StatusForbidden {
		t.Fatalf("cross-org status=%d", got.Code)
	}
	if got := makeRequest(RoleAdmin, "user.login", 41, `{"securityProfile":"observer","uid":"`+created.UID+`","resourceVersion":"1","hostPID":true}`); got.Code != http.StatusBadRequest {
		t.Fatalf("raw field injection status=%d body=%s", got.Code, got.Body)
	}
	updatedResponse := makeRequest(RoleAdmin, "user.login", 41, body)
	if updatedResponse.Code != http.StatusOK {
		t.Fatalf("Admin update status=%d body=%s", updatedResponse.Code, updatedResponse.Body)
	}
	var updatedRecord AgentDeploymentRecord
	if err := json.Unmarshal(updatedResponse.Body.Bytes(), &updatedRecord); err != nil {
		t.Fatal(err)
	}
	if updatedRecord.Status != "Updating" || updatedRecord.ResourceVersion != "2" || updatedRecord.Security.HostPID == nil || !*updatedRecord.Security.HostPID || updatedRecord.Security.CapabilitiesDrop[0] != "ALL" {
		t.Fatalf("update response missing resolved security or rollout data: %#v", updatedRecord)
	}
	if got := makeRequest(RoleAdmin, "user.login", 41, body); got.Code != http.StatusConflict {
		t.Fatalf("stale update status=%d body=%s", got.Code, got.Body)
	}
	if adapter.securityUpdates != 1 {
		t.Fatalf("security updates=%d", adapter.securityUpdates)
	}

	deniedRecord, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 41, Owner: "user.login"})
	if err != nil {
		t.Fatal(err)
	}
	adapter.rejectSecurityUpdate = true
	deniedRequest := httptest.NewRequest(http.MethodPost, "/agent-deployments/"+deniedRecord.FleetID+"/security-profile", strings.NewReader(`{"securityProfile":"observer","uid":"`+deniedRecord.UID+`","resourceVersion":"`+deniedRecord.ResourceVersion+`"}`))
	deniedRequest = deniedRequest.WithContext(context.WithValue(deniedRequest.Context(), pluginPrincipalKey{}, createPrincipal))
	deniedResponse := httptest.NewRecorder()
	router.ServeHTTP(deniedResponse, deniedRequest)
	if deniedResponse.Code != http.StatusBadGateway || adapter.securityUpdates != 1 {
		t.Fatalf("admission denial status=%d body=%s calls=%d", deniedResponse.Code, deniedResponse.Body, adapter.securityUpdates)
	}
	if strings.Contains(deniedResponse.Body.String(), "admission denied") {
		t.Fatalf("raw Kubernetes admission detail was exposed: %s", deniedResponse.Body)
	}
}

func TestKubernetesSecurityUpdateUsesJSONPatchPreconditionsAndAdmissionErrors(t *testing.T) {
	tokenPath := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenPath, []byte("synthetic-token"), 0600); err != nil {
		t.Fatal(err)
	}
	var contentType string
	var operations []map[string]any
	transport := deploymentRoundTripper(func(r *http.Request) (*http.Response, error) {
		contentType = r.Header.Get("Content-Type")
		if r.Method != http.MethodPatch {
			t.Fatalf("method=%s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&operations); err != nil {
			t.Fatal(err)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{}`)), Request: r}, nil
	})
	adapter := &InClusterAgentDeploymentAdapter{baseURL: "https://kubernetes.invalid/apis/apps/v1", tokenPath: tokenPath, client: &http.Client{Transport: transport}}
	current := AgentDeploymentManifest{Namespace: "agents", Name: "fleet-agent-test", UID: "kube-uid", ResourceVersion: "9", Labels: map[string]string{"fleet.grafana.com/id": "fleet-id"}, Annotations: map[string]string{"owner-login": "owner"}, TemplateLabels: map[string]string{"fleet.grafana.com/id": "fleet-id"}, NodeSelector: map[string]string{"example.com/pool": "blue"}, ContainerCount: 1, PodSecurityContextPresent: true, ContainerSecurityContextPresent: true}
	updated := current
	updated.OS = "linux"
	updated.SecurityProfile = "observer"
	updated.SecurityProfileHash = "sha256"
	updated.HostPID = true
	updated.Security = AgentContainerSecurity{RunAsNonRoot: true, ReadOnlyRootFilesystem: true, CapabilitiesDrop: []string{"ALL"}, CapabilitiesAdd: []string{"SYS_ADMIN"}, AllowPrivilegeEscalation: true}
	if err := adapter.UpdateSecurity(context.Background(), current, updated); err != nil {
		t.Fatal(err)
	}
	if contentType != "application/json-patch+json" || len(operations) < 10 {
		t.Fatalf("content-type=%q operations=%#v", contentType, operations)
	}
	if operations[0]["op"] != "test" || operations[0]["path"] != "/metadata/uid" || operations[1]["op"] != "test" || operations[1]["path"] != "/metadata/resourceVersion" {
		t.Fatalf("missing Kubernetes identity preconditions: %#v", operations[:2])
	}
	for _, operation := range operations {
		if operation["path"] == "/spec/template" || operation["path"] == "/spec" {
			t.Fatalf("patch rewrites full template: %#v", operation)
		}
	}
	applicationFixture := map[string]any{
		"metadata": map[string]any{"uid": "kube-uid", "resourceVersion": "9", "labels": map[string]any{"fleet.grafana.com/id": "fleet-id"}, "annotations": map[string]any{"owner-login": "owner", "admission.example/keep": "top"}},
		"spec": map[string]any{"template": map[string]any{"metadata": map[string]any{"labels": map[string]any{"fleet.grafana.com/id": "fleet-id"}}, "spec": map[string]any{
			"nodeSelector": map[string]any{"example.com/pool": "blue"}, "hostNetwork": true, "restartPolicy": "Always",
			"securityContext": map[string]any{"seccompProfile": map[string]any{"type": "RuntimeDefault"}},
			"containers":      []any{map[string]any{"name": "agent", "securityContext": map[string]any{"seLinuxOptions": map[string]any{"level": "s0:c1,c2"}}}},
		}}},
	}
	applySecurityJSONPatch(t, applicationFixture, operations)
	templateSpec := applicationFixture["spec"].(map[string]any)["template"].(map[string]any)["spec"].(map[string]any)
	if templateSpec["nodeSelector"].(map[string]any)["example.com/pool"] != "blue" || templateSpec["restartPolicy"] != "Always" || templateSpec["securityContext"].(map[string]any)["seccompProfile"].(map[string]any)["type"] != "RuntimeDefault" {
		t.Fatalf("patch did not preserve unrelated pod settings: %#v", templateSpec)
	}
	security := templateSpec["containers"].([]any)[0].(map[string]any)["securityContext"].(map[string]any)
	if security["seLinuxOptions"].(map[string]any)["level"] != "s0:c1,c2" || security["privileged"] != false || security["capabilities"].(map[string]any)["drop"].([]any)[0] != "ALL" {
		t.Fatalf("patch did not preserve injected container fields or apply safe security: %#v", security)
	}
	racingAdapter := &InClusterAgentDeploymentAdapter{baseURL: "https://kubernetes.invalid/apis/apps/v1", tokenPath: tokenPath, client: &http.Client{Transport: deploymentRoundTripper(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusUnprocessableEntity, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"message":"testing value failed"}`)), Request: r}, nil
	})}}
	if err := racingAdapter.UpdateSecurity(context.Background(), current, updated); !errors.Is(err, ErrAgentDeploymentConflict) {
		t.Fatalf("JSON Patch test race error=%v", err)
	}

	windowsOperations := []map[string]any{}
	windowsAdapter := &InClusterAgentDeploymentAdapter{baseURL: "https://kubernetes.invalid/apis/apps/v1", tokenPath: tokenPath, client: &http.Client{Transport: deploymentRoundTripper(func(r *http.Request) (*http.Response, error) {
		if err := json.NewDecoder(r.Body).Decode(&windowsOperations); err != nil {
			t.Fatal(err)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{}`)), Request: r}, nil
	})}}
	windowsCurrent := AgentDeploymentManifest{Namespace: "agents", Name: "win-test", UID: "win-uid", ResourceVersion: "4", OS: "windows", Labels: map[string]string{"fleet.grafana.com/id": "win-id"}, TemplateLabels: map[string]string{"fleet.grafana.com/id": "win-id"}, NodeSelector: map[string]string{"kubernetes.io/os": "windows", "admission.example/pool": "win"}, PodOSPresent: true, ContainerCount: 1, ContainerSecurityContextPresent: true, WindowsOptionsPresent: true}
	windowsUpdated := windowsCurrent
	windowsUpdated.SecurityProfile = "host-process"
	windowsUpdated.SecurityProfileHash = "win-hash"
	windowsUpdated.HostNetwork = true
	windowsUpdated.HostProcess = true
	windowsUpdated.RunAsUserName = `NT AUTHORITY\SYSTEM`
	if err := windowsAdapter.UpdateSecurity(context.Background(), windowsCurrent, windowsUpdated); err != nil {
		t.Fatal(err)
	}
	windowsFixture := map[string]any{"metadata": map[string]any{"uid": "win-uid", "resourceVersion": "4", "labels": map[string]any{"fleet.grafana.com/id": "win-id"}}, "spec": map[string]any{"template": map[string]any{"metadata": map[string]any{"labels": map[string]any{"fleet.grafana.com/id": "win-id"}}, "spec": map[string]any{"nodeSelector": map[string]any{"kubernetes.io/os": "windows", "admission.example/pool": "win"}, "os": map[string]any{"name": "windows"}, "containers": []any{map[string]any{"name": "agent", "securityContext": map[string]any{"windowsOptions": map[string]any{"runAsUserName": "old-user"}}}}}}}}
	applySecurityJSONPatch(t, windowsFixture, windowsOperations)
	windowsContainer := windowsFixture["spec"].(map[string]any)["template"].(map[string]any)["spec"].(map[string]any)["containers"].([]any)[0].(map[string]any)
	if windowsContainer["securityContext"].(map[string]any)["windowsOptions"].(map[string]any)["hostProcess"] != true || windowsContainer["securityContext"].(map[string]any)["windowsOptions"].(map[string]any)["runAsUserName"] != `NT AUTHORITY\SYSTEM` || windowsContainer["securityContext"].(map[string]any)["runAsUser"] != nil {
		t.Fatalf("Windows patch did not safely update optional fields: %#v", windowsContainer)
	}
	if windowsFixture["spec"].(map[string]any)["template"].(map[string]any)["spec"].(map[string]any)["nodeSelector"].(map[string]any)["admission.example/pool"] != "win" {
		t.Fatal("Windows patch replaced unrelated nodeSelector value")
	}

	fake := newFakeAgentDeploymentAdapter()
	service := NewAgentDeploymentService(securityProfileTestConfig(), fake)
	created, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 3, Owner: "owner"})
	if err != nil {
		t.Fatal(err)
	}
	fake.rejectSecurityUpdate = true
	if _, err := service.UpdateSecurityProfile(context.Background(), created.FleetID, 3, "owner", "observer", created.UID, "1"); err == nil {
		t.Fatal("admission failure returned success")
	}
	if fake.securityUpdates != 0 {
		t.Fatal("denied admission mutated fake workload")
	}
}

func applySecurityJSONPatch(t *testing.T, root map[string]any, operations []map[string]any) {
	t.Helper()
	for _, operation := range operations {
		path, ok := operation["path"].(string)
		if !ok || !strings.HasPrefix(path, "/") {
			t.Fatalf("invalid JSON Patch path: %#v", operation)
		}
		parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
		for i, part := range parts {
			parts[i] = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
		}
		parent, err := jsonPatchParent(root, parts[:len(parts)-1])
		if err != nil {
			t.Fatalf("resolve parent for %s: %v", path, err)
		}
		last := parts[len(parts)-1]
		object, ok := parent.(map[string]any)
		if !ok {
			t.Fatalf("parent for %s is not an object: %T", path, parent)
		}
		switch operation["op"] {
		case "test":
			actual, exists := object[last]
			if !exists || !reflect.DeepEqual(actual, operation["value"]) {
				t.Fatalf("JSON Patch test failed at %s: have %#v want %#v", path, actual, operation["value"])
			}
		case "add":
			object[last] = operation["value"]
		default:
			t.Fatalf("unsupported test JSON Patch op %v", operation["op"])
		}
	}
}

func jsonPatchParent(root any, parts []string) (any, error) {
	current := root
	for _, part := range parts {
		switch value := current.(type) {
		case map[string]any:
			next, ok := value[part]
			if !ok {
				return nil, errors.New("missing object parent " + part)
			}
			current = next
		case []any:
			index, err := strconv.Atoi(part)
			if err != nil || index < 0 || index >= len(value) {
				return nil, errors.New("invalid array index " + part)
			}
			current = value[index]
		default:
			return nil, errors.New("non-container parent")
		}
	}
	return current, nil
}
