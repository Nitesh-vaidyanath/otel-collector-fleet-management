package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type managedTestReviewer struct {
	identity reviewedTokenIdentity
	err      error
}

func (r managedTestReviewer) ReviewToken(context.Context, string, string) (reviewedTokenIdentity, error) {
	return r.identity, r.err
}

type managedTestInspector struct {
	identity managedKubernetesIdentity
	err      error
}

type managedRoundTripper struct{ handler http.Handler }

func (r managedRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	recorder := httptest.NewRecorder()
	r.handler.ServeHTTP(recorder, request)
	return recorder.Result(), nil
}

func (i managedTestInspector) InspectManagedPod(context.Context, string, string, string) (managedKubernetesIdentity, error) {
	return i.identity, i.err
}

func testManagedJWT(exp time.Time) string {
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"exp":%d}`, exp.Unix())))
	return "header." + payload + ".signature"
}

func TestValidateManagedTokenBindsPodAndEnrollment(t *testing.T) {
	e := ManagedEnrollment{FleetID: "fleet-a", DeploymentUID: "deployment-uid", Namespace: "agents", Name: "fleet-agent-a", OrgID: 42, Owner: "alice", ServiceAccount: "collector", AgentUID: stableManagedAgentUID("fleet-a", "deployment-uid")}
	store := NewMemoryManagedEnrollmentStore()
	if err := store.Create(context.Background(), e); err != nil {
		t.Fatal(err)
	}
	identity := managedKubernetesIdentity{PodUID: "pod-uid", PodName: "pod-a", DeploymentUID: e.DeploymentUID, DeploymentName: e.Name, Namespace: e.Namespace, ServiceAccount: e.ServiceAccount, FleetID: e.FleetID, OrgID: e.OrgID, Owner: e.Owner, OwnerLabel: ownerLabel(e.Owner)}
	review := reviewedTokenIdentity{Authenticated: true, Username: "system:serviceaccount:agents:collector", PodName: identity.PodName, PodUID: identity.PodUID, Audiences: []string{managedOpAMPTokenAudience}}
	token := testManagedJWT(time.Now().Add(time.Hour))
	validate := func(r reviewedTokenIdentity, i managedKubernetesIdentity, tok string) error {
		_, _, err := validateManagedToken(context.Background(), managedTestReviewer{identity: r}, managedTestInspector{identity: i}, store, tok, managedOpAMPTokenAudience)
		return err
	}
	if err := validate(review, identity, token); err != nil {
		t.Fatalf("valid managed identity rejected: %v", err)
	}
	wrongAudience := review
	wrongAudience.Audiences = []string{"kubernetes.default.svc"}
	if err := validate(wrongAudience, identity, token); err == nil {
		t.Fatal("wrong audience accepted")
	}
	wrongPod := identity
	wrongPod.PodUID = "other-pod"
	if err := validate(review, wrongPod, token); err == nil {
		t.Fatal("other pod accepted")
	}
	wrongOwner := identity
	wrongOwner.Owner = "mallory"
	if err := validate(review, wrongOwner, token); err == nil {
		t.Fatal("other owner accepted")
	}
	if err := validate(review, identity, testManagedJWT(time.Now().Add(-time.Hour))); err == nil {
		t.Fatal("expired token accepted")
	}
	if err := validate(review, identity, "opaque-token"); err == nil {
		t.Fatal("opaque token accepted")
	}
	if err := store.Revoke(context.Background(), e.FleetID, e.DeploymentUID); err != nil {
		t.Fatal(err)
	}
	if err := validate(review, identity, token); err == nil {
		t.Fatal("revoked enrollment accepted")
	}
}

func TestManagedUIDAndReplacementConnection(t *testing.T) {
	uid := stableManagedAgentUID("fleet", "deployment")
	if strings.Contains(uid, "-") || normalizeAgentUID(uid) != uid {
		t.Fatalf("unstable routing UID %q", uid)
	}
	m := &OpampManager{managedConnections: make(map[string]managedLiveConnection)}
	principal := &managedConnectionPrincipal{identity: managedKubernetesIdentity{PodUID: "first"}, enrollment: ManagedEnrollment{AgentUID: uid, FleetID: "fleet", DeploymentUID: "deployment"}}
	first := &concurrentSendConnection{}
	second := &concurrentSendConnection{}
	if !m.trackManagedConnection(first, principal) {
		t.Fatal("first connection rejected")
	}
	principal.identity.PodUID = "replacement"
	if !m.trackManagedConnection(second, principal) {
		t.Fatal("replacement pod rejected")
	}
	if m.isCurrentManagedConnection(first, uid) || !m.isCurrentManagedConnection(second, uid) {
		t.Fatal("old connection retained ownership")
	}
	m.clearManagedConnection(first)
	if !m.isCurrentManagedConnection(second, uid) {
		t.Fatal("old close removed replacement")
	}
}

func TestManagedKubernetesOwnerChainAndProfileHash(t *testing.T) {
	labels := `"app.kubernetes.io/managed-by":"grafana-agent-fleet-management","fleet.grafana.com/id":"fleet-a","fleet.grafana.com/org-id":"42","fleet.grafana.com/owner":"ownerhash","fleet.grafana.com/profile":"collector","fleet.grafana.com/security-profile":"restricted"`
	profileHash := "hash-a"
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer fake-server-token" {
			t.Errorf("wrong server credential: %q", got)
		}
		switch r.URL.Path {
		case "/api/v1/namespaces/agents/pods/pod-a":
			fmt.Fprintf(w, `{"metadata":{"name":"pod-a","namespace":"agents","uid":"pod-uid","labels":{%s},"annotations":{"fleet.grafana.com/security-profile-hash":"%s"},"ownerReferences":[{"apiVersion":"apps/v1","kind":"ReplicaSet","name":"rs-a","uid":"rs-uid","controller":true}]},"spec":{"serviceAccountName":"collector"}}`, labels, profileHash)
		case "/apis/apps/v1/namespaces/agents/replicasets/rs-a":
			fmt.Fprint(w, `{"metadata":{"uid":"rs-uid","ownerReferences":[{"apiVersion":"apps/v1","kind":"Deployment","name":"fleet-agent-a","uid":"deployment-uid","controller":true}]}}`)
		case "/apis/apps/v1/namespaces/agents/deployments/fleet-agent-a":
			fmt.Fprintf(w, `{"metadata":{"name":"fleet-agent-a","namespace":"agents","uid":"deployment-uid","labels":{%s},"annotations":{"fleet.grafana.com/owner-login":"alice"}},"spec":{"template":{"metadata":{"labels":{%s},"annotations":{"fleet.grafana.com/security-profile-hash":"hash-a"}},"spec":{"serviceAccountName":"collector"}}}}`, labels, labels)
		default:
			http.NotFound(w, r)
		}
	})
	tokenPath := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenPath, []byte("fake-server-token"), 0600); err != nil {
		t.Fatal(err)
	}
	adapter := &InClusterAgentDeploymentAdapter{baseURL: "http://managed.test/apis/apps/v1", tokenPath: tokenPath, client: &http.Client{Transport: managedRoundTripper{handler}}}
	identity, err := adapter.InspectManagedPod(context.Background(), "agents", "pod-a", "pod-uid")
	if err != nil || identity.DeploymentUID != "deployment-uid" || identity.SecurityProfileHash != "hash-a" {
		t.Fatalf("owner chain rejected: %+v, %v", identity, err)
	}
	profileHash = "old-hash"
	if _, err := adapter.InspectManagedPod(context.Background(), "agents", "pod-a", "pod-uid"); err == nil {
		t.Fatal("stale pod profile accepted")
	}
	if _, err := adapter.InspectManagedPod(context.Background(), "agents", "pod-a", "other-pod"); err == nil {
		t.Fatal("different pod UID accepted")
	}
}

func TestManagedTokenReviewSendsExpectedAudience(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/apis/authentication.k8s.io/v1/tokenreviews" || r.Method != http.MethodPost {
			t.Errorf("wrong TokenReview endpoint: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer fake-server-token" {
			t.Errorf("wrong server credential: %q", got)
		}
		var body struct {
			Spec struct {
				Token     string   `json:"token"`
				Audiences []string `json:"audiences"`
			} `json:"spec"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.Spec.Token != "agent-token" || len(body.Spec.Audiences) != 1 || body.Spec.Audiences[0] != managedOpAMPTokenAudience {
			t.Errorf("wrong review request: %+v", body.Spec)
		}
		fmt.Fprint(w, `{"status":{"authenticated":true,"audiences":["fleet-opamp"],"user":{"username":"system:serviceaccount:agents:collector","uid":"sa-uid","extra":{"authentication.kubernetes.io/pod-name":["pod-a"],"authentication.kubernetes.io/pod-uid":["pod-uid"]}}}}`)
	})
	tokenPath := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenPath, []byte("fake-server-token"), 0600); err != nil {
		t.Fatal(err)
	}
	adapter := &InClusterAgentDeploymentAdapter{baseURL: "http://managed.test/apis/apps/v1", tokenPath: tokenPath, client: &http.Client{Transport: managedRoundTripper{handler}}}
	identity, err := adapter.ReviewToken(context.Background(), "agent-token", managedOpAMPTokenAudience)
	if err != nil || !identity.Authenticated || identity.PodName != "pod-a" || identity.PodUID != "pod-uid" {
		t.Fatalf("unexpected TokenReview result: %+v, %v", identity, err)
	}
}
