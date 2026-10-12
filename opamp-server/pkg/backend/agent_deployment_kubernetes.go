package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	serviceAccountTokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token"
	serviceAccountCAPath    = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
)

var ErrAgentDeploymentConflict = errors.New("Kubernetes deployment changed; refresh and retry")

// InClusterAgentDeploymentAdapter talks only to the Kubernetes API service
// and reads only the pod's projected service account token and CA. It has no
// kubeconfig or out-of-cluster fallback.
type InClusterAgentDeploymentAdapter struct {
	baseURL   string
	tokenPath string
	client    *http.Client
}

func (a *InClusterAgentDeploymentAdapter) ReviewToken(ctx context.Context, token, audience string) (reviewedTokenIdentity, error) {
	if strings.TrimSpace(token) == "" || strings.TrimSpace(audience) == "" {
		return reviewedTokenIdentity{}, errors.New("token and audience are required")
	}
	body, err := json.Marshal(map[string]any{"apiVersion": "authentication.k8s.io/v1", "kind": "TokenReview", "spec": map[string]any{"token": token, "audiences": []string{audience}}})
	if err != nil {
		return reviewedTokenIdentity{}, err
	}
	var response struct {
		Status struct {
			Authenticated bool     `json:"authenticated"`
			Audiences     []string `json:"audiences"`
			User          struct {
				Username string              `json:"username"`
				UID      string              `json:"uid"`
				Extra    map[string][]string `json:"extra"`
			} `json:"user"`
			ExpirationTimestamp time.Time `json:"expirationTimestamp"`
		} `json:"status"`
	}
	path := strings.TrimSuffix(a.baseURL, "/apis/apps/v1") + "/apis/authentication.k8s.io/v1/tokenreviews"
	if err := a.doAbsolute(ctx, http.MethodPost, path, body, &response, "application/json"); err != nil {
		return reviewedTokenIdentity{}, err
	}
	return reviewedTokenIdentity{Authenticated: response.Status.Authenticated, Username: response.Status.User.Username,
		UID: response.Status.User.UID, PodName: firstIdentityExtra(response.Status.User.Extra, "authentication.kubernetes.io/pod-name"),
		PodUID: firstIdentityExtra(response.Status.User.Extra, "authentication.kubernetes.io/pod-uid"), Audiences: response.Status.Audiences,
		ExpiresAt: response.Status.ExpirationTimestamp}, nil
}

func firstIdentityExtra(extra map[string][]string, key string) string {
	if values := extra[key]; len(values) > 0 {
		return values[0]
	}
	return ""
}

func (a *InClusterAgentDeploymentAdapter) InspectManagedPod(ctx context.Context, namespace, podName, expectedPodUID string) (managedKubernetesIdentity, error) {
	var pod struct {
		Metadata struct {
			Name              string            `json:"name"`
			Namespace         string            `json:"namespace"`
			UID               string            `json:"uid"`
			DeletionTimestamp *time.Time        `json:"deletionTimestamp"`
			Labels            map[string]string `json:"labels"`
			Annotations       map[string]string `json:"annotations"`
			OwnerReferences   []struct {
				APIVersion string `json:"apiVersion"`
				Kind       string `json:"kind"`
				Name       string `json:"name"`
				UID        string `json:"uid"`
				Controller *bool  `json:"controller"`
			} `json:"ownerReferences"`
		} `json:"metadata"`
		Spec struct {
			ServiceAccountName string `json:"serviceAccountName"`
		} `json:"spec"`
	}
	coreEndpoint := strings.TrimSuffix(a.baseURL, "/apis/apps/v1") + corePodPath(namespace, podName)
	if err := a.doAbsolute(ctx, http.MethodGet, coreEndpoint, nil, &pod, "application/json"); err != nil {
		return managedKubernetesIdentity{}, err
	}
	if pod.Metadata.UID != expectedPodUID || pod.Metadata.Namespace != namespace || pod.Metadata.DeletionTimestamp != nil || pod.Spec.ServiceAccountName == "" {
		return managedKubernetesIdentity{}, errors.New("pod identity did not match token")
	}
	rsRef, ok := controllingOwner(pod.Metadata.OwnerReferences, "ReplicaSet")
	if !ok || rsRef.APIVersion != "apps/v1" {
		return managedKubernetesIdentity{}, errors.New("pod is not controlled by a ReplicaSet")
	}
	var rs struct {
		Metadata struct {
			UID             string `json:"uid"`
			OwnerReferences []struct {
				APIVersion string `json:"apiVersion"`
				Kind       string `json:"kind"`
				Name       string `json:"name"`
				UID        string `json:"uid"`
				Controller *bool  `json:"controller"`
			} `json:"ownerReferences"`
		} `json:"metadata"`
	}
	if err := a.do(ctx, http.MethodGet, appsResourcePath(namespace, "replicasets", rsRef.Name), nil, &rs); err != nil {
		return managedKubernetesIdentity{}, err
	}
	if rs.Metadata.UID != rsRef.UID {
		return managedKubernetesIdentity{}, errors.New("ReplicaSet UID changed")
	}
	deploymentRef, ok := controllingOwner(rs.Metadata.OwnerReferences, "Deployment")
	if !ok || deploymentRef.APIVersion != "apps/v1" {
		return managedKubernetesIdentity{}, errors.New("ReplicaSet is not controlled by a Deployment")
	}
	var deployment struct {
		Metadata struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			Labels          map[string]string `json:"labels"`
			Annotations     map[string]string `json:"annotations"`
			OwnerReferences []struct {
				APIVersion string `json:"apiVersion"`
				Kind       string `json:"kind"`
				Name       string `json:"name"`
				UID        string `json:"uid"`
				Controller *bool  `json:"controller"`
			} `json:"ownerReferences"`
		} `json:"metadata"`
		Spec struct {
			Template struct {
				Metadata struct {
					Labels      map[string]string `json:"labels"`
					Annotations map[string]string `json:"annotations"`
				} `json:"metadata"`
				Spec struct {
					ServiceAccountName string `json:"serviceAccountName"`
				} `json:"spec"`
			} `json:"template"`
		} `json:"spec"`
	}
	if err := a.do(ctx, http.MethodGet, appsResourcePath(namespace, "deployments", deploymentRef.Name), nil, &deployment); err != nil {
		return managedKubernetesIdentity{}, err
	}
	if deployment.Metadata.UID != deploymentRef.UID || deployment.Metadata.Namespace != namespace || deployment.Spec.Template.Spec.ServiceAccountName != pod.Spec.ServiceAccountName {
		return managedKubernetesIdentity{}, errors.New("Deployment identity changed")
	}
	labels := deployment.Metadata.Labels
	templateLabels := deployment.Spec.Template.Metadata.Labels
	if labels["app.kubernetes.io/managed-by"] != "grafana-agent-fleet-management" || !sameManagedLabels(labels, templateLabels, pod.Metadata.Labels) {
		return managedKubernetesIdentity{}, errors.New("managed labels do not match deployment")
	}
	profileHash := deployment.Spec.Template.Metadata.Annotations["fleet.grafana.com/security-profile-hash"]
	if profileHash == "" || pod.Metadata.Annotations["fleet.grafana.com/security-profile-hash"] != profileHash {
		return managedKubernetesIdentity{}, errors.New("pod security profile is not current")
	}
	fleetID := labels["fleet.grafana.com/id"]
	orgID, err := strconv.ParseInt(labels["fleet.grafana.com/org-id"], 10, 64)
	if err != nil || fleetID == "" || labels["fleet.grafana.com/owner"] == "" {
		return managedKubernetesIdentity{}, errors.New("managed deployment labels are invalid")
	}
	return managedKubernetesIdentity{PodUID: pod.Metadata.UID, PodName: pod.Metadata.Name, DeploymentName: deployment.Metadata.Name, Namespace: namespace,
		ServiceAccount: pod.Spec.ServiceAccountName, DeploymentUID: deployment.Metadata.UID, FleetID: fleetID,
		OrgID: orgID, Owner: deployment.Metadata.Annotations["fleet.grafana.com/owner-login"], OwnerLabel: labels["fleet.grafana.com/owner"],
		SecurityProfileHash: profileHash}, nil
}

type ownerReference struct {
	APIVersion, Kind, Name, UID string
	Controller                  *bool
}

func controllingOwner(refs []struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	UID        string `json:"uid"`
	Controller *bool  `json:"controller"`
}, kind string) (ownerReference, bool) {
	for _, ref := range refs {
		if ref.Kind == kind && ref.UID != "" && ref.Name != "" && ref.Controller != nil && *ref.Controller {
			return ownerReference{APIVersion: ref.APIVersion, Kind: ref.Kind, Name: ref.Name, UID: ref.UID, Controller: ref.Controller}, true
		}
	}
	return ownerReference{}, false
}

func sameManagedLabels(deployment, template, pod map[string]string) bool {
	for _, key := range []string{"app.kubernetes.io/managed-by", "fleet.grafana.com/id", "fleet.grafana.com/org-id", "fleet.grafana.com/owner", "fleet.grafana.com/profile", "fleet.grafana.com/security-profile"} {
		if deployment[key] == "" || deployment[key] != template[key] || template[key] != pod[key] {
			return false
		}
	}
	return true
}

func corePodPath(namespace, name string) string {
	return "/api/v1/namespaces/" + url.PathEscape(namespace) + "/pods/" + url.PathEscape(name)
}
func appsResourcePath(namespace, resource, name string) string {
	return "/namespaces/" + url.PathEscape(namespace) + "/" + resource + "/" + url.PathEscape(name)
}

func NewInClusterAgentDeploymentAdapterFromEnvironment() (*InClusterAgentDeploymentAdapter, error) {
	host := strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_HOST"))
	port := strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_PORT_HTTPS"))
	if port == "" {
		port = "443"
	}
	portNumber, err := strconv.Atoi(port)
	if host == "" || err != nil || portNumber < 1 || portNumber > 65535 {
		return nil, errors.New("in-cluster Kubernetes service environment is unavailable")
	}
	caPEM, err := os.ReadFile(serviceAccountCAPath)
	if err != nil {
		return nil, fmt.Errorf("read projected Kubernetes CA: %w", err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return nil, errors.New("projected Kubernetes CA is invalid")
	}
	transport := &http.Transport{TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12, RootCAs: roots}, Proxy: nil, DialContext: (&net.Dialer{Timeout: 4 * time.Second, KeepAlive: 30 * time.Second}).DialContext}
	return &InClusterAgentDeploymentAdapter{baseURL: "https://" + net.JoinHostPort(host, port) + "/apis/apps/v1", tokenPath: serviceAccountTokenPath, client: &http.Client{Transport: transport, Timeout: 15 * time.Second}}, nil
}

func (a *InClusterAgentDeploymentAdapter) Create(ctx context.Context, manifest AgentDeploymentManifest) (AgentDeploymentManifest, error) {
	body, err := json.Marshal(kubernetesDeploymentFromManifest(manifest))
	if err != nil {
		return AgentDeploymentManifest{}, err
	}
	var response kubeDeploymentEnvelope
	if err := a.do(ctx, http.MethodPost, "/namespaces/"+url.PathEscape(manifest.Namespace)+"/deployments", body, &response); err != nil {
		return AgentDeploymentManifest{}, err
	}
	if response.Metadata.UID == "" {
		return AgentDeploymentManifest{}, errors.New("Kubernetes API returned deployment without UID")
	}
	created := response.manifest()
	if created.Name == "" {
		created.Name = manifest.Name
	}
	if created.Namespace == "" {
		created.Namespace = manifest.Namespace
	}
	if created.Labels == nil {
		created.Labels = cloneLabels(manifest.Labels)
	}
	if created.Annotations == nil {
		created.Annotations = manifest.Annotations
	}
	if created.TemplateLabels == nil {
		created.TemplateLabels = cloneLabels(manifest.TemplateLabels)
	}
	if created.TemplateAnnotations == nil {
		created.TemplateAnnotations = manifest.TemplateAnnotations
	}
	if created.NodeSelector == nil {
		created.NodeSelector = manifest.NodeSelector
	}
	if created.ContainerCount == 0 {
		created.ContainerCount = manifest.ContainerCount
	}
	if !created.PodOSPresent {
		created.PodOSPresent = manifest.PodOSPresent
	}
	if !created.PodSecurityContextPresent {
		created.PodSecurityContextPresent = manifest.PodSecurityContextPresent
	}
	if !created.ContainerSecurityContextPresent {
		created.ContainerSecurityContextPresent = manifest.ContainerSecurityContextPresent
	}
	if !created.CapabilitiesPresent {
		created.CapabilitiesPresent = manifest.CapabilitiesPresent
	}
	if !created.WindowsOptionsPresent {
		created.WindowsOptionsPresent = manifest.WindowsOptionsPresent
	}
	if created.Replicas == 0 {
		created.Replicas = manifest.Replicas
		created.DesiredReplicas = manifest.Replicas
	}
	if created.ResourceVersion == "" {
		created.ResourceVersion = manifest.ResourceVersion
	}
	if created.Image == "" {
		created.Image = manifest.Image
	}
	if created.ServiceAccount == "" {
		created.ServiceAccount = manifest.ServiceAccount
	}
	if created.OS == "" {
		created.OS = manifest.OS
	}
	if created.SecurityProfile == "" {
		created.SecurityProfile = manifest.SecurityProfile
	}
	if created.SecurityProfileHash == "" {
		created.SecurityProfileHash = manifest.SecurityProfileHash
	}
	return created, nil
}

func (a *InClusterAgentDeploymentAdapter) Get(ctx context.Context, namespace, name string) (AgentDeploymentManifest, error) {
	var response kubeDeploymentEnvelope
	if err := a.do(ctx, http.MethodGet, deploymentPath(namespace, name), nil, &response); err != nil {
		return AgentDeploymentManifest{}, err
	}
	return response.manifest(), nil
}

func (a *InClusterAgentDeploymentAdapter) Delete(ctx context.Context, namespace, name, uid string) error {
	if strings.TrimSpace(uid) == "" {
		return errors.New("UID precondition is required")
	}
	body, err := json.Marshal(map[string]any{"apiVersion": "v1", "kind": "DeleteOptions", "propagationPolicy": "Foreground", "preconditions": map[string]string{"uid": uid}})
	if err != nil {
		return err
	}
	return a.do(ctx, http.MethodDelete, deploymentPath(namespace, name), body, nil)
}

func (a *InClusterAgentDeploymentAdapter) SetReplicas(ctx context.Context, namespace, name, uid, resourceVersion string, replicas int32) error {
	if uid == "" || resourceVersion == "" {
		return errors.New("UID and resourceVersion preconditions are required")
	}
	body, err := json.Marshal(map[string]any{"metadata": map[string]string{"uid": uid, "resourceVersion": resourceVersion}, "spec": map[string]int32{"replicas": replicas}})
	if err != nil {
		return err
	}
	return a.doPatch(ctx, deploymentPath(namespace, name), body)
}

func (a *InClusterAgentDeploymentAdapter) Restart(ctx context.Context, namespace, name, uid, resourceVersion string) error {
	if uid == "" || resourceVersion == "" {
		return errors.New("UID and resourceVersion preconditions are required")
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	body, err := json.Marshal(map[string]any{"metadata": map[string]string{"uid": uid, "resourceVersion": resourceVersion}, "spec": map[string]any{"template": map[string]any{"metadata": map[string]map[string]string{"annotations": {"kubectl.kubernetes.io/restartedAt": now}}}}})
	if err != nil {
		return err
	}
	return a.doPatch(ctx, deploymentPath(namespace, name), body)
}

func (a *InClusterAgentDeploymentAdapter) UpdateSecurity(ctx context.Context, current, updated AgentDeploymentManifest) error {
	if current.UID == "" || current.ResourceVersion == "" || current.UID != updated.UID || current.ResourceVersion != updated.ResourceVersion {
		return ErrAgentDeploymentConflict
	}
	if current.OS != "" && current.OS != updated.OS || current.OS == "" && updated.OS != "linux" {
		return ErrAgentDeploymentConflict
	}
	if current.ContainerCount == 0 || current.TemplateLabels == nil {
		return errors.New("Kubernetes deployment template is incomplete")
	}
	patch := []map[string]any{
		{"op": "test", "path": "/metadata/uid", "value": current.UID},
		{"op": "test", "path": "/metadata/resourceVersion", "value": current.ResourceVersion},
		{"op": "add", "path": "/metadata/labels/fleet.grafana.com~1security-profile", "value": updated.SecurityProfile},
		{"op": "add", "path": "/spec/template/metadata/labels/fleet.grafana.com~1security-profile", "value": updated.SecurityProfile},
	}
	if current.Annotations == nil {
		patch = append(patch, jsonPatchAdd("/metadata/annotations", map[string]string{"fleet.grafana.com/security-profile-hash": updated.SecurityProfileHash}))
	} else {
		patch = append(patch, jsonPatchAdd("/metadata/annotations/fleet.grafana.com~1security-profile-hash", updated.SecurityProfileHash))
	}
	if current.TemplateAnnotations == nil {
		patch = append(patch, jsonPatchAdd("/spec/template/metadata/annotations", map[string]string{"fleet.grafana.com/security-profile-hash": updated.SecurityProfileHash}))
	} else {
		patch = append(patch, jsonPatchAdd("/spec/template/metadata/annotations/fleet.grafana.com~1security-profile-hash", updated.SecurityProfileHash))
	}
	if current.NodeSelector == nil {
		patch = append(patch, jsonPatchAdd("/spec/template/spec/nodeSelector", map[string]string{"kubernetes.io/os": updated.OS}))
	} else {
		patch = append(patch, jsonPatchAdd("/spec/template/spec/nodeSelector/kubernetes.io~1os", updated.OS))
	}
	if current.PodOSPresent {
		patch = append(patch, jsonPatchAdd("/spec/template/spec/os/name", updated.OS))
	} else {
		patch = append(patch, jsonPatchAdd("/spec/template/spec/os", map[string]string{"name": updated.OS}))
	}
	if updated.OS == "linux" {
		patch = append(patch,
			jsonPatchAdd("/spec/template/spec/hostPID", updated.HostPID),
			jsonPatchAdd("/spec/template/spec/hostNetwork", updated.HostNetwork),
			jsonPatchAdd("/spec/template/spec/hostIPC", updated.HostIPC),
		)
		if !current.PodSecurityContextPresent {
			patch = append(patch, jsonPatchAdd("/spec/template/spec/securityContext", map[string]any{"runAsNonRoot": updated.Security.RunAsNonRoot, "seccompProfile": map[string]string{"type": "RuntimeDefault"}}))
		} else {
			patch = append(patch, jsonPatchAdd("/spec/template/spec/securityContext/runAsNonRoot", updated.Security.RunAsNonRoot))
		}
		if !current.ContainerSecurityContextPresent {
			patch = append(patch, jsonPatchAdd("/spec/template/spec/containers/0/securityContext", linuxContainerSecurityPatch(updated.Security)))
		} else {
			patch = append(patch,
				jsonPatchAdd("/spec/template/spec/containers/0/securityContext/privileged", updated.Security.Privileged),
				jsonPatchAdd("/spec/template/spec/containers/0/securityContext/allowPrivilegeEscalation", updated.Security.AllowPrivilegeEscalation),
				jsonPatchAdd("/spec/template/spec/containers/0/securityContext/runAsNonRoot", updated.Security.RunAsNonRoot),
				jsonPatchAdd("/spec/template/spec/containers/0/securityContext/readOnlyRootFilesystem", updated.Security.ReadOnlyRootFilesystem),
			)
			if !current.CapabilitiesPresent {
				patch = append(patch, jsonPatchAdd("/spec/template/spec/containers/0/securityContext/capabilities", map[string]any{"drop": []string{"ALL"}, "add": nonNilStrings(updated.Security.CapabilitiesAdd)}))
			} else {
				patch = append(patch,
					jsonPatchAdd("/spec/template/spec/containers/0/securityContext/capabilities/drop", []string{"ALL"}),
					jsonPatchAdd("/spec/template/spec/containers/0/securityContext/capabilities/add", nonNilStrings(updated.Security.CapabilitiesAdd)),
				)
			}
		}
	} else {
		patch = append(patch, jsonPatchAdd("/spec/template/spec/hostNetwork", updated.HostNetwork))
		windowsOptions := map[string]any{"hostProcess": updated.HostProcess, "runAsUserName": updated.RunAsUserName}
		if !current.ContainerSecurityContextPresent {
			patch = append(patch, jsonPatchAdd("/spec/template/spec/containers/0/securityContext", map[string]any{"windowsOptions": windowsOptions}))
		} else if !current.WindowsOptionsPresent {
			patch = append(patch, jsonPatchAdd("/spec/template/spec/containers/0/securityContext/windowsOptions", windowsOptions))
		} else {
			patch = append(patch,
				jsonPatchAdd("/spec/template/spec/containers/0/securityContext/windowsOptions/hostProcess", updated.HostProcess),
				jsonPatchAdd("/spec/template/spec/containers/0/securityContext/windowsOptions/runAsUserName", updated.RunAsUserName),
			)
		}
	}
	body, err := json.Marshal(patch)
	if err != nil {
		return err
	}
	return a.doWithType(ctx, http.MethodPatch, deploymentPath(current.Namespace, current.Name), body, nil, "application/json-patch+json")
}

func jsonPatchAdd(path string, value any) map[string]any {
	return map[string]any{"op": "add", "path": path, "value": value}
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func linuxContainerSecurityPatch(security AgentContainerSecurity) map[string]any {
	return map[string]any{"privileged": security.Privileged, "allowPrivilegeEscalation": security.AllowPrivilegeEscalation, "runAsNonRoot": security.RunAsNonRoot, "readOnlyRootFilesystem": security.ReadOnlyRootFilesystem, "capabilities": map[string]any{"drop": []string{"ALL"}, "add": nonNilStrings(security.CapabilitiesAdd)}}
}

func (a *InClusterAgentDeploymentAdapter) List(ctx context.Context, namespace string, labels map[string]string) ([]AgentDeploymentManifest, error) {
	selector := make([]string, 0, len(labels))
	for key, value := range labels {
		selector = append(selector, key+"="+value)
	}
	sort.Strings(selector)
	path := "/namespaces/" + url.PathEscape(namespace) + "/deployments"
	if len(selector) > 0 {
		path += "?labelSelector=" + url.QueryEscape(strings.Join(selector, ","))
	}
	var response struct {
		Items []kubeDeploymentEnvelope `json:"items"`
	}
	if err := a.do(ctx, http.MethodGet, path, nil, &response); err != nil {
		return nil, err
	}
	items := make([]AgentDeploymentManifest, 0, len(response.Items))
	for _, item := range response.Items {
		items = append(items, item.manifest())
	}
	return items, nil
}

func (a *InClusterAgentDeploymentAdapter) doPatch(ctx context.Context, path string, body []byte) error {
	return a.doWithType(ctx, http.MethodPatch, path, body, nil, "application/merge-patch+json")
}
func (a *InClusterAgentDeploymentAdapter) do(ctx context.Context, method, path string, body []byte, out any) error {
	return a.doWithType(ctx, method, path, body, out, "application/json")
}
func (a *InClusterAgentDeploymentAdapter) doWithType(ctx context.Context, method, path string, body []byte, out any, contentType string) error {
	return a.doAbsolute(ctx, method, strings.TrimRight(a.baseURL, "/")+path, body, out, contentType)
}

func (a *InClusterAgentDeploymentAdapter) doAbsolute(ctx context.Context, method, endpoint string, body []byte, out any, contentType string) error {
	if a == nil || a.client == nil || a.tokenPath == "" {
		return errors.New("in-cluster Kubernetes adapter is not initialized")
	}
	token, err := os.ReadFile(a.tokenPath)
	if err != nil {
		return fmt.Errorf("read projected Kubernetes token: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(string(token)))
	request.Header.Set("Accept", "application/json")
	if body != nil {
		request.Header.Set("Content-Type", contentType)
	}
	response, err := a.client.Do(request)
	if err != nil {
		return fmt.Errorf("Kubernetes API request failed: %w", err)
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return err
	}
	if response.StatusCode == http.StatusNotFound {
		return ErrAgentDeploymentNotFound
	}
	if response.StatusCode == http.StatusConflict || response.StatusCode == http.StatusPreconditionFailed {
		return ErrAgentDeploymentConflict
	}
	if response.StatusCode == http.StatusUnprocessableEntity && contentType == "application/json-patch+json" {
		lowerMessage := strings.ToLower(string(responseBody))
		if strings.Contains(lowerMessage, "test failed") || strings.Contains(lowerMessage, "testing value") {
			return ErrAgentDeploymentConflict
		}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message := strings.TrimSpace(string(responseBody))
		if len(message) > 256 {
			message = message[:256]
		}
		return fmt.Errorf("Kubernetes API returned HTTP %d: %s", response.StatusCode, message)
	}
	if out != nil && len(responseBody) > 0 {
		if err := json.Unmarshal(responseBody, out); err != nil {
			return fmt.Errorf("decode Kubernetes API response: %w", err)
		}
	}
	return nil
}

func deploymentPath(namespace, name string) string {
	return "/namespaces/" + url.PathEscape(namespace) + "/deployments/" + url.PathEscape(name)
}

type kubeDeploymentEnvelope struct {
	Metadata struct {
		Name            string            `json:"name"`
		Namespace       string            `json:"namespace"`
		UID             string            `json:"uid"`
		ResourceVersion string            `json:"resourceVersion"`
		Labels          map[string]string `json:"labels"`
		Annotations     map[string]string `json:"annotations"`
		Generation      int64             `json:"generation"`
	} `json:"metadata"`
	Spec struct {
		Replicas int32 `json:"replicas"`
		Strategy struct {
			Type string `json:"type"`
		} `json:"strategy"`
		Selector struct {
			MatchLabels map[string]string `json:"matchLabels"`
		} `json:"selector"`
		Template struct {
			Metadata struct {
				Labels      map[string]string `json:"labels"`
				Annotations map[string]string `json:"annotations"`
			} `json:"metadata"`
			Spec struct {
				OS *struct {
					Name string `json:"name"`
				} `json:"os"`
				HostPID         bool              `json:"hostPID"`
				HostNetwork     bool              `json:"hostNetwork"`
				HostIPC         bool              `json:"hostIPC"`
				NodeSelector    map[string]string `json:"nodeSelector"`
				SecurityContext *struct {
					RunAsNonRoot *bool `json:"runAsNonRoot"`
				} `json:"securityContext"`
				ServiceAccountName           string `json:"serviceAccountName"`
				AutomountServiceAccountToken *bool  `json:"automountServiceAccountToken"`
				Containers                   []struct {
					Image           string   `json:"image"`
					Command         []string `json:"command"`
					Args            []string `json:"args"`
					SecurityContext *struct {
						Privileged               *bool `json:"privileged"`
						AllowPrivilegeEscalation *bool `json:"allowPrivilegeEscalation"`
						RunAsNonRoot             *bool `json:"runAsNonRoot"`
						ReadOnlyRootFilesystem   *bool `json:"readOnlyRootFilesystem"`
						Capabilities             *struct {
							Add  []string `json:"add"`
							Drop []string `json:"drop"`
						} `json:"capabilities"`
						WindowsOptions *struct {
							HostProcess   *bool  `json:"hostProcess"`
							RunAsUserName string `json:"runAsUserName"`
						} `json:"windowsOptions"`
					} `json:"securityContext"`
					Env []struct {
						Name  string `json:"name"`
						Value string `json:"value"`
					} `json:"env"`
				} `json:"containers"`
				Affinity struct {
					NodeAffinity struct {
						Required struct {
							Terms []struct {
								MatchFields []struct {
									Key      string   `json:"key"`
									Operator string   `json:"operator"`
									Values   []string `json:"values"`
								} `json:"matchFields"`
							} `json:"nodeSelectorTerms"`
						} `json:"requiredDuringSchedulingIgnoredDuringExecution"`
					} `json:"nodeAffinity"`
				} `json:"affinity"`
			} `json:"spec"`
		} `json:"template"`
	} `json:"spec"`
	Status struct {
		Replicas           int32 `json:"replicas"`
		ReadyReplicas      int32 `json:"readyReplicas"`
		AvailableReplicas  int32 `json:"availableReplicas"`
		UpdatedReplicas    int32 `json:"updatedReplicas"`
		ObservedGeneration int64 `json:"observedGeneration"`
	} `json:"status"`
}

func (e kubeDeploymentEnvelope) manifest() AgentDeploymentManifest {
	m := AgentDeploymentManifest{Namespace: e.Metadata.Namespace, Name: e.Metadata.Name, UID: e.Metadata.UID, ResourceVersion: e.Metadata.ResourceVersion, Labels: e.Metadata.Labels, Annotations: e.Metadata.Annotations, TemplateLabels: e.Spec.Template.Metadata.Labels, TemplateAnnotations: e.Spec.Template.Metadata.Annotations, Replicas: e.Spec.Replicas, Strategy: e.Spec.Strategy.Type, ServiceAccount: e.Spec.Template.Spec.ServiceAccountName, DesiredReplicas: e.Spec.Replicas, ReadyReplicas: e.Status.ReadyReplicas, Generation: e.Metadata.Generation, ObservedGeneration: e.Status.ObservedGeneration, UpdatedReplicas: e.Status.UpdatedReplicas, HostPID: e.Spec.Template.Spec.HostPID, HostNetwork: e.Spec.Template.Spec.HostNetwork, HostIPC: e.Spec.Template.Spec.HostIPC, SecurityProfile: e.Spec.Template.Metadata.Labels["fleet.grafana.com/security-profile"], SecurityProfileHash: e.Spec.Template.Metadata.Annotations["fleet.grafana.com/security-profile-hash"], NodeSelector: e.Spec.Template.Spec.NodeSelector, PodOSPresent: e.Spec.Template.Spec.OS != nil, PodSecurityContextPresent: e.Spec.Template.Spec.SecurityContext != nil, ContainerCount: len(e.Spec.Template.Spec.Containers)}
	if e.Spec.Template.Spec.OS != nil {
		m.OS = e.Spec.Template.Spec.OS.Name
	}
	if len(e.Spec.Template.Spec.Containers) > 0 {
		c := e.Spec.Template.Spec.Containers[0]
		m.Image = c.Image
		m.Command = c.Command
		m.Args = c.Args
		if c.SecurityContext != nil {
			m.ContainerSecurityContextPresent = true
			m.WindowsOptionsPresent = c.SecurityContext.WindowsOptions != nil
			m.CapabilitiesPresent = c.SecurityContext.Capabilities != nil
			if c.SecurityContext.WindowsOptions != nil {
				m.HostProcess = c.SecurityContext.WindowsOptions.HostProcess != nil && *c.SecurityContext.WindowsOptions.HostProcess
				m.RunAsUserName = c.SecurityContext.WindowsOptions.RunAsUserName
			}
			if c.SecurityContext.Capabilities != nil {
				m.Security.CapabilitiesDrop = append([]string(nil), c.SecurityContext.Capabilities.Drop...)
				m.Security.CapabilitiesAdd = append([]string(nil), c.SecurityContext.Capabilities.Add...)
			}
			if c.SecurityContext.Privileged != nil {
				m.Security.Privileged = *c.SecurityContext.Privileged
			}
			if c.SecurityContext.AllowPrivilegeEscalation != nil {
				m.Security.AllowPrivilegeEscalation = *c.SecurityContext.AllowPrivilegeEscalation
			}
			if c.SecurityContext.RunAsNonRoot != nil {
				m.Security.RunAsNonRoot = *c.SecurityContext.RunAsNonRoot
			}
			if c.SecurityContext.ReadOnlyRootFilesystem != nil {
				m.Security.ReadOnlyRootFilesystem = *c.SecurityContext.ReadOnlyRootFilesystem
			}
		}
		for _, env := range c.Env {
			if env.Name == "OPAMP_ENDPOINT" {
				m.OpAMPEndpoint = env.Value
			}
		}
	}
	if m.OS == "" {
		m.OS = e.Spec.Template.Spec.NodeSelector["kubernetes.io/os"]
	}
	for _, term := range e.Spec.Template.Spec.Affinity.NodeAffinity.Required.Terms {
		for _, field := range term.MatchFields {
			if field.Key == "metadata.name" {
				m.NodeAffinityKey = field.Key
				m.NodeAffinityOp = field.Operator
				m.NodeAffinityValues = append(m.NodeAffinityValues, field.Values...)
			}
		}
	}
	if m.Replicas == 0 {
		m.Status = "Stopped"
	} else if e.Status.ReadyReplicas >= m.Replicas {
		m.Status = "Running"
	} else {
		m.Status = "Pending"
	}
	return m
}

func kubernetesDeploymentFromManifest(m AgentDeploymentManifest) map[string]any {
	labels := cloneLabels(m.Labels)
	if m.OS == "" {
		m.OS = "linux"
	}
	if m.SecurityProfile == "" {
		m.Security.RunAsNonRoot = true
		m.Security.ReadOnlyRootFilesystem = true
		m.Security.CapabilitiesDrop = []string{"ALL"}
	}
	if len(m.Security.CapabilitiesDrop) == 0 {
		m.Security.CapabilitiesDrop = []string{"ALL"}
	}
	templateLabels := cloneLabels(labels)
	templateLabels["fleet.grafana.com/security-profile"] = m.SecurityProfile
	templateAnnotations := map[string]string{"fleet.grafana.com/security-profile-hash": m.SecurityProfileHash}
	podSpec := map[string]any{"serviceAccountName": m.ServiceAccount, "automountServiceAccountToken": m.ServiceAccountToken,
		"affinity":     map[string]any{"nodeAffinity": map[string]any{"requiredDuringSchedulingIgnoredDuringExecution": map[string]any{"nodeSelectorTerms": []any{map[string]any{"matchFields": []any{map[string]any{"key": m.NodeAffinityKey, "operator": m.NodeAffinityOp, "values": m.NodeAffinityValues}}}}}}},
		"nodeSelector": map[string]string{"kubernetes.io/os": m.OS}, "os": map[string]string{"name": m.OS},
		"containers": []any{map[string]any{"name": "agent", "image": m.Image, "command": m.Command, "args": m.Args, "env": []any{map[string]string{"name": "OPAMP_ENDPOINT", "value": m.OpAMPEndpoint}}}},
	}
	if m.OpAMPTokenFile {
		tokenPath, tokenMount := managedOpAMPTokenPaths(m.OS)
		podSpec["volumes"] = []any{map[string]any{"name": managedOpAMPTokenVolume, "projected": map[string]any{"defaultMode": 0444, "sources": []any{map[string]any{"serviceAccountToken": map[string]any{"audience": m.OpAMPTokenAudience, "expirationSeconds": 600, "path": "token"}}}}}}
		container := podSpec["containers"].([]any)[0].(map[string]any)
		env := container["env"].([]any)
		container["env"] = append(env, map[string]string{"name": "OPAMP_AUTH_TOKEN_FILE", "value": tokenPath}, map[string]string{"name": "OPAMP_FLEET_ID", "value": labels["fleet.grafana.com/id"]})
		container["volumeMounts"] = []any{map[string]any{"name": managedOpAMPTokenVolume, "mountPath": tokenMount, "readOnly": true}}
	}
	if m.OS == "linux" {
		if m.HostPID {
			podSpec["hostPID"] = true
		}
		if m.HostNetwork {
			podSpec["hostNetwork"] = true
		}
		if m.HostIPC {
			podSpec["hostIPC"] = true
		}
		podSpec["securityContext"] = map[string]any{"runAsNonRoot": m.Security.RunAsNonRoot, "seccompProfile": map[string]string{"type": "RuntimeDefault"}}
		podSpec["containers"].([]any)[0].(map[string]any)["securityContext"] = map[string]any{"privileged": m.Security.Privileged, "allowPrivilegeEscalation": m.Security.AllowPrivilegeEscalation, "runAsNonRoot": m.Security.RunAsNonRoot, "readOnlyRootFilesystem": m.Security.ReadOnlyRootFilesystem, "capabilities": map[string][]string{"drop": {"ALL"}, "add": m.Security.CapabilitiesAdd}}
	} else {
		if m.HostNetwork {
			podSpec["hostNetwork"] = true
		}
		podSpec["containers"].([]any)[0].(map[string]any)["securityContext"] = map[string]any{"windowsOptions": map[string]any{"hostProcess": m.HostProcess, "runAsUserName": m.RunAsUserName}}
	}
	return map[string]any{
		"apiVersion": "apps/v1", "kind": "Deployment",
		"metadata": map[string]any{"name": m.Name, "namespace": m.Namespace, "labels": labels, "annotations": m.Annotations},
		"spec": map[string]any{"replicas": m.Replicas, "strategy": map[string]string{"type": m.Strategy}, "selector": map[string]any{"matchLabels": map[string]string{"fleet.grafana.com/id": m.Labels["fleet.grafana.com/id"]}},
			"template": map[string]any{"metadata": map[string]any{"labels": templateLabels, "annotations": templateAnnotations}, "spec": podSpec},
		},
	}
}

func cloneLabels(input map[string]string) map[string]string {
	out := make(map[string]string, len(input))
	for k, v := range input {
		out[k] = v
	}
	return out
}

func managedOpAMPTokenPaths(osName string) (string, string) {
	if osName == "windows" {
		return `C:\var\run\secrets\fleet-opamp\token`, `C:\var\run\secrets\fleet-opamp`
	}
	return managedOpAMPTokenPath, managedOpAMPTokenMount
}
