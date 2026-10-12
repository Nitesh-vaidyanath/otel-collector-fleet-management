package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// These tests never connect to a real Kubernetes API or load host credentials.
// Grafana identities are synthetic SDK contexts and deployment operations use
// either an in-memory adapter or an HTTP transport that captures requests.
func TestAgentPrivilegeCreateFieldsRejectedForEveryGrafanaRole(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	previous := agentDeploymentServiceProvider
	agentDeploymentServiceProvider = func() (*AgentDeploymentService, error) { return enabledDeploymentService(adapter), nil }
	t.Cleanup(func() { agentDeploymentServiceProvider = previous })
	resource := newResourceAdapterWithOrgLookup(newHTTPHandler(), func(int64) (int64, bool) { return 41, true })
	fields := []struct{ name, json string }{
		{"hostPID", `"hostPID":true`},
		{"hostNetwork", `"hostNetwork":true`},
		{"hostIPC", `"hostIPC":true`},
		{"hostProcess", `"hostProcess":true`},
		{"windowsHostProcess", `"securityContext":{"windowsOptions":{"hostProcess":true}}`},
		{"privileged", `"privileged":true`},
		{"privilegedSecurityContext", `"securityContext":{"privileged":true}`},
		{"SYS_ADMIN", `"capabilities":{"add":["SYS_ADMIN"]}`},
		{"SYS_PTRACE", `"capabilities":{"add":["SYS_PTRACE"]}`},
		{"privilegeEscalation", `"allowPrivilegeEscalation":true`},
		{"podSpec", `"spec":{"hostPID":true,"hostNetwork":true}`},
		{"hostPath", `"volumes":[{"name":"host","hostPath":{"path":"/"}}]`},
	}
	for _, role := range []string{"Viewer", "Editor", "Admin"} {
		for _, field := range fields {
			t.Run(role+"/"+field.name, func(t *testing.T) {
				sender := &capturedResourceResponse{}
				err := resource.CallResource(context.Background(), &backend.CallResourceRequest{
					Method: http.MethodPost, Path: "/plugin-api/agent-deployments",
					Body:          []byte(`{"profile":"collector","node":"worker-a",` + field.json + `}`),
					PluginContext: backend.PluginContext{OrgID: 77, User: &backend.User{Login: "synthetic-user", Role: role}},
					Headers:       map[string][]string{"X-Role": {"Admin"}}, // A caller cannot promote itself.
				}, sender)
				if err != nil {
					t.Fatal(err)
				}
				want := http.StatusForbidden
				if role == "Admin" {
					want = http.StatusBadRequest
				}
				if sender.response == nil || sender.response.Status != want {
					t.Fatalf("want HTTP %d, got %#v", want, sender.response)
				}
				if len(adapter.created) != 0 {
					t.Fatal("privilege injection reached the Kubernetes adapter")
				}
			})
		}
	}
}

func TestAgentPrivilegeFieldsCannotEnterAdministratorProfiles(t *testing.T) {
	config, err := json.Marshal(enabledDeploymentService(newFakeAgentDeploymentAdapter()).config)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{
		`"hostPID":true`, `"hostNetwork":true`, `"hostProcess":true`,
		`"privileged":true`, `"capabilities":{"add":["SYS_ADMIN","SYS_PTRACE"]}`,
		`"securityContext":{"windowsOptions":{"hostProcess":true}}`,
	} {
		t.Run(field, func(t *testing.T) {
			var raw map[string]any
			if err := json.Unmarshal(config, &raw); err != nil {
				t.Fatal(err)
			}
			var injection map[string]any
			if err := json.Unmarshal([]byte("{"+field+"}"), &injection); err != nil {
				t.Fatal(err)
			}
			profile := raw["profiles"].(map[string]any)["collector"].(map[string]any)
			for key, value := range injection {
				profile[key] = value
			}
			body, _ := json.Marshal(raw)
			if _, err := LoadAgentDeploymentConfig(string(body)); err == nil {
				t.Fatal("privilege field was accepted in the administrator profile")
			}
		})
	}
}

func TestAgentPrivilegeGeneratedKubernetesManifestAndLifecyclePatches(t *testing.T) {
	fake := newFakeAgentDeploymentAdapter()
	record, err := enabledDeploymentService(fake).Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 41, Owner: "synthetic-user"})
	if err != nil {
		t.Fatal(err)
	}
	manifest := kubernetesDeploymentFromManifest(fake.created[0])
	pod := manifest["spec"].(map[string]any)["template"].(map[string]any)["spec"].(map[string]any)
	for _, key := range []string{"hostPID", "hostNetwork", "hostIPC", "shareProcessNamespace"} {
		if _, present := pod[key]; present {
			t.Errorf("generated pod unexpectedly contains %s", key)
		}
	}
	volumes := pod["volumes"].([]any)
	projected := volumes[0].(map[string]any)["projected"].(map[string]any)
	source := projected["sources"].([]any)[0].(map[string]any)["serviceAccountToken"].(map[string]any)
	if source["audience"] != managedOpAMPTokenAudience || source["expirationSeconds"] != 600 || source["path"] != "token" {
		t.Fatalf("unexpected projected token: %#v", source)
	}
	container := pod["containers"].([]any)[0].(map[string]any)
	if container["volumeMounts"].([]any)[0].(map[string]any)["mountPath"] != managedOpAMPTokenMount {
		t.Fatal("projected token mount path mismatch")
	}
	if pod["automountServiceAccountToken"] != false {
		t.Fatal("default Kubernetes API token automount must remain disabled")
	}
	podSecurity := pod["securityContext"].(map[string]any)
	if _, present := podSecurity["windowsOptions"]; present {
		t.Fatal("generated pod enables Windows options")
	}
	security := pod["containers"].([]any)[0].(map[string]any)["securityContext"].(map[string]any)
	if security["privileged"] != false || security["allowPrivilegeEscalation"] != false || security["runAsNonRoot"] != true || security["readOnlyRootFilesystem"] != true {
		t.Fatalf("unsafe container security context: %#v", security)
	}
	capabilities := security["capabilities"].(map[string][]string)
	if len(capabilities["add"]) != 0 || len(capabilities["drop"]) != 1 || capabilities["drop"][0] != "ALL" {
		t.Fatalf("unexpected Linux capabilities: %#v", capabilities)
	}
	tokenFile := filepath.Join(t.TempDir(), "synthetic-token")
	if err := os.WriteFile(tokenFile, []byte("synthetic-test-token"), 0600); err != nil {
		t.Fatal(err)
	}
	var patches []map[string]any
	transport := deploymentRoundTripper(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPatch {
			t.Fatalf("unexpected method %s", request.Method)
		}
		var patch map[string]any
		if err := json.NewDecoder(request.Body).Decode(&patch); err != nil {
			t.Fatal(err)
		}
		patches = append(patches, patch)
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("{}"))}, nil
	})
	adapter := &InClusterAgentDeploymentAdapter{baseURL: "https://kubernetes.invalid/apis/apps/v1", tokenPath: tokenFile, client: &http.Client{Transport: transport}}
	for _, replicas := range []int32{0, 1} {
		if err := adapter.SetReplicas(context.Background(), record.Namespace, record.Name, record.UID, "1", replicas); err != nil {
			t.Fatal(err)
		}
	}
	if err := adapter.Restart(context.Background(), record.Namespace, record.Name, record.UID, "1"); err != nil {
		t.Fatal(err)
	}
	for index, patch := range patches {
		spec := patch["spec"].(map[string]any)
		if len(spec) != 1 {
			t.Fatalf("patch changes extra fields: %#v", patch)
		}
		if index < 2 {
			if _, present := spec["replicas"]; !present {
				t.Fatalf("scale patch is not replicas-only: %#v", patch)
			}
		} else {
			template := spec["template"].(map[string]any)
			if len(template) != 1 || template["metadata"] == nil {
				t.Fatalf("restart patch changes pod spec: %#v", patch)
			}
		}
	}
}

func TestAgentPrivilegeUpdatesHaveNoDeploymentEditEndpoint(t *testing.T) {
	fake := newFakeAgentDeploymentAdapter()
	previous := agentDeploymentServiceProvider
	agentDeploymentServiceProvider = func() (*AgentDeploymentService, error) { return enabledDeploymentService(fake), nil }
	t.Cleanup(func() { agentDeploymentServiceProvider = previous })
	for _, method := range []string{http.MethodPatch, http.MethodPut} {
		request := httptest.NewRequest(method, "/agent-deployments/"+strings.Repeat("a", 32), strings.NewReader(`{"hostPID":true,"privileged":true}`))
		response := httptest.NewRecorder()
		newAPIMux().ServeHTTP(response, request)
		if response.Code != http.StatusMethodNotAllowed || len(fake.created) != 0 {
			t.Fatalf("deployment edit unexpectedly supported: status=%d", response.Code)
		}
	}
}

func TestAgentPrivilegeFieldsInLifecycleBodiesAreRejectedBeforeAdapterCalls(t *testing.T) {
	fake := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(fake)
	record, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 41, Owner: "synthetic-user"})
	if err != nil {
		t.Fatal(err)
	}
	original := fake.created[0]
	previous := agentDeploymentServiceProvider
	agentDeploymentServiceProvider = func() (*AgentDeploymentService, error) { return service, nil }
	t.Cleanup(func() { agentDeploymentServiceProvider = previous })
	resource := newResourceAdapterWithOrgLookup(newHTTPHandler(), func(int64) (int64, bool) { return 41, true })
	for _, role := range []string{"Viewer", "Editor", "Admin"} {
		for _, action := range []string{"start", "stop", "restart"} {
			t.Run(role+"/"+action, func(t *testing.T) {
				sender := &capturedResourceResponse{}
				if err := resource.CallResource(context.Background(), &backend.CallResourceRequest{
					Method: http.MethodPost, Path: "/plugin-api/agent-deployments/" + record.FleetID + "/" + action,
					Body:          []byte(`{"hostPID":true,"hostNetwork":true,"hostProcess":true,"privileged":true,"capabilities":{"add":["SYS_ADMIN","SYS_PTRACE"]}}`),
					PluginContext: backend.PluginContext{OrgID: 77, User: &backend.User{Login: "synthetic-user", Role: role}},
				}, sender); err != nil {
					t.Fatal(err)
				}
				want := http.StatusForbidden
				if role == "Admin" {
					want = http.StatusBadRequest
				}
				if sender.response == nil || sender.response.Status != want {
					t.Fatalf("want HTTP %d, got %#v", want, sender.response)
				}
				current := fake.objects[fake.key(record.Namespace, record.Name)]
				beforeJSON, _ := json.Marshal(kubernetesDeploymentFromManifest(original)["spec"].(map[string]any)["template"])
				afterJSON, _ := json.Marshal(kubernetesDeploymentFromManifest(current)["spec"].(map[string]any)["template"])
				if string(beforeJSON) != string(afterJSON) {
					t.Fatal("lifecycle request changed pod security or host access settings")
				}
			})
		}
	}
	if len(fake.replicaUpdates) != 0 || len(fake.restartUIDs) != 0 {
		t.Fatalf("invalid lifecycle calls reached adapter: scale=%d restart=%d", len(fake.replicaUpdates), len(fake.restartUIDs))
	}
}

func TestAdminLifecycleAcceptsEmptyBodiesAndRejectsDeleteInjection(t *testing.T) {
	fake := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(fake)
	record, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 41, Owner: "synthetic-user"})
	if err != nil {
		t.Fatal(err)
	}
	previous := agentDeploymentServiceProvider
	agentDeploymentServiceProvider = func() (*AgentDeploymentService, error) { return service, nil }
	t.Cleanup(func() { agentDeploymentServiceProvider = previous })
	call := func(method, path, body string) int {
		request := httptest.NewRequest(method, path, strings.NewReader(body))
		response := httptest.NewRecorder()
		serveAgentDeploymentEntity(response, request, reqCtx{OrgID: 41, UserLogin: "synthetic-user"}, service, strings.TrimPrefix(path, "/agent-deployments/"))
		return response.Code
	}
	for _, tc := range []struct{ action, body string }{{"start", `{}`}, {"stop", ""}, {"restart", `{}`}} {
		if got := call(http.MethodPost, "/agent-deployments/"+record.FleetID+"/"+tc.action, tc.body); got != http.StatusOK {
			t.Fatalf("%s with empty body returned %d", tc.action, got)
		}
	}
	if got := call(http.MethodDelete, "/agent-deployments/"+record.FleetID, `{"privileged":true}`); got != http.StatusBadRequest {
		t.Fatalf("injected delete body returned %d", got)
	}
	if len(fake.deleted) != 0 {
		t.Fatalf("invalid delete reached adapter: %#v", fake.deleted)
	}
	if got := call(http.MethodDelete, "/agent-deployments/"+record.FleetID, "  "); got != http.StatusOK {
		t.Fatalf("bodyless delete returned %d", got)
	}
	if len(fake.replicaUpdates) != 2 || len(fake.restartUIDs) != 1 || len(fake.deleted) != 1 {
		t.Fatalf("unexpected adapter operations: scale=%d restart=%d delete=%d", len(fake.replicaUpdates), len(fake.restartUIDs), len(fake.deleted))
	}
}

func TestEditorCannotGenerateCRDAndAdminCanGenerateTextWithoutDeploymentOperation(t *testing.T) {
	fake := newFakeAgentDeploymentAdapter()
	previous := agentDeploymentServiceProvider
	agentDeploymentServiceProvider = func() (*AgentDeploymentService, error) { return enabledDeploymentService(fake), nil }
	t.Cleanup(func() { agentDeploymentServiceProvider = previous })
	body, _ := json.Marshal(map[string]any{"crdSettings": map[string]any{
		"name": "synthetic-export", "namespace": "synthetic-tests", "mode": "deployment", "image": "registry.example/agent:1",
		"advancedYaml": "hostPID: true\nhostNetwork: true\nsecurityContext:\n  privileged: true\n  capabilities:\n    add: [SYS_ADMIN, SYS_PTRACE]\n  windowsOptions:\n    hostProcess: true\n",
	}})
	sender := &capturedResourceResponse{}
	resource := newResourceAdapterWithOrgLookup(newHTTPHandler(), func(int64) (int64, bool) { return 41, true })
	if err := resource.CallResource(context.Background(), &backend.CallResourceRequest{
		Method: http.MethodPost, Path: "/plugin-api/config-generator", Body: body,
		PluginContext: backend.PluginContext{OrgID: 77, User: &backend.User{Login: "synthetic-editor", Role: "Editor"}},
	}, sender); err != nil {
		t.Fatal(err)
	}
	if sender.response == nil || sender.response.Status != http.StatusForbidden {
		t.Fatalf("Editor CRD export should be forbidden, got %#v", sender.response)
	}
	adminSender := &capturedResourceResponse{}
	if err := resource.CallResource(context.Background(), &backend.CallResourceRequest{Method: http.MethodPost, Path: "/plugin-api/config-generator", Body: body,
		PluginContext: backend.PluginContext{OrgID: 77, User: &backend.User{Login: "synthetic-admin", Role: "Admin"}}}, adminSender); err != nil {
		t.Fatal(err)
	}
	if adminSender.response == nil || adminSender.response.Status != http.StatusOK {
		t.Fatalf("Admin CRD export failed: %#v", adminSender.response)
	}
	var response struct {
		Config string `json:"config"`
	}
	if err := json.Unmarshal(adminSender.response.Body, &response); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(response.Config, "kind: OpenTelemetryCollector") {
		t.Fatalf("expected text CRD export, got %q", response.Config)
	}
	if len(fake.created) != 0 || len(fake.replicaUpdates) != 0 || len(fake.restartUIDs) != 0 {
		t.Fatal("configuration export performed a deployment operation")
	}
}

func TestEditorCanGeneratePipelineOnlyConfig(t *testing.T) {
	resource := newResourceAdapterWithOrgLookup(newHTTPHandler(), func(int64) (int64, bool) { return 41, true })
	sender := &capturedResourceResponse{}
	err := resource.CallResource(context.Background(), &backend.CallResourceRequest{Method: http.MethodPost, Path: "/plugin-api/config-generator", Body: []byte(`{"receivers":[{"name":"otlp","type":"otlp"}]}`),
		PluginContext: backend.PluginContext{OrgID: 77, User: &backend.User{Login: "synthetic-editor", Role: "Editor"}}}, sender)
	if err != nil {
		t.Fatal(err)
	}
	if sender.response == nil || sender.response.Status != http.StatusOK || strings.Contains(string(sender.response.Body), `"isCRD":true`) {
		t.Fatalf("pipeline-only generation failed: %#v", sender.response)
	}
}

func TestCollectorConfigSectionMergeCannotInjectCRDEnvelope(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/config-generator", strings.NewReader(`{"exporters":[{"_isExtension":true,"_sectionName":"extensions","customYaml":"apiVersion: attacker/v1\\nkind: OpenTelemetryCollector\\nspec:\\n  hostPID: true\\nextensions:\\n  - health_check"}]}`))
	response := httptest.NewRecorder()
	configGeneratorHandler(response, request, reqCtx{Role: RoleEditor})
	if response.Code != http.StatusOK || strings.Contains(response.Body.String(), "apiVersion:") || strings.Contains(response.Body.String(), "hostPID") {
		t.Fatalf("CRD envelope escaped merge filter: %d %s", response.Code, response.Body.String())
	}
}
