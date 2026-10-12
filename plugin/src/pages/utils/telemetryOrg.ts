export type OrgHeader = { 'X-Grafana-Org-Id': string };

export function resolveDatasourceOrgId(savedOrgId: number | null | undefined, currentOrgId: number | null): number | null {
  return savedOrgId ?? currentOrgId ?? null;
}

export function datasourceOrgSelectValue(savedOrgId: number | null | undefined, currentOrgId: number | null): string {
  return savedOrgId == null || savedOrgId === currentOrgId ? '' : String(savedOrgId);
}

export function datasourceOrgHeaders(orgId: number | null): { headers?: OrgHeader } {
  return orgId == null ? {} : { headers: { 'X-Grafana-Org-Id': String(orgId) } };
}

export function createRequestEpoch() {
  let epoch = 0;
  return {
    begin: () => ++epoch,
    isCurrent: (requestId: number) => epoch === requestId,
    invalidate: (requestId?: number) => {
      if (requestId === undefined || epoch === requestId) epoch++;
    },
  };
}
