package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

type fakeAgentDeploymentAdapter struct {
	objects              map[string]AgentDeploymentManifest
	created              []AgentDeploymentManifest
	deleted              []string
	deleteUIDs           []string
	replicaUpdates       []int32
	replicaUIDs          []string
	restartUIDs          []string
	restartRV            []string
	replaceOnGet         bool
	changeRVOnGet        bool
	listCalls            int
	securityUpdates      int
	rejectSecurityUpdate bool
}

type deploymentRoundTripper func(*http.Request) (*http.Response, error)

func (f deploymentRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func newFakeAgentDeploymentAdapter() *fakeAgentDeploymentAdapter {
	return &fakeAgentDeploymentAdapter{objects: map[string]AgentDeploymentManifest{}}
}
func (f *fakeAgentDeploymentAdapter) key(ns, name string) string { return ns + "/" + name }
func (f *fakeAgentDeploymentAdapter) Create(_ context.Context, m AgentDeploymentManifest) (AgentDeploymentManifest, error) {
	if _, ok := f.objects[f.key(m.Namespace, m.Name)]; ok {
		return AgentDeploymentManifest{}, errors.New("already exists")
	}
	m.UID = "k8s-uid-" + m.Labels["fleet.grafana.com/id"]
	m.ResourceVersion = "1"
	m.DesiredReplicas = m.Replicas
	f.objects[f.key(m.Namespace, m.Name)] = m
	f.created = append(f.created, m)
	return m, nil
}
func (f *fakeAgentDeploymentAdapter) Get(_ context.Context, ns, name string) (AgentDeploymentManifest, error) {
	m, ok := f.objects[f.key(ns, name)]
	if !ok {
		return AgentDeploymentManifest{}, ErrAgentDeploymentNotFound
	}
	if f.replaceOnGet {
		replacement := m
		replacement.UID = "replacement-object-uid"
		f.objects[f.key(ns, name)] = replacement
	}
	if f.changeRVOnGet {
		changed := m
		changed.ResourceVersion = incrementRV(m.ResourceVersion)
		f.objects[f.key(ns, name)] = changed
	}
	return m, nil
}
func (f *fakeAgentDeploymentAdapter) Delete(_ context.Context, ns, name, uid string) error {
	key := f.key(ns, name)
	manifest, ok := f.objects[key]
	if !ok || manifest.UID != uid {
		return ErrAgentDeploymentNotFound
	}
	delete(f.objects, key)
	f.deleted = append(f.deleted, key)
	f.deleteUIDs = append(f.deleteUIDs, uid)
	return nil
}
func (f *fakeAgentDeploymentAdapter) SetReplicas(_ context.Context, ns, name, uid, resourceVersion string, replicas int32) error {
	key := f.key(ns, name)
	manifest, ok := f.objects[key]
	if !ok || manifest.UID != uid {
		return ErrAgentDeploymentNotFound
	}
	if manifest.ResourceVersion != resourceVersion {
		return ErrAgentDeploymentConflict
	}
	manifest.Replicas = replicas
	manifest.DesiredReplicas = replicas
	manifest.ResourceVersion = incrementRV(manifest.ResourceVersion)
	f.objects[key] = manifest
	f.replicaUpdates = append(f.replicaUpdates, replicas)
	f.replicaUIDs = append(f.replicaUIDs, uid)
	return nil
}
func (f *fakeAgentDeploymentAdapter) Restart(_ context.Context, ns, name, uid, resourceVersion string) error {
	key := f.key(ns, name)
	manifest, ok := f.objects[key]
	if !ok || manifest.UID != uid {
		return ErrAgentDeploymentNotFound
	}
	if manifest.ResourceVersion != resourceVersion {
		return ErrAgentDeploymentConflict
	}
	manifest.ResourceVersion = incrementRV(manifest.ResourceVersion)
	f.objects[key] = manifest
	f.restartUIDs = append(f.restartUIDs, uid)
	f.restartRV = append(f.restartRV, resourceVersion)
	return nil
}
func (f *fakeAgentDeploymentAdapter) UpdateSecurity(_ context.Context, current, updated AgentDeploymentManifest) error {
	key := f.key(current.Namespace, current.Name)
	manifest, ok := f.objects[key]
	if !ok || manifest.UID != current.UID {
		return ErrAgentDeploymentNotFound
	}
	if manifest.ResourceVersion != current.ResourceVersion {
		return ErrAgentDeploymentConflict
	}
	if f.rejectSecurityUpdate {
		return errors.New("admission denied")
	}
	manifest.Labels["fleet.grafana.com/security-profile"] = updated.SecurityProfile
	manifest.Annotations["fleet.grafana.com/security-profile-hash"] = updated.SecurityProfileHash
	manifest.SecurityProfile, manifest.SecurityProfileHash = updated.SecurityProfile, updated.SecurityProfileHash
	manifest.Security = updated.Security
	manifest.OS = updated.OS
	manifest.HostPID, manifest.HostNetwork, manifest.HostIPC = updated.HostPID, updated.HostNetwork, updated.HostIPC
	manifest.HostProcess, manifest.RunAsUserName = updated.HostProcess, updated.RunAsUserName
	manifest.ResourceVersion = incrementRV(manifest.ResourceVersion)
	manifest.Generation++
	f.objects[key] = manifest
	f.securityUpdates++
	return nil
}
func incrementRV(rv string) string {
	var v int
	_, _ = fmt.Sscanf(rv, "%d", &v)
	return strconv.Itoa(v + 1)
}
func (f *fakeAgentDeploymentAdapter) List(_ context.Context, ns string, selector map[string]string) ([]AgentDeploymentManifest, error) {
	f.listCalls++
	var result []AgentDeploymentManifest
	for _, m := range f.objects {
		if m.Namespace != ns {
			continue
		}
		matched := true
		for k, v := range selector {
			if m.Labels[k] != v {
				matched = false
				break
			}
		}
		if matched {
			result = append(result, m)
		}
	}
	return result, nil
}

func enabledDeploymentService(adapter AgentDeploymentAdapter) *AgentDeploymentService {
	return NewAgentDeploymentService(AgentDeploymentConfig{Namespace: "agents", OpAMPTokenAudience: managedOpAMPTokenAudience, PermittedNodes: []string{"worker-a", "worker-b"}, PermittedServiceAccounts: []string{"agent-runtime"}, Profiles: map[string]AgentDeploymentProfile{"collector": {Image: "registry.example/collector:1.2", ServiceAccount: "agent-runtime", SupportsOpAMPTokenFile: true, Command: []string{"/agent"}, Args: []string{"--bootstrap", "/etc/agent.yaml"}, OpAMPEndpoint: "wss://opamp.example/v1/opamp"}, "mcp": {Image: "registry.example/mcp:3", ServiceAccount: "agent-runtime", SupportsOpAMPTokenFile: true, OpAMPEndpoint: "wss://opamp.example/v1/opamp"}}}, adapter)
}

func TestAgentDeploymentManifestIsConstrainedAndStableFleetIDIsIndependent(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(adapter)
	first, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 42, Owner: "alice"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "mcp", Node: "worker-b", OrgID: 42, Owner: "alice"})
	if err != nil {
		t.Fatal(err)
	}
	if first.FleetID == second.FleetID || len(first.FleetID) != 32 {
		t.Fatalf("fleet IDs not independently generated: %#v %#v", first, second)
	}
	if first.UID == "" || first.UID != adapter.created[0].UID {
		t.Fatalf("Kubernetes UID not returned: record=%q manifest=%q", first.UID, adapter.created[0].UID)
	}
	m := adapter.created[0]
	if m.Replicas != 1 || m.Strategy != "Recreate" || m.Namespace != "agents" || m.Image != "registry.example/collector:1.2" {
		t.Fatalf("unexpected deployment shape: %#v", m)
	}
	if m.ServiceAccount != "agent-runtime" || m.ServiceAccountToken || m.OpAMPEndpoint != "wss://opamp.example/v1/opamp" || len(m.Command) != 1 || len(m.Args) != 2 {
		t.Fatalf("runtime profile not applied: %#v", m)
	}
	if m.NodeAffinityKey != "metadata.name" || m.NodeAffinityOp != "In" || len(m.NodeAffinityValues) != 1 || m.NodeAffinityValues[0] != "worker-a" {
		t.Fatalf("missing exact required node affinity: %#v", m)
	}
	if m.ServiceAccountToken || m.Security.Privileged || m.Security.AllowPrivilegeEscalation || !m.Security.RunAsNonRoot || !m.Security.ReadOnlyRootFilesystem || len(m.Security.CapabilitiesDrop) != 1 || m.Security.CapabilitiesDrop[0] != "ALL" {
		t.Fatalf("unsafe pod security defaults: %#v", m)
	}
	for _, label := range []string{"fleet.grafana.com/id", "fleet.grafana.com/org-id", "fleet.grafana.com/owner"} {
		if m.Labels[label] == "" {
			t.Fatalf("missing ownership label %q", label)
		}
	}
}

func TestAgentDeploymentDisabledByEmptyConfigAndRejectsUnallowedInputs(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	disabled := NewAgentDeploymentService(AgentDeploymentConfig{}, adapter)
	if _, err := disabled.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 1, Owner: "alice"}); !errors.Is(err, ErrAgentDeploymentsDisabled) {
		t.Fatalf("empty config err=%v", err)
	}
	if _, err := disabled.List(context.Background(), 1, "alice"); !errors.Is(err, ErrAgentDeploymentsDisabled) || adapter.listCalls != 0 {
		t.Fatalf("disabled list called adapter: err=%v calls=%d", err, adapter.listCalls)
	}
	service := enabledDeploymentService(adapter)
	for _, req := range []AgentDeploymentRequest{{Profile: "nope", Node: "worker-a", OrgID: 1, Owner: "alice"}, {Profile: "collector", Node: "unlisted", OrgID: 1, Owner: "alice"}, {Profile: "collector", Node: "worker-a", OrgID: 0, Owner: "alice"}, {Profile: "collector", Node: "worker-a", OrgID: 1, Owner: ""}} {
		if _, err := service.Create(context.Background(), req); err == nil {
			t.Fatalf("accepted invalid request: %#v", req)
		}
	}
	if len(adapter.created) != 0 {
		t.Fatalf("invalid inputs created objects: %d", len(adapter.created))
	}
}

func TestAgentDeploymentListAndDeleteEnforceOrganizationAndOwner(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(adapter)
	record, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "mcp", Node: "worker-b", OrgID: 42, Owner: "Alice Example"})
	if err != nil {
		t.Fatal(err)
	}
	listed, err := service.List(context.Background(), 42, "Alice Example")
	if err != nil || len(listed) != 1 || listed[0].FleetID != record.FleetID {
		t.Fatalf("list=%#v err=%v", listed, err)
	}
	otherOrg, err := service.List(context.Background(), 99, "Alice Example")
	if err != nil || len(otherOrg) != 0 {
		t.Fatalf("cross-org list=%#v err=%v", otherOrg, err)
	}
	if err := service.Delete(context.Background(), record.FleetID, 99, "Alice Example"); !errors.Is(err, ErrAgentDeploymentForbidden) {
		t.Fatalf("cross-org delete err=%v", err)
	}
	if len(adapter.deleted) != 0 {
		t.Fatal("cross-org delete removed deployment")
	}
	if err := service.Delete(context.Background(), record.FleetID, 42, "Alice Example"); err != nil {
		t.Fatal(err)
	}
	if len(adapter.deleted) != 1 {
		t.Fatalf("expected one delete: %#v", adapter.deleted)
	}
	if len(adapter.deleteUIDs) != 1 || adapter.deleteUIDs[0] != record.UID {
		t.Fatalf("delete lacked Kubernetes UID precondition: %#v", adapter.deleteUIDs)
	}
}

func TestAgentDeploymentStartStopRestartUseUIDAndRequireOwnership(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(adapter)
	record, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 9, Owner: "bob"})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Stop(context.Background(), record.FleetID, 9, "bob"); err != nil {
		t.Fatal(err)
	}
	if err := service.Start(context.Background(), record.FleetID, 9, "bob"); err != nil {
		t.Fatal(err)
	}
	if err := service.Restart(context.Background(), record.FleetID, 9, "bob"); err != nil {
		t.Fatal(err)
	}
	want := []int32{0, 1, 0, 1}
	if len(adapter.replicaUpdates) != 2 || len(adapter.restartUIDs) != 1 {
		t.Fatalf("replica updates=%v", adapter.replicaUpdates)
	}
	for i, v := range want[:2] {
		if adapter.replicaUpdates[i] != v || adapter.replicaUIDs[i] != record.UID {
			t.Fatalf("replica update %d=(%d,%q), want (%d,%q)", i, adapter.replicaUpdates[i], adapter.replicaUIDs[i], v, record.UID)
		}
	}
	if adapter.restartUIDs[0] != record.UID || adapter.objects[adapter.key(record.Namespace, record.Name)].Replicas != 1 {
		t.Fatal("restart failed UID check or changed desired replica count")
	}
	if err := service.Stop(context.Background(), record.FleetID, 10, "bob"); !errors.Is(err, ErrAgentDeploymentForbidden) {
		t.Fatalf("cross-org stop err=%v", err)
	}
	if len(adapter.replicaUpdates) != 2 {
		t.Fatal("unauthorized request changed replicas")
	}
}

func TestAgentDeploymentDeleteUIDPreconditionPreventsDeletingReplacement(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(adapter)
	record, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "mcp", Node: "worker-b", OrgID: 17, Owner: "carol"})
	if err != nil {
		t.Fatal(err)
	}
	adapter.replaceOnGet = true
	if err := service.Delete(context.Background(), record.FleetID, 17, "carol"); !errors.Is(err, ErrAgentDeploymentNotFound) {
		t.Fatalf("delete replacement err=%v", err)
	}
	if len(adapter.deleted) != 0 {
		t.Fatalf("deleted replacement object: %#v", adapter.deleted)
	}
	if got := adapter.objects[adapter.key(record.Namespace, record.Name)].UID; got != "replacement-object-uid" {
		t.Fatalf("replacement unexpectedly changed: %q", got)
	}
}

func TestAgentDeploymentReplicaUpdateUsesResourceVersionPrecondition(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(adapter)
	record, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 22, Owner: "erin"})
	if err != nil {
		t.Fatal(err)
	}
	adapter.changeRVOnGet = true
	if err := service.Stop(context.Background(), record.FleetID, 22, "erin"); !errors.Is(err, ErrAgentDeploymentConflict) {
		t.Fatalf("stale resourceVersion err=%v", err)
	}
	manifest := adapter.objects[adapter.key(record.Namespace, record.Name)]
	if manifest.Replicas != 1 || len(adapter.replicaUpdates) != 0 {
		t.Fatalf("stale scale update changed deployment: %#v", manifest)
	}
}

func TestLoadAgentDeploymentConfigIsDisabledByDefaultAndRequiresSafeAllowlist(t *testing.T) {
	config, err := LoadAgentDeploymentConfig("  ")
	if err != nil || len(config.Profiles) != 0 {
		t.Fatalf("empty config=%#v err=%v", config, err)
	}
	valid := `{"namespace":"agents","opampTokenAudience":"fleet-opamp","permittedNodes":["worker-a"],"permittedServiceAccounts":["agent-runtime"],"profiles":{"collector":{"image":"registry.example/collector:1.2","serviceAccount":"agent-runtime","supportsOpampTokenFile":true,"command":["/agent"],"args":["--config","/etc/agent.yaml"],"opampEndpoint":"wss://opamp.example/v1/opamp"}}}`
	config, err = LoadAgentDeploymentConfig(valid)
	if err != nil || !validKubernetesLabel(config.Namespace) {
		t.Fatalf("valid config=%#v err=%v", config, err)
	}
	for _, invalid := range []string{
		strings.Replace(valid, `"agents"`, `"agents.team"`, 1),
		strings.Replace(valid, `"agents"`, `"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`, 1),
		strings.Replace(valid, `"agent-runtime"`, `"default"`, 1) + ` {}`,
		strings.Replace(valid, `"wss://opamp.example/v1/opamp"`, `"file:///etc/passwd"`, 1),
		strings.Replace(valid, `"serviceAccount":"agent-runtime"`, `"serviceAccount":"unlisted"`, 1),
	} {
		if _, err := LoadAgentDeploymentConfig(invalid); err == nil {
			t.Fatalf("accepted invalid config %s", invalid)
		}
	}
}

func TestAgentDeploymentRestartPreservesStoppedDesiredReplicas(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(adapter)
	record, err := service.Create(context.Background(), AgentDeploymentRequest{Profile: "collector", Node: "worker-a", OrgID: 31, Owner: "dana"})
	if err != nil {
		t.Fatal(err)
	}
	if err := service.Stop(context.Background(), record.FleetID, 31, "dana"); err != nil {
		t.Fatal(err)
	}
	if err := service.Restart(context.Background(), record.FleetID, 31, "dana"); err != nil {
		t.Fatal(err)
	}
	if got := adapter.objects[adapter.key(record.Namespace, record.Name)].Replicas; got != 0 {
		t.Fatalf("restart changed stopped replicas to %d", got)
	}
}

func TestInClusterAdapterUsesUIDAndResourceVersionPreconditions(t *testing.T) {
	tokenPath := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenPath, []byte("synthetic-token"), 0600); err != nil {
		t.Fatal(err)
	}
	var methods []string
	var requestBodies [][]byte
	transport := deploymentRoundTripper(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer synthetic-token" {
			t.Errorf("authorization=%q", r.Header.Get("Authorization"))
		}
		body, _ := io.ReadAll(r.Body)
		methods = append(methods, r.Method)
		requestBodies = append(requestBodies, body)
		payload := ""
		status := http.StatusOK
		if r.Method == http.MethodPost {
			payload = `{"metadata":{"uid":"created-uid","resourceVersion":"1","name":"agent-test","namespace":"agents","generation":1,"labels":{"fleet.grafana.com/id":"abc"}},"spec":{"replicas":1,"template":{"metadata":{"labels":{"fleet.grafana.com/id":"abc","fleet.grafana.com/security-profile":"restricted"},"spec":{"os":{"name":"linux"},"nodeSelector":{"kubernetes.io/os":"linux"},"containers":[{"image":"registry.example/a:1","securityContext":{"privileged":false,"allowPrivilegeEscalation":false,"runAsNonRoot":true,"readOnlyRootFilesystem":true,"capabilities":{"drop":["ALL"]}}}]}}}}}`
			status = http.StatusCreated
		}
		return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(payload)), Request: r}, nil
	})
	adapter := &InClusterAgentDeploymentAdapter{baseURL: "https://kubernetes.invalid/apis/apps/v1", tokenPath: tokenPath, client: &http.Client{Transport: transport}}
	base := AgentDeploymentManifest{Namespace: "agents", Name: "agent-test", Labels: map[string]string{"fleet.grafana.com/id": "abc"}, Replicas: 1, Strategy: "Recreate", Image: "registry.example/a:1", ServiceAccount: "agent-runtime", ServiceAccountToken: false, NodeAffinityKey: "metadata.name", NodeAffinityOp: "In", NodeAffinityValues: []string{"worker-a"}, Security: AgentContainerSecurity{CapabilitiesDrop: []string{"ALL"}}, OpAMPEndpoint: "wss://opamp.example/v1/opamp"}
	created, err := adapter.Create(context.Background(), base)
	if err != nil || created.UID != "created-uid" || created.ResourceVersion != "1" {
		t.Fatalf("create manifest=%#v err=%v", created, err)
	}
	var deployment map[string]any
	if err := json.Unmarshal(requestBodies[0], &deployment); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(deployment)
	for _, mustContain := range []string{`"type":"Recreate"`, `"metadata.name"`, `"serviceAccountName":"agent-runtime"`, `"automountServiceAccountToken":false`, `"OPAMP_ENDPOINT"`, `"privileged":false`, `"allowPrivilegeEscalation":false`, `"readOnlyRootFilesystem":true`} {
		if !bytes.Contains(encoded, []byte(mustContain)) {
			t.Errorf("manifest missing %s: %s", mustContain, encoded)
		}
	}
	if err := adapter.Delete(context.Background(), "agents", "agent-test", "created-uid"); err != nil {
		t.Fatal(err)
	}
	var deleteBody map[string]any
	if err := json.Unmarshal(requestBodies[1], &deleteBody); err != nil {
		t.Fatal(err)
	}
	pre := deleteBody["preconditions"].(map[string]any)
	if pre["uid"] != "created-uid" {
		t.Fatalf("delete precondition=%#v", pre)
	}
	if err := adapter.SetReplicas(context.Background(), "agents", "agent-test", "created-uid", "rv-1", 0); err != nil {
		t.Fatal(err)
	}
	var scalePatch map[string]any
	if err := json.Unmarshal(requestBodies[2], &scalePatch); err != nil {
		t.Fatal(err)
	}
	metadata := scalePatch["metadata"].(map[string]any)
	if metadata["uid"] != "created-uid" || metadata["resourceVersion"] != "rv-1" {
		t.Fatalf("scale preconditions=%#v", metadata)
	}
	if err := adapter.Restart(context.Background(), "agents", "agent-test", "created-uid", "rv-2"); err != nil {
		t.Fatal(err)
	}
	var restartPatch map[string]any
	if err := json.Unmarshal(requestBodies[3], &restartPatch); err != nil {
		t.Fatal(err)
	}
	if _, hasReplicas := restartPatch["spec"].(map[string]any)["replicas"]; hasReplicas {
		t.Fatal("rollout restart modified desired replicas")
	}
	if strings.Join(methods, ",") != "POST,DELETE,PATCH,PATCH" {
		t.Fatalf("methods=%v", methods)
	}
}

func TestAgentDeploymentHTTPRoutesRequireRBACAndStableLogin(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := enabledDeploymentService(adapter)
	previous := agentDeploymentServiceProvider
	agentDeploymentServiceProvider = func() (*AgentDeploymentService, error) { return service, nil }
	defer func() { agentDeploymentServiceProvider = previous }()
	router := newAPIMux()
	makeRequest := func(method, path, body string, role Role, login string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		principal := pluginPrincipal{orgID: 41, grafanaOrgID: 77, orgMapped: true, role: role, user: "display name", userLogin: login}
		req = req.WithContext(context.WithValue(req.Context(), pluginPrincipalKey{}, principal))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	if got := makeRequest(http.MethodPost, "/agent-deployments", `{"profile":"collector","node":"worker-a"}`, RoleViewer, "user.login"); got.Code != http.StatusForbidden {
		t.Fatalf("viewer POST status=%d body=%s", got.Code, got.Body)
	}
	if got := makeRequest(http.MethodPost, "/agent-deployments", `{"profile":"collector","node":"worker-a"}`, RoleEditor, "user.login"); got.Code != http.StatusForbidden {
		t.Fatalf("editor POST status=%d body=%s", got.Code, got.Body)
	}
	if got := makeRequest(http.MethodPost, "/agent-deployments", `{"profile":"collector","node":"worker-a"}`, RoleAdmin, ""); got.Code != http.StatusUnauthorized {
		t.Fatalf("missing login status=%d body=%s", got.Code, got.Body)
	}
	created := makeRequest(http.MethodPost, "/agent-deployments", `{"profile":"collector","node":"worker-a"}`, RoleAdmin, "user.login")
	if created.Code != http.StatusAccepted {
		t.Fatalf("create status=%d body=%s", created.Code, created.Body)
	}
	var createdRecord AgentDeploymentRecord
	if err := json.Unmarshal(created.Body.Bytes(), &createdRecord); err != nil {
		t.Fatal(err)
	}
	if createdRecord.Owner != "user.login" {
		t.Fatalf("deployment owner came from display name: %#v", createdRecord)
	}
	listed := makeRequest(http.MethodGet, "/agent-deployments", "", RoleViewer, "user.login")
	if listed.Code != http.StatusOK {
		t.Fatalf("list status=%d body=%s", listed.Code, listed.Body)
	}
	var response map[string]any
	if err := json.Unmarshal(listed.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"enabled", "profiles", "securityProfiles", "nodes", "deployments"} {
		if _, ok := response[field]; !ok {
			t.Errorf("GET response missing %s: %#v", field, response)
		}
	}
	if response["enabled"] != true {
		t.Fatalf("GET response not enabled: %#v", response)
	}
	profiles := response["profiles"].([]any)
	profileOptions := profiles[0].(map[string]any)
	if profileOptions["defaultSecurityProfile"] != "restricted" || profileOptions["os"] != "linux" || len(profileOptions["permittedSecurityProfiles"].([]any)) != 1 {
		t.Fatalf("unexpected runtime security options: %#v", profileOptions)
	}
	deployments, ok := response["deployments"].([]any)
	if !ok || len(deployments) != 1 {
		t.Fatalf("GET deployments=%#v", response["deployments"])
	}
	deployment := deployments[0].(map[string]any)
	if deployment["owner"] != "user.login" || deployment["status"] != "Pending" || deployment["desiredReplicas"] != float64(1) || deployment["readyReplicas"] != float64(0) {
		t.Fatalf("GET deployment contract=%#v", deployment)
	}
	if got := makeRequest(http.MethodPost, "/agent-deployments/"+createdRecord.FleetID+"/restart", "", RoleEditor, "user.login"); got.Code != http.StatusForbidden {
		t.Fatalf("editor restart status=%d body=%s", got.Code, got.Body)
	}
	if got := makeRequest(http.MethodDelete, "/agent-deployments/"+createdRecord.FleetID, "", RoleEditor, "user.login"); got.Code != http.StatusForbidden {
		t.Fatalf("editor delete status=%d body=%s", got.Code, got.Body)
	}
	wrongOwner := makeRequest(http.MethodDelete, "/agent-deployments/"+createdRecord.FleetID, "", RoleAdmin, "another.login")
	if wrongOwner.Code != http.StatusForbidden {
		t.Fatalf("cross-owner delete status=%d body=%s", wrongOwner.Code, wrongOwner.Body)
	}
	deleted := makeRequest(http.MethodDelete, "/agent-deployments/"+createdRecord.FleetID, "", RoleAdmin, "user.login")
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", deleted.Code, deleted.Body)
	}
}

func TestDisabledAgentDeploymentGETReturnsOptionsArraysWithoutKubernetesCall(t *testing.T) {
	adapter := newFakeAgentDeploymentAdapter()
	service := NewAgentDeploymentService(AgentDeploymentConfig{}, adapter)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/agent-deployments", nil)
	serveAgentDeploymentsCollection(response, request, reqCtx{}, service)
	if response.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.Code, response.Body)
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["enabled"] != false || len(body["profiles"].([]any)) != 0 || len(body["nodes"].([]any)) != 0 || len(body["deployments"].([]any)) != 0 || adapter.listCalls != 0 {
		t.Fatalf("disabled response=%#v list calls=%d", body, adapter.listCalls)
	}
}
