// Metrics utility functions
export const escapeSelectorValue = (value: string) => value.replace(/"/g, '\\"');

export const extractPrometheusSample = (payload: any): number | null => {
  if (!payload || payload.status !== 'success') {
    return null;
  }
  const data = payload.data;
  if (!data) {
    return null;
  }
  if (data.resultType === 'scalar' && Array.isArray(data.result) && data.result.length >= 2) {
    const numeric = parseFloat(data.result[1]);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (data.resultType === 'vector' && Array.isArray(data.result)) {
    const aggregated = data.result.reduce((acc: number, sample: any) => {
      if (!sample || !Array.isArray(sample.value) || sample.value.length < 2) {
        return acc;
      }
      const numeric = parseFloat(sample.value[1]);
      if (!Number.isFinite(numeric)) {
        return acc;
      }
      return acc + numeric;
    }, 0);
    return Number.isFinite(aggregated) ? aggregated : null;
  }
  return null;
};

export const formatStageRate = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} M rec/s`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)} k rec/s`;
  }
  return `${value.toFixed(1)} rec/s`;
};

