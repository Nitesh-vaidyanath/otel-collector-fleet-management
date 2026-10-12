package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strings"
)

// AgentDeploymentConfig is an explicit allowlist. An empty or incomplete
// configuration disables deployment creation.
type AgentDeploymentConfig struct {
	Namespace                string                            `json:"namespace"`
	OpAMPTokenAudience       string                            `json:"opampTokenAudience,omitempty"`
	PermittedNodes           []string                          `json:"permittedNodes"`
	PermittedServiceAccounts []string                          `json:"permittedServiceAccounts"`
	Profiles                 map[string]AgentDeploymentProfile `json:"profiles"`
	SecurityProfiles         map[string]AgentSecurityProfile   `json:"securityProfiles,omitempty"`
}

type AgentDeploymentProfile struct {
	Image                  string   `json:"image"`
	ServiceAccount         string   `json:"serviceAccount"`
	Command                []string `json:"command,omitempty"`
	Args                   []string `json:"args,omitempty"`
	OpAMPEndpoint          string   `json:"opampEndpoint"`
	OS                     string   `json:"os,omitempty"`
	SecurityProfiles       []string `json:"securityProfiles,omitempty"`
	DefaultSecurityProfile string   `json:"defaultSecurityProfile,omitempty"`
	SupportsOpAMPTokenFile bool     `json:"supportsOpampTokenFile,omitempty"`
}

type AgentSecurityProfile struct {
	OS                       string   `json:"os,omitempty"`
	Summary                  string   `json:"summary,omitempty"`
	HostPID                  bool     `json:"hostPID,omitempty"`
	HostNetwork              bool     `json:"hostNetwork,omitempty"`
	HostIPC                  bool     `json:"hostIPC,omitempty"`
	Privileged               bool     `json:"privileged,omitempty"`
	CapabilitiesAdd          []string `json:"capabilitiesAdd,omitempty"`
	RunAsNonRoot             *bool    `json:"runAsNonRoot,omitempty"`
	AllowPrivilegeEscalation bool     `json:"allowPrivilegeEscalation,omitempty"`
	ReadOnlyRootFilesystem   *bool    `json:"readOnlyRootFilesystem,omitempty"`
	HostProcess              bool     `json:"hostProcess,omitempty"`
	RunAsUserName            string   `json:"runAsUserName,omitempty"`
}

type AgentSecurityView struct {
	OS                       string   `json:"os"`
	HostPID                  *bool    `json:"hostPID,omitempty"`
	HostNetwork              *bool    `json:"hostNetwork,omitempty"`
	HostIPC                  *bool    `json:"hostIPC,omitempty"`
	Privileged               *bool    `json:"privileged,omitempty"`
	CapabilitiesAdd          []string `json:"capabilitiesAdd,omitempty"`
	CapabilitiesDrop         []string `json:"capabilitiesDrop,omitempty"`
	RunAsNonRoot             *bool    `json:"runAsNonRoot,omitempty"`
	AllowPrivilegeEscalation *bool    `json:"allowPrivilegeEscalation,omitempty"`
	ReadOnlyRootFilesystem   *bool    `json:"readOnlyRootFilesystem,omitempty"`
	HostProcess              *bool    `json:"hostProcess,omitempty"`
	RunAsUserName            string   `json:"runAsUserName,omitempty"`
}

type AgentDeploymentRequest struct {
	Profile         string
	Node            string
	SecurityProfile string
	OrgID           int64
	Owner           string
}

// AgentDeploymentManifest deliberately models only the Kubernetes fields this
// MVP needs; adapter implementations translate it to their Kubernetes client.
type AgentDeploymentManifest struct {
	Namespace                       string
	Name                            string
	UID                             string
	ResourceVersion                 string
	Labels                          map[string]string
	Annotations                     map[string]string
	TemplateLabels                  map[string]string
	TemplateAnnotations             map[string]string
	PodOSPresent                    bool
	PodSecurityContextPresent       bool
	ContainerSecurityContextPresent bool
	CapabilitiesPresent             bool
	WindowsOptionsPresent           bool
	ContainerCount                  int
	Replicas                        int32
	Strategy                        string
	Image                           string
	ServiceAccount                  string
	Command                         []string
	Args                            []string
	OpAMPEndpoint                   string
	Status                          string
	DesiredReplicas                 int32
	ReadyReplicas                   int32
	ServiceAccountToken             bool
	OpAMPTokenAudience              string
	OpAMPTokenFile                  bool
	NodeAffinityKey                 string
	NodeAffinityOp                  string
	NodeAffinityValues              []string
	NodeSelector                    map[string]string
	Security                        AgentContainerSecurity
	OS                              string
	HostPID                         bool
	HostNetwork                     bool
	HostIPC                         bool
	HostProcess                     bool
	RunAsUserName                   string
	SecurityProfile                 string
	SecurityProfileHash             string
	Generation                      int64
	ObservedGeneration              int64
	UpdatedReplicas                 int32
}

type AgentContainerSecurity struct {
	Privileged               bool
	AllowPrivilegeEscalation bool
	RunAsNonRoot             bool
	ReadOnlyRootFilesystem   bool
	CapabilitiesDrop         []string
	CapabilitiesAdd          []string
	RunAsUserName            string
}

type AgentDeploymentRecord struct {
	FleetID             string            `json:"fleetId"`
	UID                 string            `json:"uid"`
	Name                string            `json:"name"`
	Namespace           string            `json:"namespace"`
	OrgID               int64             `json:"orgId"`
	Owner               string            `json:"owner"`
	Profile             string            `json:"profile"`
	Node                string            `json:"node"`
	Image               string            `json:"image"`
	ServiceAccount      string            `json:"serviceAccount"`
	Status              string            `json:"status"`
	DesiredReplicas     int32             `json:"desiredReplicas"`
	ReadyReplicas       int32             `json:"readyReplicas"`
	ResourceVersion     string            `json:"resourceVersion,omitempty"`
	Generation          int64             `json:"generation,omitempty"`
	ObservedGeneration  int64             `json:"observedGeneration,omitempty"`
	UpdatedReplicas     int32             `json:"updatedReplicas,omitempty"`
	SecurityProfile     string            `json:"securityProfile,omitempty"`
	SecurityProfileHash string            `json:"securityProfileHash,omitempty"`
	Security            AgentSecurityView `json:"security,omitempty"`
	OpAMP               *ManagedOpAMPView `json:"opamp,omitempty"`
}

// AgentDeploymentAdapter is the boundary to Kubernetes. The backend itself
// never reads kubeconfig or constructs a client from host credentials.
type AgentDeploymentAdapter interface {
	Create(context.Context, AgentDeploymentManifest) (AgentDeploymentManifest, error)
	Get(context.Context, string, string) (AgentDeploymentManifest, error)
	Delete(context.Context, string, string, string) error
	SetReplicas(context.Context, string, string, string, string, int32) error
	Restart(context.Context, string, string, string, string) error
	UpdateSecurity(context.Context, AgentDeploymentManifest, AgentDeploymentManifest) error
	List(context.Context, string, map[string]string) ([]AgentDeploymentManifest, error)
}

type AgentDeploymentService struct {
	config  AgentDeploymentConfig
	adapter AgentDeploymentAdapter
	store   ManagedEnrollmentStore
}

var deploymentDNSName = regexp.MustCompile(`^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$`)
var deploymentDNSLabel = regexp.MustCompile(`^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$`)

var ErrAgentDeploymentsDisabled = errors.New("agent deployments are disabled")
var ErrAgentDeploymentNotFound = errors.New("agent deployment not found")
var ErrAgentDeploymentForbidden = errors.New("agent deployment is not owned by this organization or user")
var ErrAgentDeploymentInvalidRequest = errors.New("invalid agent deployment request")

func NewAgentDeploymentService(config AgentDeploymentConfig, adapter AgentDeploymentAdapter) *AgentDeploymentService {
	config = normalizeAgentDeploymentConfig(config)
	return &AgentDeploymentService{config: config, adapter: adapter, store: NewMemoryManagedEnrollmentStore()}
}

func (s *AgentDeploymentService) SetEnrollmentStore(store ManagedEnrollmentStore) {
	if s != nil && store != nil {
		s.store = store
	}
}

func normalizeAgentDeploymentConfig(config AgentDeploymentConfig) AgentDeploymentConfig {
	if config.SecurityProfiles == nil {
		config.SecurityProfiles = map[string]AgentSecurityProfile{}
	}
	if _, ok := config.SecurityProfiles["restricted"]; !ok {
		config.SecurityProfiles["restricted"] = AgentSecurityProfile{OS: "linux", Summary: "Restricted Linux defaults"}
	}
	for name, profile := range config.Profiles {
		if profile.OS == "" {
			profile.OS = "linux"
		}
		if len(profile.SecurityProfiles) == 0 {
			profile.SecurityProfiles = []string{"restricted"}
		}
		if profile.DefaultSecurityProfile == "" {
			profile.DefaultSecurityProfile = profile.SecurityProfiles[0]
		}
		config.Profiles[name] = profile
	}
	for name, profile := range config.SecurityProfiles {
		if profile.OS == "" {
			profile.OS = "linux"
		}
		if profile.RunAsNonRoot == nil && profile.OS == "linux" {
			v := true
			profile.RunAsNonRoot = &v
		}
		if profile.ReadOnlyRootFilesystem == nil && profile.OS == "linux" {
			v := true
			profile.ReadOnlyRootFilesystem = &v
		}
		config.SecurityProfiles[name] = profile
	}
	return config
}

func (s *AgentDeploymentService) Enabled() bool { return s.enabled() }

func (s *AgentDeploymentService) Options() ([]map[string]any, []string, []map[string]any) {
	if !s.enabled() {
		return []map[string]any{}, []string{}, []map[string]any{}
	}
	profiles := make([]map[string]any, 0, len(s.config.Profiles))
	names := make([]string, 0, len(s.config.Profiles))
	for name := range s.config.Profiles {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		profile := s.config.Profiles[name]
		profiles = append(profiles, map[string]any{"name": name, "image": profile.Image, "os": profile.OS, "permittedSecurityProfiles": append([]string(nil), profile.SecurityProfiles...), "defaultSecurityProfile": profile.DefaultSecurityProfile})
	}
	nodes := append([]string(nil), s.config.PermittedNodes...)
	sort.Strings(nodes)
	securityProfiles := make([]map[string]any, 0, len(s.config.SecurityProfiles))
	securityNames := make([]string, 0, len(s.config.SecurityProfiles))
	for name := range s.config.SecurityProfiles {
		securityNames = append(securityNames, name)
	}
	sort.Strings(securityNames)
	for _, name := range securityNames {
		profile := normalizeSecurityProfile(s.config.SecurityProfiles[name])
		securityProfiles = append(securityProfiles, map[string]any{"name": name, "os": profile.OS, "summary": profile.Summary, "security": profile})
	}
	return profiles, nodes, securityProfiles
}

func (s *AgentDeploymentService) enabled() bool {
	if s == nil || s.adapter == nil || s.store == nil || !validKubernetesLabel(s.config.Namespace) || strings.TrimSpace(s.config.OpAMPTokenAudience) == "" || len(s.config.PermittedNodes) == 0 || len(s.config.PermittedServiceAccounts) == 0 || len(s.config.Profiles) == 0 {
		return false
	}
	for profileName, profile := range s.config.Profiles {
		if !validImageReference(profile.Image) || !validLabelValue(profileName) || !containsString(s.config.PermittedServiceAccounts, profile.ServiceAccount) || !validKubernetesLabel(profile.ServiceAccount) || !validSecureOpAMPEndpoint(profile.OpAMPEndpoint) || len(profile.Command) > 16 || len(profile.Args) > 64 {
			return false
		}
		for _, arg := range append(append([]string{}, profile.Command...), profile.Args...) {
			if len(arg) > 4096 || strings.ContainsAny(arg, "\x00\r\n") {
				return false
			}
		}
		if profile.OS != "linux" && profile.OS != "windows" || !profile.SupportsOpAMPTokenFile || !containsString(profile.SecurityProfiles, profile.DefaultSecurityProfile) {
			return false
		}
		for _, securityName := range profile.SecurityProfiles {
			security, ok := s.config.SecurityProfiles[securityName]
			if !ok || security.OS != profile.OS || validateAgentSecurityProfile(securityName, security) != nil {
				return false
			}
		}
	}
	if restricted, ok := s.config.SecurityProfiles["restricted"]; ok {
		restricted = normalizeSecurityProfile(restricted)
		if restricted.OS != "linux" || restricted.HostPID || restricted.HostNetwork || restricted.HostIPC || restricted.Privileged || restricted.AllowPrivilegeEscalation || (restricted.RunAsNonRoot != nil && !*restricted.RunAsNonRoot) || !*restricted.ReadOnlyRootFilesystem || len(restricted.CapabilitiesAdd) != 0 {
			return false
		}
	}
	for _, account := range s.config.PermittedServiceAccounts {
		if !validKubernetesLabel(account) {
			return false
		}
	}
	for _, node := range s.config.PermittedNodes {
		if !validDNSName(node) {
			return false
		}
	}
	return true
}

func (s *AgentDeploymentService) Create(ctx context.Context, request AgentDeploymentRequest) (AgentDeploymentRecord, error) {
	if !s.enabled() {
		return AgentDeploymentRecord{}, ErrAgentDeploymentsDisabled
	}
	profile, ok := s.config.Profiles[request.Profile]
	if !ok || !validLabelValue(request.Profile) {
		return AgentDeploymentRecord{}, fmt.Errorf("%w: profile is not permitted", ErrAgentDeploymentInvalidRequest)
	}
	if !containsString(s.config.PermittedNodes, request.Node) {
		return AgentDeploymentRecord{}, fmt.Errorf("%w: node is not permitted", ErrAgentDeploymentInvalidRequest)
	}
	if request.SecurityProfile == "" {
		request.SecurityProfile = profile.DefaultSecurityProfile
	}
	if !containsString(profile.SecurityProfiles, request.SecurityProfile) {
		return AgentDeploymentRecord{}, fmt.Errorf("%w: security profile is not permitted", ErrAgentDeploymentInvalidRequest)
	}
	security := s.config.SecurityProfiles[request.SecurityProfile]
	securityHash, resolvedSecurity := resolveSecurityProfile(security)
	if request.OrgID <= 0 || strings.TrimSpace(request.Owner) == "" || strings.ContainsAny(request.Owner, "\x00\n\r") {
		return AgentDeploymentRecord{}, fmt.Errorf("%w: organization and owner are required", ErrAgentDeploymentInvalidRequest)
	}
	fleetID, err := newFleetID()
	if err != nil {
		return AgentDeploymentRecord{}, fmt.Errorf("generate fleet ID: %w", err)
	}
	name := "fleet-agent-" + fleetID
	labels := map[string]string{
		"app.kubernetes.io/managed-by":       "grafana-agent-fleet-management",
		"fleet.grafana.com/id":               fleetID,
		"fleet.grafana.com/org-id":           fmt.Sprintf("%d", request.OrgID),
		"fleet.grafana.com/owner":            ownerLabel(request.Owner),
		"fleet.grafana.com/profile":          request.Profile,
		"fleet.grafana.com/security-profile": request.SecurityProfile,
	}
	annotations := map[string]string{"fleet.grafana.com/owner-login": request.Owner, "fleet.grafana.com/security-profile-hash": securityHash}
	manifest := AgentDeploymentManifest{
		Namespace: s.config.Namespace, Name: name, Labels: labels, Annotations: annotations, TemplateLabels: cloneLabels(labels), TemplateAnnotations: map[string]string{"fleet.grafana.com/security-profile-hash": securityHash}, Replicas: 1, Strategy: "Recreate",
		Image: profile.Image, ServiceAccountToken: false, ServiceAccount: profile.ServiceAccount,
		OpAMPTokenAudience: s.config.OpAMPTokenAudience, OpAMPTokenFile: profile.SupportsOpAMPTokenFile,
		Command: append([]string(nil), profile.Command...), Args: append([]string(nil), profile.Args...), OpAMPEndpoint: profile.OpAMPEndpoint,
		NodeAffinityKey: "metadata.name", NodeAffinityOp: "In", NodeAffinityValues: []string{request.Node}, OS: profile.OS,
		NodeSelector: map[string]string{"kubernetes.io/os": profile.OS}, PodOSPresent: true, PodSecurityContextPresent: profile.OS == "linux", ContainerSecurityContextPresent: true, CapabilitiesPresent: profile.OS == "linux", WindowsOptionsPresent: profile.OS == "windows", ContainerCount: 1,
		SecurityProfile: request.SecurityProfile, SecurityProfileHash: securityHash, Security: resolvedSecurity,
		HostPID: security.HostPID, HostNetwork: security.HostNetwork, HostIPC: security.HostIPC, HostProcess: security.HostProcess, RunAsUserName: security.RunAsUserName,
	}
	created, err := s.adapter.Create(ctx, manifest)
	if err != nil {
		return AgentDeploymentRecord{}, err
	}
	if strings.TrimSpace(created.UID) == "" {
		return AgentDeploymentRecord{}, fmt.Errorf("adapter created deployment without Kubernetes UID")
	}
	enrollment := ManagedEnrollment{FleetID: fleetID, DeploymentUID: created.UID, Namespace: created.Namespace,
		Name: created.Name, OrgID: request.OrgID, Owner: request.Owner, ServiceAccount: profile.ServiceAccount,
		AgentUID: stableManagedAgentUID(fleetID, created.UID)}
	if err := s.store.Create(ctx, enrollment); err != nil {
		_ = s.adapter.Delete(ctx, created.Namespace, created.Name, created.UID)
		return AgentDeploymentRecord{}, fmt.Errorf("persist managed deployment enrollment: %w", err)
	}
	record := recordFromManifest(created)
	record.OpAMP = managedViewFromEnrollment(enrollment, created)
	return record, nil
}

func resolveSecurityProfile(profile AgentSecurityProfile) (string, AgentContainerSecurity) {
	profile = normalizeSecurityProfile(profile)
	hashProfile := profile
	hashProfile.Summary = ""
	capabilitiesAdd := append([]string(nil), profile.CapabilitiesAdd...)
	sort.Strings(capabilitiesAdd)
	hashProfile.CapabilitiesAdd = capabilitiesAdd
	encoded, _ := json.Marshal(hashProfile)
	hash := sha256.Sum256(encoded)
	security := AgentContainerSecurity{Privileged: profile.Privileged, AllowPrivilegeEscalation: profile.AllowPrivilegeEscalation, CapabilitiesDrop: []string{"ALL"}, CapabilitiesAdd: capabilitiesAdd}
	if profile.RunAsNonRoot != nil {
		security.RunAsNonRoot = *profile.RunAsNonRoot
	}
	if profile.ReadOnlyRootFilesystem != nil {
		security.ReadOnlyRootFilesystem = *profile.ReadOnlyRootFilesystem
	}
	security.RunAsUserName = profile.RunAsUserName
	return hex.EncodeToString(hash[:]), security
}

func normalizeSecurityProfile(profile AgentSecurityProfile) AgentSecurityProfile {
	if profile.OS == "" {
		profile.OS = "linux"
	}
	if profile.RunAsNonRoot == nil && profile.OS == "linux" {
		v := true
		profile.RunAsNonRoot = &v
	}
	if profile.ReadOnlyRootFilesystem == nil && profile.OS == "linux" {
		v := true
		profile.ReadOnlyRootFilesystem = &v
	}
	return profile
}

func (s *AgentDeploymentService) List(ctx context.Context, orgID int64, owner string) ([]AgentDeploymentRecord, error) {
	if !s.enabled() {
		return nil, ErrAgentDeploymentsDisabled
	}
	if orgID <= 0 || strings.TrimSpace(owner) == "" {
		return nil, fmt.Errorf("organization and owner are required")
	}
	labels := map[string]string{"fleet.grafana.com/org-id": fmt.Sprintf("%d", orgID), "fleet.grafana.com/owner": ownerLabel(owner)}
	manifests, err := s.adapter.List(ctx, s.config.Namespace, labels)
	if err != nil {
		return nil, err
	}
	records := make([]AgentDeploymentRecord, 0, len(manifests))
	for _, manifest := range manifests {
		if !isManagedAgent(manifest) || manifest.Namespace != s.config.Namespace || !validFleetID(manifest.Labels["fleet.grafana.com/id"]) || manifest.Labels["fleet.grafana.com/org-id"] != labels["fleet.grafana.com/org-id"] || manifest.Labels["fleet.grafana.com/owner"] != labels["fleet.grafana.com/owner"] {
			continue
		}
		record := recordFromManifest(manifest)
		if enrollment, err := s.store.GetByFleetID(ctx, record.FleetID); err == nil {
			record.OpAMP = managedViewFromEnrollment(enrollment, manifest)
		} else {
			record.OpAMP = &ManagedOpAMPView{Association: "unverified", Connected: false}
		}
		records = append(records, record)
	}
	return records, nil
}

func (s *AgentDeploymentService) Delete(ctx context.Context, fleetID string, orgID int64, owner string) error {
	manifest, err := s.authorizedManifest(ctx, fleetID, orgID, owner)
	if err != nil {
		return err
	}
	if err := s.adapter.Delete(ctx, s.config.Namespace, manifest.Name, manifest.UID); err != nil {
		return err
	}
	return s.store.Revoke(ctx, fleetID, manifest.UID)
}

func managedViewFromEnrollment(e ManagedEnrollment, m AgentDeploymentManifest) *ManagedOpAMPView {
	association := "unverified"
	if e.PodUID != "" && !e.LastSeen.IsZero() { association = "verified" }
	view := &ManagedOpAMPView{AgentUID: e.AgentUID, Association: association, Connected: false,
		EffectiveConfigHash: e.EffectiveConfigHash, RemoteConfigStatus: e.RemoteConfigStatus,
		ProfileMatches: false}
	if e.Revoked || e.DeploymentUID != m.UID {
		view.Association, view.Connected, view.ProfileMatches = "revoked", false, false
	}
	if e.PodUID != "" {
		view.PodUID = e.PodUID
	}
	if !e.LastSeen.IsZero() {
		value := e.LastSeen.UTC()
		view.LastSeen = &value
	}
	return view
}

func (s *AgentDeploymentService) Start(ctx context.Context, fleetID string, orgID int64, owner string) error {
	return s.setReplicas(ctx, fleetID, orgID, owner, 1)
}

func (s *AgentDeploymentService) Stop(ctx context.Context, fleetID string, orgID int64, owner string) error {
	return s.setReplicas(ctx, fleetID, orgID, owner, 0)
}

func (s *AgentDeploymentService) Restart(ctx context.Context, fleetID string, orgID int64, owner string) error {
	manifest, err := s.authorizedManifest(ctx, fleetID, orgID, owner)
	if err != nil {
		return err
	}
	return s.adapter.Restart(ctx, s.config.Namespace, manifest.Name, manifest.UID, manifest.ResourceVersion)
}

func (s *AgentDeploymentService) UpdateSecurityProfile(ctx context.Context, fleetID string, orgID int64, owner, securityName, expectedUID, expectedRV string) (AgentDeploymentRecord, error) {
	manifest, err := s.authorizedManifest(ctx, fleetID, orgID, owner)
	if err != nil {
		return AgentDeploymentRecord{}, err
	}
	if expectedUID == "" || expectedRV == "" || manifest.UID != expectedUID || manifest.ResourceVersion != expectedRV {
		return AgentDeploymentRecord{}, ErrAgentDeploymentConflict
	}
	runtimeProfile, ok := s.config.Profiles[manifest.Labels["fleet.grafana.com/profile"]]
	if !ok || !containsString(runtimeProfile.SecurityProfiles, securityName) {
		return AgentDeploymentRecord{}, fmt.Errorf("%w: security profile is not permitted for this runtime profile", ErrAgentDeploymentInvalidRequest)
	}
	if runtimeProfile.OS == "" {
		runtimeProfile.OS = "linux"
	}
	selectorOS := manifest.NodeSelector["kubernetes.io/os"]
	if manifest.OS != "" && selectorOS != "" && manifest.OS != selectorOS {
		return AgentDeploymentRecord{}, ErrAgentDeploymentConflict
	}
	currentOS := manifest.OS
	if currentOS == "" {
		currentOS = selectorOS
	}
	if currentOS == "" {
		if runtimeProfile.OS != "linux" {
			return AgentDeploymentRecord{}, ErrAgentDeploymentConflict
		}
		currentOS = "linux" // Pre-feature workloads were Linux-only.
	}
	if currentOS != runtimeProfile.OS {
		return AgentDeploymentRecord{}, ErrAgentDeploymentConflict
	}
	manifest.OS = currentOS
	securityProfile, ok := s.config.SecurityProfiles[securityName]
	if !ok || securityProfile.OS != runtimeProfile.OS {
		return AgentDeploymentRecord{}, fmt.Errorf("%w: security profile is unavailable", ErrAgentDeploymentInvalidRequest)
	}
	hash, security := resolveSecurityProfile(securityProfile)
	updated := manifest
	updated.OS = currentOS
	updated.SecurityProfile = securityName
	updated.SecurityProfileHash = hash
	updated.Security = security
	updated.HostPID = securityProfile.HostPID
	updated.HostNetwork = securityProfile.HostNetwork
	updated.HostIPC = securityProfile.HostIPC
	updated.HostProcess = securityProfile.HostProcess
	updated.RunAsUserName = securityProfile.RunAsUserName
	if err := s.adapter.UpdateSecurity(ctx, manifest, updated); err != nil {
		return AgentDeploymentRecord{}, err
	}
	current, err := s.adapter.Get(ctx, manifest.Namespace, manifest.Name)
	if err != nil {
		return AgentDeploymentRecord{}, err
	}
	record := recordFromManifest(current)
	if current.Generation > current.ObservedGeneration || (current.DesiredReplicas > 0 && current.UpdatedReplicas < current.DesiredReplicas) {
		record.Status = "Updating"
	}
	return record, nil
}

func (s *AgentDeploymentService) setReplicas(ctx context.Context, fleetID string, orgID int64, owner string, replicas int32) error {
	manifest, err := s.authorizedManifest(ctx, fleetID, orgID, owner)
	if err != nil {
		return err
	}
	return s.adapter.SetReplicas(ctx, s.config.Namespace, manifest.Name, manifest.UID, manifest.ResourceVersion, replicas)
}

func (s *AgentDeploymentService) authorizedManifest(ctx context.Context, fleetID string, orgID int64, owner string) (AgentDeploymentManifest, error) {
	if !s.enabled() {
		return AgentDeploymentManifest{}, ErrAgentDeploymentsDisabled
	}
	if !validFleetID(fleetID) || orgID <= 0 || strings.TrimSpace(owner) == "" {
		return AgentDeploymentManifest{}, ErrAgentDeploymentNotFound
	}
	manifest, err := s.adapter.Get(ctx, s.config.Namespace, "fleet-agent-"+fleetID)
	if err != nil {
		return AgentDeploymentManifest{}, err
	}
	if !isManagedAgent(manifest) || manifest.Namespace != s.config.Namespace || manifest.Name != "fleet-agent-"+fleetID || strings.TrimSpace(manifest.UID) == "" {
		return AgentDeploymentManifest{}, ErrAgentDeploymentNotFound
	}
	if manifest.Labels["fleet.grafana.com/id"] != fleetID {
		return AgentDeploymentManifest{}, ErrAgentDeploymentNotFound
	}
	if manifest.Labels["fleet.grafana.com/org-id"] != fmt.Sprintf("%d", orgID) || manifest.Labels["fleet.grafana.com/owner"] != ownerLabel(owner) {
		return AgentDeploymentManifest{}, ErrAgentDeploymentForbidden
	}
	return manifest, nil
}

func isManagedAgent(m AgentDeploymentManifest) bool {
	return m.Labels["app.kubernetes.io/managed-by"] == "grafana-agent-fleet-management" && m.Labels["fleet.grafana.com/id"] != ""
}

func recordFromManifest(m AgentDeploymentManifest) AgentDeploymentRecord {
	owner := m.Annotations["fleet.grafana.com/owner-login"]
	if owner == "" {
		owner = m.Labels["fleet.grafana.com/owner"]
	}
	status := m.Status
	if status == "" {
		if m.DesiredReplicas == 0 {
			status = "Stopped"
		} else if m.ReadyReplicas >= m.DesiredReplicas {
			status = "Running"
		} else {
			status = "Pending"
		}
	}
	if m.Generation > m.ObservedGeneration || (m.Generation > 0 && m.DesiredReplicas > 0 && m.UpdatedReplicas < m.DesiredReplicas) {
		status = "Updating"
	}
	resolved := AgentSecurityView{OS: m.OS}
	if resolved.OS == "" {
		resolved.OS = "linux"
	}
	if resolved.OS == "linux" {
		resolved.HostPID, resolved.HostNetwork, resolved.HostIPC = boolValue(m.HostPID), boolValue(m.HostNetwork), boolValue(m.HostIPC)
		resolved.Privileged, resolved.AllowPrivilegeEscalation = boolValue(m.Security.Privileged), boolValue(m.Security.AllowPrivilegeEscalation)
		resolved.CapabilitiesAdd, resolved.CapabilitiesDrop = append([]string(nil), m.Security.CapabilitiesAdd...), []string{"ALL"}
		resolved.RunAsNonRoot, resolved.ReadOnlyRootFilesystem = boolValue(m.Security.RunAsNonRoot), boolValue(m.Security.ReadOnlyRootFilesystem)
	} else {
		resolved.HostNetwork, resolved.HostProcess, resolved.RunAsUserName = boolValue(m.HostNetwork), boolValue(m.HostProcess), m.RunAsUserName
	}
	securityHash := m.SecurityProfileHash
	if securityHash == "" {
		securityHash = m.Annotations["fleet.grafana.com/security-profile-hash"]
	}
	return AgentDeploymentRecord{FleetID: m.Labels["fleet.grafana.com/id"], UID: m.UID, Name: m.Name, Namespace: m.Namespace, OrgID: parseOrgID(m.Labels["fleet.grafana.com/org-id"]), Owner: owner, Profile: m.Labels["fleet.grafana.com/profile"], Node: firstOrEmpty(m.NodeAffinityValues), Image: m.Image, ServiceAccount: m.ServiceAccount, Status: status, DesiredReplicas: m.DesiredReplicas, ReadyReplicas: m.ReadyReplicas, ResourceVersion: m.ResourceVersion, Generation: m.Generation, ObservedGeneration: m.ObservedGeneration, UpdatedReplicas: m.UpdatedReplicas, SecurityProfile: m.SecurityProfile, SecurityProfileHash: securityHash, Security: resolved}
}

func boolValue(value bool) *bool { copy := value; return &copy }

func validDNSName(v string) bool {
	return len(v) > 0 && len(v) <= 253 && deploymentDNSName.MatchString(v) && !strings.Contains(v, "..")
}
func validKubernetesLabel(v string) bool {
	return len(v) > 0 && len(v) <= 63 && deploymentDNSLabel.MatchString(v)
}
func validOpAMPEndpoint(v string) bool {
	parsed, err := url.Parse(v)
	return err == nil && (parsed.Scheme == "ws" || parsed.Scheme == "wss") && parsed.Host != "" && parsed.User == nil && parsed.Fragment == "" && parsed.RawQuery == ""
}

func validSecureOpAMPEndpoint(v string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(v)), "wss://") && validOpAMPEndpoint(v)
}
func validLabelValue(v string) bool {
	return len(v) > 0 && len(v) <= 63 && regexp.MustCompile(`^[A-Za-z0-9](?:[-A-Za-z0-9_.]*[A-Za-z0-9])?$`).MatchString(v)
}
func validImageReference(v string) bool {
	return strings.TrimSpace(v) == v && v != "" && !strings.ContainsAny(v, " \t\r\n\x00") && !strings.HasPrefix(v, "-")
}
func validFleetID(v string) bool {
	if len(v) != 32 {
		return false
	}
	_, err := hex.DecodeString(v)
	return err == nil
}
func newFleetID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
func containsString(values []string, wanted string) bool {
	for _, v := range values {
		if v == wanted {
			return true
		}
	}
	return false
}
func labelValue(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	var b strings.Builder
	lastDash := false
	for _, r := range v {
		valid := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-'
		if valid {
			b.WriteRune(r)
			lastDash = false
		} else if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-._")
	if len(out) > 63 {
		out = out[:63]
	}
	if out == "" {
		return "unknown"
	}
	return out
}
func ownerLabel(v string) string {
	hash := sha256.Sum256([]byte(v))
	prefix := labelValue(v)
	if len(prefix) > 38 {
		prefix = prefix[:38]
	}
	return fmt.Sprintf("%s-%x", prefix, hash[:12])
}
func parseOrgID(v string) int64 { var id int64; _, _ = fmt.Sscan(v, &id); return id }
func firstOrEmpty(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}
