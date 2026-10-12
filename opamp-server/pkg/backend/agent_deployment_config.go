package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
)

const agentDeploymentConfigEnv = "AGENT_DEPLOYMENT_CONFIG"

// LoadAgentDeploymentConfig reads only an explicit JSON allowlist. An unset
// variable produces an empty configuration and keeps deployment management off.
func LoadAgentDeploymentConfig(raw string) (AgentDeploymentConfig, error) {
	if strings.TrimSpace(raw) == "" {
		return AgentDeploymentConfig{}, nil
	}
	var config AgentDeploymentConfig
	decoder := json.NewDecoder(bytes.NewBufferString(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&config); err != nil {
		return AgentDeploymentConfig{}, fmt.Errorf("parse %s: %w", agentDeploymentConfigEnv, err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return AgentDeploymentConfig{}, fmt.Errorf("parse %s: trailing JSON content", agentDeploymentConfigEnv)
	}
	if !validKubernetesLabel(config.Namespace) {
		return AgentDeploymentConfig{}, fmt.Errorf("%s namespace must be a DNS label no longer than 63 characters", agentDeploymentConfigEnv)
	}
	if len(config.OpAMPTokenAudience) == 0 || len(config.OpAMPTokenAudience) > 253 || strings.ContainsAny(config.OpAMPTokenAudience, "\x00\r\n \t") {
		return AgentDeploymentConfig{}, fmt.Errorf("%s requires a valid opampTokenAudience", agentDeploymentConfigEnv)
	}
	if len(config.PermittedNodes) == 0 || len(config.PermittedServiceAccounts) == 0 || len(config.Profiles) == 0 {
		return AgentDeploymentConfig{}, fmt.Errorf("%s requires namespace, permittedNodes, permittedServiceAccounts, and profiles", agentDeploymentConfigEnv)
	}
	for name, profile := range config.Profiles {
		if !validLabelValue(name) || !validImageReference(profile.Image) || !validKubernetesLabel(profile.ServiceAccount) || !containsString(config.PermittedServiceAccounts, profile.ServiceAccount) || !validSecureOpAMPEndpoint(profile.OpAMPEndpoint) {
			return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q has invalid image, service account, or OpAMP endpoint", agentDeploymentConfigEnv, name)
		}
		if len(profile.Command) > 16 || len(profile.Args) > 64 {
			return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q has too many runtime arguments", agentDeploymentConfigEnv, name)
		}
		if !profile.SupportsOpAMPTokenFile {
			return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q must declare supportsOpampTokenFile", agentDeploymentConfigEnv, name)
		}
		for _, arg := range append(append([]string{}, profile.Command...), profile.Args...) {
			if len(arg) > 4096 || strings.ContainsAny(arg, "\x00\r\n") {
				return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q has an invalid runtime argument", agentDeploymentConfigEnv, name)
			}
		}
		if profile.OS == "" {
			profile.OS = "linux"
		}
		if profile.OS != "linux" && profile.OS != "windows" {
			return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q has invalid OS", agentDeploymentConfigEnv, name)
		}
		config.Profiles[name] = profile
	}
	if config.SecurityProfiles == nil {
		config.SecurityProfiles = map[string]AgentSecurityProfile{}
	}
	if _, ok := config.SecurityProfiles["restricted"]; !ok {
		config.SecurityProfiles["restricted"] = AgentSecurityProfile{OS: "linux", Summary: "Restricted Linux defaults", AllowPrivilegeEscalation: false}
	}
	if len(config.SecurityProfiles) > 32 {
		return AgentDeploymentConfig{}, fmt.Errorf("%s has too many security profiles", agentDeploymentConfigEnv)
	}
	for name, security := range config.SecurityProfiles {
		if err := validateAgentSecurityProfile(name, security); err != nil {
			return AgentDeploymentConfig{}, fmt.Errorf("%s security profile %q: %w", agentDeploymentConfigEnv, name, err)
		}
		if security.OS == "" {
			security.OS = "linux"
		}
		if security.RunAsNonRoot == nil && security.OS == "linux" {
			value := true
			security.RunAsNonRoot = &value
		}
		if security.ReadOnlyRootFilesystem == nil && security.OS == "linux" {
			value := true
			security.ReadOnlyRootFilesystem = &value
		}
		config.SecurityProfiles[name] = security
	}
	restricted := config.SecurityProfiles["restricted"]
	if restricted.OS != "linux" || restricted.HostPID || restricted.HostNetwork || restricted.HostIPC || restricted.Privileged || restricted.AllowPrivilegeEscalation || (restricted.RunAsNonRoot != nil && !*restricted.RunAsNonRoot) || (restricted.ReadOnlyRootFilesystem != nil && !*restricted.ReadOnlyRootFilesystem) || len(restricted.CapabilitiesAdd) != 0 {
		return AgentDeploymentConfig{}, fmt.Errorf("%s restricted profile must retain safe Linux defaults", agentDeploymentConfigEnv)
	}
	for name, profile := range config.Profiles {
		if len(profile.SecurityProfiles) > 32 {
			return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q has too many permitted security profiles", agentDeploymentConfigEnv, name)
		}
		if len(profile.SecurityProfiles) == 0 {
			profile.SecurityProfiles = []string{"restricted"}
		}
		if profile.DefaultSecurityProfile == "" {
			profile.DefaultSecurityProfile = profile.SecurityProfiles[0]
		}
		if !containsString(profile.SecurityProfiles, profile.DefaultSecurityProfile) {
			return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q default security profile is not permitted", agentDeploymentConfigEnv, name)
		}
		for _, securityName := range profile.SecurityProfiles {
			security, ok := config.SecurityProfiles[securityName]
			if !ok || security.OS != profile.OS {
				return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q references an unknown or OS-incompatible security profile", agentDeploymentConfigEnv, name)
			}
		}
		if hasDuplicates(profile.SecurityProfiles) {
			return AgentDeploymentConfig{}, fmt.Errorf("%s profile %q has duplicate security profiles", agentDeploymentConfigEnv, name)
		}
		config.Profiles[name] = profile
	}
	for _, node := range config.PermittedNodes {
		if !validDNSName(node) {
			return AgentDeploymentConfig{}, fmt.Errorf("%s contains an invalid permitted node", agentDeploymentConfigEnv)
		}
	}
	for _, account := range config.PermittedServiceAccounts {
		if !validKubernetesLabel(account) {
			return AgentDeploymentConfig{}, fmt.Errorf("%s contains an invalid permitted service account", agentDeploymentConfigEnv)
		}
	}
	return config, nil
}

func hasDuplicates(values []string) bool {
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		if seen[value] {
			return true
		}
		seen[value] = true
	}
	return false
}

func validateAgentSecurityProfile(name string, profile AgentSecurityProfile) error {
	if !validLabelValue(name) {
		return fmt.Errorf("name is invalid")
	}
	if profile.OS == "" {
		profile.OS = "linux"
	}
	if profile.OS != "linux" && profile.OS != "windows" {
		return fmt.Errorf("OS must be linux or windows")
	}
	if len(profile.Summary) > 256 || strings.ContainsAny(profile.Summary, "\x00\r\n") {
		return fmt.Errorf("summary is invalid")
	}
	if profile.OS == "windows" {
		if profile.HostPID || profile.HostIPC || profile.Privileged || len(profile.CapabilitiesAdd) > 0 || profile.RunAsNonRoot != nil || profile.AllowPrivilegeEscalation || profile.ReadOnlyRootFilesystem != nil {
			return fmt.Errorf("Linux security fields cannot be set for Windows")
		}
		if profile.HostProcess && (!profile.HostNetwork || strings.TrimSpace(profile.RunAsUserName) == "") {
			return fmt.Errorf("Windows HostProcess requires hostNetwork and runAsUserName")
		}
		if !profile.HostProcess && (profile.HostNetwork || profile.RunAsUserName != "") {
			return fmt.Errorf("hostNetwork and runAsUserName require HostProcess")
		}
		if len(profile.RunAsUserName) > 256 || strings.ContainsAny(profile.RunAsUserName, "\x00\r\n") {
			return fmt.Errorf("runAsUserName is invalid")
		}
		return nil
	}
	if profile.HostProcess || profile.RunAsUserName != "" {
		return fmt.Errorf("Windows security fields cannot be set for Linux")
	}
	if len(profile.CapabilitiesAdd) > 32 {
		return fmt.Errorf("too many capabilities")
	}
	seen := map[string]bool{}
	for _, capability := range profile.CapabilitiesAdd {
		if !linuxCapabilities[capability] || seen[capability] {
			return fmt.Errorf("capability %q is invalid or duplicated", capability)
		}
		seen[capability] = true
	}
	if (profile.Privileged || seen["SYS_ADMIN"]) && !profile.AllowPrivilegeEscalation {
		return fmt.Errorf("privileged or SYS_ADMIN requires allowPrivilegeEscalation")
	}
	return nil
}

var linuxCapabilities = map[string]bool{
	"AUDIT_CONTROL": true, "AUDIT_READ": true, "AUDIT_WRITE": true, "BLOCK_SUSPEND": true, "BPF": true,
	"CHECKPOINT_RESTORE": true, "CHOWN": true, "DAC_OVERRIDE": true, "DAC_READ_SEARCH": true, "FOWNER": true,
	"FSETID": true, "IPC_LOCK": true, "IPC_OWNER": true, "KILL": true, "LEASE": true, "LINUX_IMMUTABLE": true,
	"MAC_ADMIN": true, "MAC_OVERRIDE": true, "MKNOD": true, "NET_ADMIN": true, "NET_BIND_SERVICE": true,
	"NET_BROADCAST": true, "NET_RAW": true, "PERFMON": true, "SETGID": true, "SETFCAP": true, "SETPCAP": true,
	"SETUID": true, "SYS_ADMIN": true, "SYS_BOOT": true, "SYS_CHROOT": true, "SYS_MODULE": true,
	"SYS_NICE": true, "SYS_PACCT": true, "SYS_PTRACE": true, "SYS_RAWIO": true, "SYS_RESOURCE": true,
	"SYS_TIME": true, "SYS_TTY_CONFIG": true, "SYSLOG": true, "WAKE_ALARM": true,
}

var agentDeploymentConfigOnce sync.Once
var cachedAgentDeploymentService *AgentDeploymentService
var cachedAgentDeploymentServiceErr error

func configuredAgentDeploymentService() (*AgentDeploymentService, error) {
	agentDeploymentConfigOnce.Do(func() {
		config, err := LoadAgentDeploymentConfig(os.Getenv(agentDeploymentConfigEnv))
		if err != nil {
			cachedAgentDeploymentServiceErr = err
			return
		}
		if len(config.Profiles) == 0 {
			cachedAgentDeploymentService = NewAgentDeploymentService(config, nil)
			return
		}
		adapter, err := NewInClusterAgentDeploymentAdapterFromEnvironment()
		if err != nil {
			cachedAgentDeploymentServiceErr = err
			return
		}
		cachedAgentDeploymentService = NewAgentDeploymentService(config, adapter)
		cachedAgentDeploymentService.SetEnrollmentStore(SQLManagedEnrollmentStore{})
	})
	return cachedAgentDeploymentService, cachedAgentDeploymentServiceErr
}
