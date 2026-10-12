import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deploymentConnectionSummary, permittedSecurityProfiles, securityProfileChangeRequest, summarizeAgentSecurity, verifiedAgentTarget } from '../utils/deploymentSecurity';
import type { AgentSecurity, DeploymentOpamp, RuntimeProfile, SecurityProfile } from '../utils/deploymentSecurity';

type Deployment = {
  fleetId: string;
  uid?: string;
  name: string;
  namespace?: string;
  profile?: string;
  node?: string;
  image?: string;
  status?: string;
  desiredReplicas?: number;
  readyReplicas?: number;
  owner?: string;
  opamp?: DeploymentOpamp;
  resourceVersion?: string;
  securityProfile?: string;
  securityProfileHash?: string;
  security?: AgentSecurity;
  generation?: number;
  observedGeneration?: number;
  updatedReplicas?: number;
};
type DeploymentState = {
  enabled: boolean;
  disabledReason?: string;
  profiles?: RuntimeProfile[];
  securityProfiles?: SecurityProfile[];
  nodes?: string[];
  deployments?: Deployment[];
};
type DeploymentApi = {
  get: <T = any>(url: string) => Promise<T>;
  post: <T = any>(url: string, data?: any) => Promise<T>;
  delete: <T = any>(url: string) => Promise<T>;
};

const endpoint = '/agent-deployments';

export const AgentDeploymentsSection = ({ api, isAdmin, onOpenConfiguration }: { api: DeploymentApi; isAdmin: boolean; onOpenConfiguration?: (agentUid: string) => void }) => {
  const [state, setState] = useState<DeploymentState | null>(null);
  const [profile, setProfile] = useState('');
  const [node, setNode] = useState('');
  const [securityProfile, setSecurityProfile] = useState('');
  const [securitySelections, setSecuritySelections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await api.get<DeploymentState>(endpoint);
      setState({
        enabled: Boolean(response?.enabled),
        disabledReason: response?.disabledReason,
        profiles: Array.isArray(response?.profiles) ? response.profiles : [],
        securityProfiles: Array.isArray(response?.securityProfiles) ? response.securityProfiles : [],
        nodes: Array.isArray(response?.nodes) ? response.nodes : [],
        deployments: Array.isArray(response?.deployments) ? response.deployments : [],
      });
    } catch (cause: any) {
      setError(cause?.data?.error || cause?.message || 'Could not load node deployments.');
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const profiles = state?.profiles ?? [];
  const nodes = state?.nodes ?? [];
  const canMutate = Boolean(isAdmin && state?.enabled && !busy);
  const selectedProfile = useMemo(() => profiles.find((candidate) => candidate.name === profile), [profiles, profile]);
  const securityChoices = permittedSecurityProfiles(selectedProfile, state?.securityProfiles ?? []);
  const selectedSecurity = securityChoices.find((choice) => choice.name === securityProfile);

  useEffect(() => {
    if (!profiles.some((candidate) => candidate.name === profile)) setProfile(profiles[0]?.name ?? '');
  }, [profiles, profile]);
  useEffect(() => {
    if (!nodes.includes(node)) setNode(nodes[0] ?? '');
  }, [nodes, node]);
  useEffect(() => {
    if (!securityChoices.some((choice) => choice.name === securityProfile)) {
      setSecurityProfile(securityChoices.find((choice) => choice.name === selectedProfile?.defaultSecurityProfile)?.name ?? securityChoices[0]?.name ?? '');
    }
  }, [securityChoices, securityProfile, selectedProfile]);

  const runAction = async (key: string, request: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await request();
      await load();
    } catch (cause: any) {
      setError(cause?.data?.error || cause?.message || 'The deployment action failed.');
    } finally {
      setBusy(null);
    }
  };

  const create = () => runAction('create', () => api.post(endpoint, { profile, node, securityProfile }));
  const changeSecurity = (deployment: Deployment, choice: string, permitted: SecurityProfile[]) => {
    return runAction(`${deployment.fleetId}:security`, async () => {
      const request = securityProfileChangeRequest(deployment, choice, permitted);
      await api.post(`${endpoint}/${encodeURIComponent(deployment.fleetId)}/security-profile`, request);
      setSecuritySelections((previous) => {
        const next = { ...previous };
        delete next[deployment.fleetId];
        return next;
      });
    });
  };
  const action = (deployment: Deployment, operation: 'start' | 'stop' | 'restart' | 'delete') => {
    if (operation === 'delete' && !window.confirm(`Delete deployment "${deployment.name || deployment.fleetId}"?`)) return;
    const url = `${endpoint}/${encodeURIComponent(deployment.fleetId)}`;
    return runAction(`${deployment.fleetId}:${operation}`, () =>
      operation === 'delete' ? api.delete(url) : api.post(`${url}/${operation}`)
    );
  };

  return (
    <section aria-labelledby="agent-deployments-title" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 8, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 id="agent-deployments-title" style={{ margin: 0, color: '#111827', fontSize: 20 }}>Node deployments</h2>
          <p style={{ margin: '6px 0 0', color: '#6B7280', fontSize: 13 }}>Manage agent placement and approved security profiles. Application configuration and status are managed through OpAMP.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy !== null} style={buttonStyle(false, busy !== null)}>Refresh</button>
      </div>

      {!state && !error && <p role="status" style={mutedStyle}>Loading deployment settings…</p>}
      {error && <div role="alert" style={{ ...noticeStyle, background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' }}>{error}</div>}
      {state && !state.enabled && (
        <div role="status" style={{ ...noticeStyle, background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}>
          Node deployments are disabled{state.disabledReason ? `: ${state.disabledReason}` : ' because no valid deployment configuration is available.'}
        </div>
      )}
      {state?.enabled && !isAdmin && (
        <div role="status" style={{ ...noticeStyle, background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E40AF' }}>Deployment controls require the Grafana Admin role. You can still view deployments.</div>
      )}

      {state?.enabled && (
        <div style={{ marginTop: 18, padding: 16, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6 }}>
          <h3 style={{ margin: '0 0 12px', color: '#111827', fontSize: 15 }}>Create agent deployment</h3>
          <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
            <label style={labelStyle}>Profile
              <select aria-label="Deployment profile" value={profile} onChange={(event) => setProfile(event.target.value)} disabled={!canMutate || profiles.length === 0} style={selectStyle}>
                {profiles.length === 0 && <option value="">No profiles available</option>}
                {profiles.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Allowed node
              <select aria-label="Allowed node" value={node} onChange={(event) => setNode(event.target.value)} disabled={!canMutate || nodes.length === 0} style={selectStyle}>
                {nodes.length === 0 && <option value="">No nodes available</option>}
                {nodes.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Security profile
              <select aria-label="Deployment security profile" value={securityProfile} onChange={(event) => setSecurityProfile(event.target.value)} disabled={!canMutate || !securityChoices.length} style={selectStyle}>
                {!securityChoices.length && <option value="">No approved security profiles</option>}
                {securityChoices.map((choice) => <option key={choice.name} value={choice.name}>{choice.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void create()} disabled={!canMutate || !selectedProfile || !node || !selectedSecurity} style={buttonStyle(true, !canMutate || !selectedProfile || !node || !selectedSecurity)}>
              {busy === 'create' ? 'Creating…' : 'Create deployment'}
            </button>
          </div>
          {selectedProfile?.image && <div style={{ ...mutedStyle, marginTop: 8 }}>Image: {selectedProfile.image}</div>}
          {selectedSecurity && <div style={{ ...mutedStyle, marginTop: 8 }}>{selectedSecurity.summary || summarizeAgentSecurity(selectedSecurity.security)}</div>}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h3 style={{ margin: '0 0 10px', color: '#111827', fontSize: 15 }}>Deployments</h3>
        {(state?.deployments ?? []).length === 0 ? (
          <p style={mutedStyle}>{state ? 'No node deployments yet.' : 'Deployment list unavailable.'}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontSize: 13 }}>
              <thead><tr>{['Agent', 'Profile', 'Node', 'Security', 'Kubernetes', 'OpAMP', 'Actions'].map((heading) => <th key={heading} style={thStyle}>{heading}</th>)}</tr></thead>
              <tbody>{state!.deployments!.map((deployment) => {
                const key = deployment.fleetId;
                const agentUid = verifiedAgentTarget(deployment.opamp);
                const connected = Boolean(agentUid && deployment.opamp?.connected);
                const connectionState = deploymentConnectionSummary(deployment.opamp);
                const working = busy?.startsWith(`${key}:`) ?? false;
                const runtimeProfile = profiles.find((candidate) => candidate.name === deployment.profile);
                const permitted = permittedSecurityProfiles(runtimeProfile, state?.securityProfiles ?? []);
                const selected = securitySelections[key] ?? deployment.securityProfile ?? '';
                const selectedChoice = permitted.find((choice) => choice.name === selected);
                const canApply = canMutate && !working && Boolean(selectedChoice && deployment.uid && deployment.resourceVersion);
                return <tr key={key}>
                  <td style={tdStyle}><div style={{ fontWeight: 600, color: '#111827' }}>{deployment.name || key}</div><div style={mutedStyle}>{deployment.namespace || ''}</div></td>
                  <td style={tdStyle}>{deployment.profile || '—'}</td>
                  <td style={tdStyle}>{deployment.node || '—'}</td>
                  <td style={{ ...tdStyle, minWidth: 245 }}>
                    <div style={{ fontWeight: 600 }}>{deployment.securityProfile || 'Unknown profile'}</div>
                    <div style={{ ...mutedStyle, marginTop: 5 }}>{summarizeAgentSecurity(deployment.security)}</div>
                    <div style={{ ...mutedStyle, marginTop: 4 }}>Accepted pod template; running pods depend on rollout status.</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <select aria-label={`Security profile for ${deployment.name || key}`} value={selected} onChange={(event) => setSecuritySelections((previous) => ({ ...previous, [key]: event.target.value }))} disabled={!canMutate || working || !permitted.length} style={{ ...selectStyle, minWidth: 130 }}>
                        {!selectedChoice && <option value={selected}>{selected || 'Select profile'}</option>}
                        {permitted.map((choice) => <option key={choice.name} value={choice.name}>{choice.name}</option>)}
                      </select>
                      <button type="button" disabled={!canApply} onClick={() => void changeSecurity(deployment, selected, permitted)} style={smallButtonStyle(!canApply)}>{busy === `${key}:security` ? 'Applying…' : 'Apply profile'}</button>
                    </div>
                    {securitySelections[key] && selectedChoice && <div style={{ ...mutedStyle, marginTop: 5 }}>Selected: {selectedChoice.summary || summarizeAgentSecurity(selectedChoice.security)}</div>}
                    <div style={{ ...mutedStyle, marginTop: 5 }}>Active agents roll out after a change; stopped agents stay stopped.</div>
                  </td>
                  <td style={tdStyle}>{deployment.status || (deployment.readyReplicas ? 'Ready' : 'Pending')} ({deployment.readyReplicas ?? 0}/{deployment.desiredReplicas ?? 1})</td>
                  <td style={{ ...tdStyle, minWidth: 190 }}>
                    <span style={{ color: connected && deployment.opamp?.profileMatches === true ? '#047857' : '#6B7280', fontWeight: 600 }}>{connectionState}</span>
                    {agentUid && <div style={{ ...mutedStyle, marginTop: 5 }}>Agent: {agentUid}</div>}
                    {deployment.opamp?.remoteConfigStatus && <div style={{ ...mutedStyle, marginTop: 5 }}>Config acknowledgment: {deployment.opamp.remoteConfigStatus}</div>}
                    {deployment.opamp?.effectiveConfigHash && <div style={{ ...mutedStyle, marginTop: 5, overflowWrap: 'anywhere' }}>Effective config hash: {deployment.opamp.effectiveConfigHash}</div>}
                    <button type="button" disabled={!agentUid || !onOpenConfiguration} onClick={() => { if (agentUid) onOpenConfiguration?.(agentUid); }} style={{ ...smallButtonStyle(!agentUid || !onOpenConfiguration), marginTop: 8 }}>Open agent configuration</button>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" disabled={!canMutate || working} onClick={() => void action(deployment, 'start')} style={smallButtonStyle(!canMutate || working)}>Start</button>
                      <button type="button" disabled={!canMutate || working} onClick={() => void action(deployment, 'stop')} style={smallButtonStyle(!canMutate || working)}>Stop</button>
                      <button type="button" disabled={!canMutate || working} onClick={() => void action(deployment, 'restart')} style={smallButtonStyle(!canMutate || working)}>{busy === `${key}:restart` ? 'Restarting…' : 'Rollout restart'}</button>
                      <button type="button" disabled={!canMutate || working} onClick={() => void action(deployment, 'delete')} style={smallButtonStyle(!canMutate || working)}>Delete</button>
                    </div>
                    {working && <span role="status" style={{ ...mutedStyle, display: 'block', marginTop: 5 }}>{busy?.split(':')[1]} in progress…</span>}
                    {agentUid && !connected && <span style={{ ...mutedStyle, display: 'block', marginTop: 5 }}>Waiting for the authenticated agent to reconnect.</span>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

const mutedStyle: React.CSSProperties = { color: '#6B7280', fontSize: 12 };
const noticeStyle: React.CSSProperties = { marginTop: 16, padding: 11, border: '1px solid', borderRadius: 6, fontSize: 13 };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, color: '#374151', fontSize: 12, fontWeight: 600 };
const selectStyle: React.CSSProperties = { minWidth: 190, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 5, background: 'white', color: '#111827' };
const thStyle: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', color: '#6B7280', borderBottom: '1px solid #E5E7EB', fontSize: 11, textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '11px 10px', borderBottom: '1px solid #F3F4F6', verticalAlign: 'top', color: '#374151' };
const buttonStyle = (primary: boolean, disabled: boolean): React.CSSProperties => ({ padding: '8px 12px', background: primary ? (disabled ? '#D1D5DB' : '#2563EB') : 'white', color: primary ? 'white' : '#374151', border: primary ? 'none' : '1px solid #D1D5DB', borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 });
const smallButtonStyle = (disabled: boolean): React.CSSProperties => ({ padding: '5px 7px', background: 'white', color: disabled ? '#9CA3AF' : '#374151', border: '1px solid #D1D5DB', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 11 });
