export type AgentSecurity = {
  os?: string;
  hostPID?: boolean;
  hostNetwork?: boolean;
  hostIPC?: boolean;
  hostProcess?: boolean;
  privileged?: boolean;
  capabilitiesAdd?: string[];
  allowPrivilegeEscalation?: boolean;
  runAsNonRoot?: boolean;
  readOnlyRootFilesystem?: boolean;
  runAsUserName?: string;
};

export type RuntimeProfile = {
  name: string;
  image?: string;
  os?: string;
  permittedSecurityProfiles?: string[];
  defaultSecurityProfile?: string;
};

export type SecurityProfile = { name: string; os?: string; summary?: string; security?: AgentSecurity };

export type DeploymentOpamp = {
  agentUid?: string;
  association?: 'verified' | 'unverified' | 'revoked';
  connected?: boolean;
  podUid?: string;
  effectiveConfigHash?: string;
  remoteConfigStatus?: string;
  lastSeen?: string;
  profileMatches?: boolean;
};

// Never infer a management target from a workload name or client-supplied label.
export function verifiedAgentTarget(opamp: DeploymentOpamp | undefined): string | undefined {
  if (opamp?.association !== 'verified' || !opamp.agentUid?.trim()) return undefined;
  return opamp.agentUid;
}

export function deploymentConnectionSummary(opamp: DeploymentOpamp | undefined): string {
  if (opamp?.association === 'revoked') return 'Enrollment revoked';
  if (!verifiedAgentTarget(opamp)) return 'Not verified';
  if (!opamp?.connected) return 'Enrolled · offline';
  if (opamp.profileMatches !== true) return 'Connected · desired profile not verified';
  return 'Connected · profile verified';
}

export function permittedSecurityProfiles(profile: RuntimeProfile | undefined, choices: SecurityProfile[]): SecurityProfile[] {
  if (!profile) return [];
  const permitted = profile.permittedSecurityProfiles ?? ['restricted'];
  const os = profile.os || 'linux';
  return choices.filter((choice) => permitted.includes(choice.name) && (choice.os || choice.security?.os || 'linux') === os);
}

export function summarizeAgentSecurity(security: AgentSecurity | undefined): string {
  if (!security) return 'Security settings unavailable';
  const settings: string[] = [];
  if (security.hostPID) settings.push('host PID');
  if (security.hostNetwork) settings.push('host network');
  if (security.hostIPC) settings.push('host IPC');
  if (security.hostProcess) settings.push('Windows HostProcess');
  if (security.privileged) settings.push('privileged');
  if (security.capabilitiesAdd?.length) settings.push(`capabilities: ${security.capabilitiesAdd.join(', ')}`);
  if (security.os === 'windows') {
    if (security.runAsUserName) settings.push(`user: ${security.runAsUserName}`);
  } else {
    if (security.runAsNonRoot === false) settings.push('root permitted');
    if (security.allowPrivilegeEscalation) settings.push('privilege escalation permitted');
    if (security.readOnlyRootFilesystem === false) settings.push('writable root filesystem');
  }
  return settings.length ? settings.join(' · ') : 'Restricted: no host access or added capabilities';
}

export function securityProfileChangeRequest(
  record: { uid?: string; resourceVersion?: string },
  securityProfile: string,
  permitted: SecurityProfile[]
) {
  if (!record.uid || !record.resourceVersion) throw new Error('Refresh the deployment before changing its security profile.');
  if (!permitted.some((choice) => choice.name === securityProfile)) throw new Error('Select an approved security profile.');
  return { securityProfile, uid: record.uid, resourceVersion: record.resourceVersion };
}
