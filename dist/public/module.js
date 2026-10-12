define(["@grafana/data","@grafana/runtime","@grafana/ui","react","react-dom"], function(__GRAFANA_DATA__, __GRAFANA_RUNTIME__, __GRAFANA_UI__, __REACT__, __REACT_DOM__) {
__REACT__ = (__REACT__ && __REACT__.__esModule && __REACT__.default) ? __REACT__.default : __REACT__;
__REACT_DOM__ = (__REACT_DOM__ && __REACT_DOM__.__esModule && __REACT_DOM__.default) ? __REACT_DOM__.default : __REACT_DOM__;
var React2 = __REACT__;
var ReactDOM2 = __REACT_DOM__;
var useState2 = React2.useState ? React2.useState.bind(React2) : void 0;
var useEffect2 = React2.useEffect ? React2.useEffect.bind(React2) : void 0;
var useMemo2 = React2.useMemo ? React2.useMemo.bind(React2) : void 0;
var useCallback2 = React2.useCallback ? React2.useCallback.bind(React2) : void 0;
var useRef2 = React2.useRef ? React2.useRef.bind(React2) : void 0;
var useReducer2 = React2.useReducer ? React2.useReducer.bind(React2) : void 0;
var useContext2 = React2.useContext ? React2.useContext.bind(React2) : void 0;
var useLayoutEffect2 = React2.useLayoutEffect ? React2.useLayoutEffect.bind(React2) : void 0;
var useImperativeHandle2 = React2.useImperativeHandle ? React2.useImperativeHandle.bind(React2) : void 0;
var useId2 = React2.useId ? React2.useId.bind(React2) : void 0;
// module.ts


// pages/App.tsx

// node_modules/rxjs/dist/esm5/internal/util/createErrorClass.js
function createErrorClass(createImpl) {
  var _super = function(instance) {
    Error.call(instance);
    instance.stack = new Error().stack;
  };
  var ctorFunc = createImpl(_super);
  ctorFunc.prototype = Object.create(Error.prototype);
  ctorFunc.prototype.constructor = ctorFunc;
  return ctorFunc;
}

// node_modules/rxjs/dist/esm5/internal/util/EmptyError.js
var EmptyError = createErrorClass(function(_super) {
  return function EmptyErrorImpl() {
    _super(this);
    this.name = "EmptyError";
    this.message = "no elements in sequence";
  };
});

// node_modules/rxjs/dist/esm5/internal/lastValueFrom.js
function lastValueFrom(source, config) {
  var hasConfig = typeof config === "object";
  return new Promise(function(resolve, reject) {
    var _hasValue = false;
    var _value;
    source.subscribe({
      next: function(value) {
        _value = value;
        _hasValue = true;
      },
      error: reject,
      complete: function() {
        if (_hasValue) {
          resolve(_value);
        } else if (hasConfig) {
          resolve(config.defaultValue);
        } else {
          reject(new EmptyError());
        }
      }
    });
  });
}

// pages/components/MonitoringSection.tsx
var React2 = __REACT__.default || __REACT__;

// components/PipelineMetricsPanelView.tsx
var React = __REACT__.default || __REACT__;


// pages/utils/api.ts


// pages/constants.ts
var PLUGIN_ID = "otel-collector-agent-fleet-management";
var RESOURCE_ROOT = `/api/plugins/${PLUGIN_ID}/resources`;
var RESOURCE_PREFIX = `${RESOURCE_ROOT}/plugin-api`;
var PROXY_PREFIX = `/api/plugin-proxy/${PLUGIN_ID}/plugin-api`;
var STANDALONE_PREFIX = "/plugin-api";
var LOGS_QUERY_PLACEHOLDER = `{service_instance_id="$collector_uid"}`;
var GRAFANA_CORE_ENDPOINTS = ["/api/datasources", "/api/frontend", "/api/search", "/api/ruler"];
var STAGE_KEYS = ["receivers", "processors", "exporters"];
var capabilityOrder = [
  "accepts_remote_config",
  "reports_effective_config",
  "reports_health",
  "reports_own_logs",
  "reports_own_metrics",
  "reports_own_traces",
  "accepts_restart_command",
  "reports_remote_config",
  "reports_status",
  "reports_available_components"
];

// pages/utils/runtime.ts
var detectRuntimeMode = () => {
  if (typeof window === "undefined") {
    return "grafana";
  }
  const coerceMode = (value) => {
    if (!value) {
      return null;
    }
    const lower = value.toLowerCase();
    if (lower === "grafana" || lower === "standalone") {
      return lower;
    }
    return null;
  };
  let storedMode = null;
  try {
    storedMode = window.localStorage?.getItem("otelFleetAppMode") ?? null;
  } catch {
    storedMode = null;
  }
  const forcedMode = coerceMode(window.__OTEL_FLEET_APP_MODE__) || coerceMode(new URLSearchParams(window.location.search).get("mode")) || coerceMode(storedMode);
  if (forcedMode) {
    return forcedMode;
  }
  const grafanaMarkers = [
    window.__grafanaBootData,
    window.grafanaBootData,
    window.__grafana_public_path__
  ];
  if (grafanaMarkers.some(Boolean)) {
    return "grafana";
  }
  if (typeof document !== "undefined") {
    const grafanaRoot = document.getElementById("grafana-app") || document.getElementById("grafanaRoot") || document.querySelector("grafana-app");
    if (grafanaRoot) {
      return "grafana";
    }
  }
  const path = window.location?.pathname ?? "";
  if (path.includes("/api/plugins/") || path.includes("/a/")) {
    return "grafana";
  }
  return "standalone";
};
var detectGrafanaTransport = (isRunningInGrafana6) => {
  if (!isRunningInGrafana6) {
    return "resources";
  }
  const coerce = (value) => {
    if (!value) {
      return null;
    }
    const lower = value.toLowerCase();
    if (lower === "proxy" || lower === "resources") {
      return lower;
    }
    if (lower === "callresource") {
      return "resources";
    }
    return null;
  };
  let stored = null;
  try {
    stored = window.localStorage?.getItem("otelFleetTransport") ?? null;
  } catch {
    stored = null;
  }
  return coerce(window.__OTEL_FLEET_TRANSPORT__) || coerce(new URLSearchParams(window.location.search).get("transport")) || coerce(stored) || "proxy";
};
var normalizeUrl = (rawUrl, isRunningInGrafana6, grafanaTransport6) => {
  if (!rawUrl) {
    if (!isRunningInGrafana6) {
      return STANDALONE_PREFIX;
    }
    return grafanaTransport6 === "proxy" ? PROXY_PREFIX : RESOURCE_PREFIX;
  }
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (GRAFANA_CORE_ENDPOINTS.some((prefix) => rawUrl.startsWith(prefix))) {
    return rawUrl;
  }
  const base = !isRunningInGrafana6 ? STANDALONE_PREFIX : grafanaTransport6 === "proxy" ? PROXY_PREFIX : RESOURCE_PREFIX;
  let urlWithoutBase = rawUrl;
  if (urlWithoutBase.startsWith(base)) {
    return urlWithoutBase;
  }
  if (urlWithoutBase.startsWith(RESOURCE_PREFIX)) {
    urlWithoutBase = urlWithoutBase.slice(RESOURCE_PREFIX.length);
  } else if (urlWithoutBase.startsWith(RESOURCE_ROOT)) {
    urlWithoutBase = urlWithoutBase.slice(RESOURCE_ROOT.length);
  } else if (urlWithoutBase.startsWith(PROXY_PREFIX)) {
    urlWithoutBase = urlWithoutBase.slice(PROXY_PREFIX.length);
  } else if (urlWithoutBase.startsWith(STANDALONE_PREFIX)) {
    urlWithoutBase = urlWithoutBase.slice(STANDALONE_PREFIX.length);
  } else if (urlWithoutBase.startsWith(`/api/plugins/${PLUGIN_ID}/resources`)) {
    const parts = urlWithoutBase.split("/resources");
    if (parts.length > 1) {
      urlWithoutBase = parts.slice(1).join("/resources");
    }
  }
  urlWithoutBase = urlWithoutBase.replace(/^\/plugin-api(\/|$)/, "/");
  urlWithoutBase = urlWithoutBase.replace(/^\/r(\/|$)/, "/");
  if (!urlWithoutBase.startsWith("/")) {
    urlWithoutBase = `/${urlWithoutBase}`;
  }
  return `${base}${urlWithoutBase}`;
};

// pages/utils/api.ts
var rawBackendSrv = __GRAFANA_RUNTIME__.getBackendSrv();
var tenantHeaderValue = null;
var normalizeRequestHeaders = (incoming) => {
  if (!incoming) {
    return {};
  }
  if (incoming instanceof Headers) {
    const headers = {};
    incoming.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }
  if (Array.isArray(incoming)) {
    return incoming.reduce((acc, [key, value]) => {
      if (key) {
        acc[key] = String(value ?? "");
      }
      return acc;
    }, {});
  }
  return { ...incoming };
};
var fetchWithAuth = async ({ responseType, headers: requestHeaders, ...rest }) => {
  const headers = normalizeRequestHeaders(requestHeaders);
  if (tenantHeaderValue && !headers["X-Scoper-Tenant"]) {
    headers["X-Scoper-Tenant"] = tenantHeaderValue;
  }
  const requestPayload = {
    responseType: responseType ?? "json",
    ...rest,
    headers
  };
  const response = await lastValueFrom(rawBackendSrv.fetch(requestPayload));
  if (response.status >= 200 && response.status < 300) {
    return response.data;
  }
  const error = new Error(response.statusText || `Request failed with status ${response.status}`);
  error.status = response.status;
  error.statusText = response.statusText;
  error.data = response.data;
  throw error;
};
var createBackendSrv = (isRunningInGrafana6, grafanaTransport6) => ({
  get: (url, options = {}) => fetchWithAuth({ ...options, url: normalizeUrl(url, isRunningInGrafana6, grafanaTransport6), method: "GET" }),
  post: (url, data, options = {}) => fetchWithAuth({ ...options, url: normalizeUrl(url, isRunningInGrafana6, grafanaTransport6), data, method: "POST" }),
  delete: (url, options = {}) => fetchWithAuth({ ...options, url: normalizeUrl(url, isRunningInGrafana6, grafanaTransport6), method: "DELETE" }),
  patch: (url, data, options = {}) => fetchWithAuth({ ...options, url: normalizeUrl(url, isRunningInGrafana6, grafanaTransport6), data, method: "PATCH" }),
  request: (options) => fetchWithAuth({
    ...options,
    url: normalizeUrl(options.url ?? "", isRunningInGrafana6, grafanaTransport6),
    method: options.method
  })
});

// components/PipelineMetricsPanelView.tsx
var { useCallback, useEffect, useMemo, useRef, useState } = React;
var SUPPORTED_METRICS_DATASOURCES = /* @__PURE__ */ new Set(["prometheus", "mimir", "grafana-mimir-datasource", "thanos"]);
var runtimeMode = detectRuntimeMode();
var isRunningInGrafana = runtimeMode === "grafana";
var grafanaTransport = detectGrafanaTransport(isRunningInGrafana);
var backendSrv = createBackendSrv(isRunningInGrafana, grafanaTransport);
var rawBackendSrv2 = __GRAFANA_RUNTIME__.getBackendSrv();
var METRIC_LABELS = [
  { key: "cpu", label: "CPU Usage", helper: "Example metric: otelcol_process_cpu_seconds_total" },
  { key: "memory", label: "Memory Usage", helper: "Example metric: otelcol_process_memory_rss_bytes" },
  { key: "inbound", label: "Inbound Throughput", helper: "Example metric: otelcol_processor_incoming_items_total" },
  { key: "outbound", label: "Outbound Throughput", helper: "Example metric: otelcol_processor_outgoing_items_total" }
];
var buildDefaultMetricQueries = (pipelineType, agentUid, podName) => {
  const safeUid = agentUid && agentUid.trim() !== "" ? agentUid : "$collector_uid";
  const safePod = podName || "$collector_pod";
  const pipelineLabel = pipelineType && pipelineType.trim() !== "" ? pipelineType : "$pipeline";
  const prefix = "# Adjust selectors to match your collector metrics";
  const baseLabels = `service_instance_id="${safeUid}"`;
  const podLabel = podName ? `pod="${podName}"` : `pod=~"${safePod}"`;
  const labelSelector = `${baseLabels}, ${podLabel}`;
  const allPodsSelector = `${baseLabels}`;
  return {
    cpu: `${prefix}
# CPU usage per pod (Total & Per-Pod)
# Total
sum(rate(otelcol_process_cpu_seconds_total{${allPodsSelector}}[5m]))
# Per-Pod
rate(otelcol_process_cpu_seconds_total{${labelSelector}}[5m])`,
    memory: `${prefix}
# Memory usage per pod (Total & Per-Pod)
# Total
sum(otelcol_process_memory_rss{${allPodsSelector}} / 1024 / 1024)
# Per-Pod
otelcol_process_memory_rss{${labelSelector}} / 1024 / 1024`,
    inbound: `${prefix}
# Incoming items per pod/processor (Total & Per-Pod)
# Total
sum(rate(otelcol_processor_incoming_items{${allPodsSelector}, pipeline="${pipelineLabel}"}[5m])) by (processor)
# Per-Pod
sum(rate(otelcol_processor_incoming_items{${labelSelector}, pipeline="${pipelineLabel}"}[5m])) by (pod, processor)`,
    outbound: `${prefix}
# Outgoing items per pod/processor (Total & Per-Pod)
# Total
sum(rate(otelcol_processor_outgoing_items{${allPodsSelector}, pipeline="${pipelineLabel}"}[5m])) by (processor)
# Per-Pod
sum(rate(otelcol_processor_outgoing_items{${labelSelector}, pipeline="${pipelineLabel}"}[5m])) by (pod, processor)`
  };
};
var extractPrometheusValue = (response) => {
  if (!response || response.status !== "success") {
    return null;
  }
  const data = response.data;
  if (!data) {
    return null;
  }
  if (data.resultType === "scalar" && Array.isArray(data.result) && data.result.length >= 2) {
    const value = parseFloat(data.result[1]);
    return Number.isFinite(value) ? value : null;
  }
  if (data.resultType === "vector" && Array.isArray(data.result)) {
    if (data.result.length === 0) {
      return null;
    }
    const accumulated = data.result.reduce((acc, sample) => {
      if (!sample || !Array.isArray(sample.value) || sample.value.length < 2) {
        return acc;
      }
      const next = parseFloat(sample.value[1]);
      if (!Number.isFinite(next)) {
        return acc;
      }
      return acc + next;
    }, 0);
    return Number.isFinite(accumulated) ? accumulated : null;
  }
  return null;
};
var extractPrometheusTimeSeries = (response) => {
  if (!response || response.status !== "success") {
    return [];
  }
  const data = response.data;
  if (!data || data.resultType !== "matrix" || !Array.isArray(data.result)) {
    return [];
  }
  const series = [];
  for (const result of data.result) {
    if (result.values && Array.isArray(result.values)) {
      for (const [timestamp2, value] of result.values) {
        const time = parseFloat(timestamp2);
        const val = parseFloat(value);
        if (Number.isFinite(time) && Number.isFinite(val)) {
          series.push({ time, value: val });
        }
      }
    }
  }
  series.sort((a, b) => a.time - b.time);
  return series;
};
var formatValue = (key, value) => {
  if (value === null || Number.isNaN(value)) {
    return "\u2014";
  }
  switch (key) {
    case "cpu":
      return `${value.toFixed(1)} %`;
    case "memory":
      return `${value.toFixed(1)} MB`;
    case "inbound":
    case "outbound":
      return `${value.toFixed(1)} KB/s`;
    default:
      return value.toFixed(2);
  }
};
var TimeSeriesChart = ({ data, label, color = "#2563EB", height = 120 }) => {
  if (!data || data.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { style: { height, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 12 } }, "No data available");
  }
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const width = 400;
  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = width - padding.left - padding.right;
  const minTime = Math.min(...data.map((d) => d.time));
  const maxTime = Math.max(...data.map((d) => d.time));
  const minValue = Math.min(...data.map((d) => d.value));
  const maxValue = Math.max(...data.map((d) => d.value));
  const valueRange = maxValue - minValue || 1;
  const scaleX = (time) => (time - minTime) / (maxTime - minTime || 1) * chartWidth;
  const scaleY = (value) => chartHeight - (value - minValue) / valueRange * chartHeight;
  const points = data.map((d) => `${scaleX(d.time) + padding.left},${scaleY(d.value) + padding.top}`).join(" ");
  const formatTime = (timestamp2) => {
    const date = new Date(timestamp2 * 1e3);
    return date.toLocaleTimeString();
  };
  const formatValue2 = (val) => {
    if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
    return val.toFixed(1);
  };
  return /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height, background: "#FFFFFF", borderRadius: 6, border: "1px solid #E2E8F0", padding: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#1F2937", marginBottom: 8 } }, label), /* @__PURE__ */ React.createElement("svg", { width, height, style: { display: "block" } }, [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padding.top + ratio * chartHeight;
    return /* @__PURE__ */ React.createElement(
      "line",
      {
        key: `grid-${ratio}`,
        x1: padding.left,
        y1: y,
        x2: width - padding.right,
        y2: y,
        stroke: "#E5E7EB",
        strokeWidth: 1
      }
    );
  }), [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = minValue + ratio * valueRange;
    const y = padding.top + (1 - ratio) * chartHeight;
    return /* @__PURE__ */ React.createElement(
      "text",
      {
        key: `y-label-${ratio}`,
        x: padding.left - 5,
        y: y + 4,
        textAnchor: "end",
        fontSize: "10",
        fill: "#6B7280"
      },
      formatValue2(value)
    );
  }), /* @__PURE__ */ React.createElement(
    "polyline",
    {
      points,
      fill: "none",
      stroke: color,
      strokeWidth: 2
    }
  ), data.map((d, idx) => /* @__PURE__ */ React.createElement(
    "circle",
    {
      key: idx,
      cx: scaleX(d.time) + padding.left,
      cy: scaleY(d.value) + padding.top,
      r: 2,
      fill: color
    }
  )), /* @__PURE__ */ React.createElement(
    "line",
    {
      x1: padding.left,
      y1: height - padding.bottom,
      x2: width - padding.right,
      y2: height - padding.bottom,
      stroke: "#9CA3AF",
      strokeWidth: 1
    }
  ), data.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    "text",
    {
      x: padding.left,
      y: height - 5,
      fontSize: "10",
      fill: "#6B7280"
    },
    formatTime(data[0].time)
  ), /* @__PURE__ */ React.createElement(
    "text",
    {
      x: width - padding.right,
      y: height - 5,
      fontSize: "10",
      fill: "#6B7280",
      textAnchor: "end"
    },
    formatTime(data[data.length - 1].time)
  ))));
};
var PipelineMetricsPanelView = ({
  pipelineType,
  agentUid,
  agentName,
  orgName,
  allowDisable = false,
  initialEnabled = true,
  defaultQueries,
  defaultDatasourceUid = null,
  datasourceOrgId = null,
  title = "Custom Metrics Panel",
  readOnly = false,
  onQueriesChange,
  onDatasourceChange
}) => {
  const [datasources, setDatasources] = useState([]);
  const [datasourceError, setDatasourceError] = useState(null);
  const [selectedDatasource, setSelectedDatasource] = useState(null);
  const [queries, setQueries] = useState(() => defaultQueries ?? buildDefaultMetricQueries(pipelineType, agentUid));
  const [enabled, setEnabled] = useState(allowDisable ? initialEnabled : true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRunAt, setLastRunAt] = useState(null);
  const [values, setValues] = useState({ cpu: "\u2014", memory: "\u2014", inbound: "\u2014", outbound: "\u2014" });
  const [timeSeriesData, setTimeSeriesData] = useState({ cpu: [], memory: [], inbound: [], outbound: [] });
  const [viewMode, setViewMode] = useState("charts");
  const autoRunRef = useRef(false);
  const orgHeaders = useMemo(
    () => datasourceOrgId ? { "X-Grafana-Org-Id": String(datasourceOrgId) } : void 0,
    [datasourceOrgId]
  );
  useEffect(() => {
    if (defaultQueries) {
      setQueries(defaultQueries);
    }
  }, [defaultQueries]);
  useEffect(() => {
    if (datasourceOrgId !== null) {
      setSelectedDatasource(null);
    }
  }, [datasourceOrgId]);
  useEffect(() => {
    let mounted = true;
    const loadDatasources = async () => {
      try {
        const response = await backendSrv.get("/api/datasources", { headers: orgHeaders });
        if (!mounted) {
          return;
        }
        const available = Array.isArray(response) ? response.filter((item) => SUPPORTED_METRICS_DATASOURCES.has(item.type)).map((item) => ({ id: item.id, uid: item.uid, name: item.name, type: item.type })) : [];
        setDatasources(available);
        setDatasourceError(available.length === 0 ? "No Prometheus-compatible data sources were found." : null);
        if (defaultDatasourceUid) {
          const match = available.find((ds) => ds.uid === defaultDatasourceUid);
          if (match) {
            setSelectedDatasource(match);
            onDatasourceChange?.(match);
            return;
          }
        }
        if (!selectedDatasource && available.length > 0 && !readOnly) {
          setSelectedDatasource(available[0]);
          onDatasourceChange?.(available[0]);
        }
      } catch (err) {
        if (!mounted) {
          return;
        }
        console.error("Failed to load datasources", err);
        setDatasourceError(err?.message || "Failed to load data sources.");
      }
    };
    loadDatasources();
    return () => {
      mounted = false;
    };
  }, [defaultDatasourceUid, onDatasourceChange, readOnly, orgHeaders, datasourceOrgId]);
  useEffect(() => {
    if (!defaultDatasourceUid || !datasources || datasources.length === 0) {
      return;
    }
    if (selectedDatasource && selectedDatasource.uid === defaultDatasourceUid) {
      return;
    }
    const match = datasources.find((ds) => ds.uid === defaultDatasourceUid);
    if (match) {
      setSelectedDatasource(match);
      onDatasourceChange?.(match);
    }
  }, [datasources, defaultDatasourceUid, onDatasourceChange, selectedDatasource]);
  const updateQuery = useCallback((key, value) => {
    setQueries((prev) => {
      const next = { ...prev, [key]: value };
      onQueriesChange?.(next);
      return next;
    });
  }, [onQueriesChange]);
  const runQueries = useCallback(async () => {
    if (!selectedDatasource) {
      setError("Select a datasource before running queries.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1e3);
      const start = now - 3600;
      const results = { cpu: "\u2014", memory: "\u2014", inbound: "\u2014", outbound: "\u2014" };
      const timeSeries = { cpu: [], memory: [], inbound: [], outbound: [] };
      for (const { key } of METRIC_LABELS) {
        const query = queries[key];
        if (!query || query.trim() === "") {
          results[key] = "\u2014";
          timeSeries[key] = [];
          continue;
        }
        try {
          if (orgHeaders) {
            console.log(`DEBUG: Running query for ${key} with org ID ${orgHeaders["X-Grafana-Org-Id"]}`);
          }
          const instantResponse = await rawBackendSrv2.datasourceRequest({
            method: "GET",
            url: `/api/datasources/proxy/${selectedDatasource.id}/api/v1/query`,
            params: { query, time: now },
            headers: orgHeaders
          });
          const value = extractPrometheusValue(instantResponse?.data);
          results[key] = formatValue(key, value);
        } catch (err) {
          console.warn(`Instant query failed for ${key}:`, err);
        }
        try {
          const rangeResponse = await rawBackendSrv2.datasourceRequest({
            method: "GET",
            url: `/api/datasources/proxy/${selectedDatasource.id}/api/v1/query_range`,
            params: { query, start, end: now, step: "60" },
            headers: orgHeaders
          });
          const seriesData = extractPrometheusTimeSeries(rangeResponse?.data);
          timeSeries[key] = seriesData;
        } catch (err) {
          console.warn(`Range query failed for ${key}:`, err);
          timeSeries[key] = [];
        }
      }
      setValues(results);
      setTimeSeriesData(timeSeries);
      setLastRunAt(Date.now());
    } catch (err) {
      console.error("Failed to execute Prometheus queries", err);
      setError(err?.data?.message || err?.message || "Query failed. Check selectors and try again.");
    } finally {
      setLoading(false);
    }
  }, [queries, selectedDatasource, orgHeaders]);
  useEffect(() => {
    if (readOnly && selectedDatasource && !autoRunRef.current) {
      autoRunRef.current = true;
      runQueries();
    }
  }, [readOnly, selectedDatasource, runQueries]);
  useEffect(() => {
    if (readOnly && selectedDatasource && autoRunRef.current && datasourceOrgId !== null && datasourceOrgId !== void 0) {
      console.log(`DEBUG: Org ID changed to ${datasourceOrgId}, re-running queries with org headers:`, orgHeaders);
      autoRunRef.current = false;
      setTimeout(() => {
        autoRunRef.current = true;
        runQueries();
      }, 100);
    }
  }, [datasourceOrgId, readOnly, selectedDatasource, runQueries, orgHeaders]);
  const handleDatasourceChange = useCallback((event) => {
    const id = Number(event.target.value);
    const match = datasources.find((item) => item.id === id) || null;
    setSelectedDatasource(match);
    onDatasourceChange?.(match);
  }, [datasources, onDatasourceChange]);
  const isReadonlyAndDisabled = readOnly || !allowDisable;
  return /* @__PURE__ */ React.createElement("div", { style: { width: "100%" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: 16, background: "#F8FAFC", borderRadius: 8, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#0F172A" } }, title, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#6B7280", marginLeft: 8 } }, pipelineType, " pipeline")), allowDisable && !readOnly && /* @__PURE__ */ React.createElement("label", { style: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "#1F2937" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: enabled, onChange: () => setEnabled((prev) => !prev) }), "Enable panel")), !allowDisable || enabled || readOnly ? /* @__PURE__ */ React.createElement("div", { style: { marginTop: 16, display: "flex", flexDirection: "column", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#1F2937" } }, "Data source"), readOnly ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#1F2937", fontWeight: 600 } }, selectedDatasource?.name || "Not configured") : /* @__PURE__ */ React.createElement(
    "select",
    {
      value: selectedDatasource?.id ?? "",
      onChange: handleDatasourceChange,
      style: {
        minWidth: 220,
        padding: "6px 10px",
        borderRadius: 4,
        border: "1px solid #CBD5F5",
        fontSize: 12,
        color: "#1F2937",
        background: "#FFFFFF"
      }
    },
    /* @__PURE__ */ React.createElement("option", { value: "", disabled: true }, datasourceError ? "No compatible data source" : "Select data source"),
    datasources.map((ds) => /* @__PURE__ */ React.createElement("option", { key: ds.id, value: ds.id }, ds.name, " (", ds.type, ")"))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: runQueries,
      disabled: loading || !selectedDatasource || !enabled && !isReadonlyAndDisabled,
      style: {
        padding: "6px 12px",
        borderRadius: 4,
        border: "none",
        background: loading ? "#CBD5F5" : "#2563EB",
        color: "#FFFFFF",
        fontSize: 12,
        cursor: loading ? "not-allowed" : "pointer"
      }
    },
    loading ? "Running\u2026" : "Run queries"
  )), !readOnly && /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 } }, METRIC_LABELS.map(({ key, label, helper }) => /* @__PURE__ */ React.createElement("div", { key, style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#1F2937" } }, label), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      value: queries[key] ?? "",
      onChange: (event) => updateQuery(key, event.target.value),
      rows: 6,
      style: {
        padding: 8,
        borderRadius: 4,
        border: "1px solid #CBD5F5",
        fontFamily: "monospace",
        fontSize: 12,
        background: "#FFFFFF",
        color: "#0F172A"
      }
    }
  ), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#64748B" } }, helper))), /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        padding: 10,
        background: "#F8FAFC",
        borderRadius: 6,
        border: "1px solid #E2E8F0",
        fontSize: 11,
        color: "#475569"
      }
    },
    /* @__PURE__ */ React.createElement("strong", null, "Tip:"),
    " collector ",
    /* @__PURE__ */ React.createElement("code", null, agentName || agentUid || "unknown"),
    ", pipeline ",
    /* @__PURE__ */ React.createElement("code", null, pipelineType),
    ", org ",
    /* @__PURE__ */ React.createElement("code", null, orgName || "default"),
    "."
  )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12, alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: "#64748B" } }, "View:"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setViewMode("values"),
      style: {
        padding: "4px 12px",
        borderRadius: 4,
        border: "1px solid #CBD5F5",
        background: viewMode === "values" ? "#2563EB" : "#FFFFFF",
        color: viewMode === "values" ? "#FFFFFF" : "#1F2937",
        fontSize: 12,
        cursor: "pointer"
      }
    },
    "Values"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setViewMode("charts"),
      style: {
        padding: "4px 12px",
        borderRadius: 4,
        border: "1px solid #CBD5F5",
        background: viewMode === "charts" ? "#2563EB" : "#FFFFFF",
        color: viewMode === "charts" ? "#FFFFFF" : "#1F2937",
        fontSize: 12,
        cursor: "pointer"
      }
    },
    "Charts"
  )), viewMode === "values" ? /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 } }, METRIC_LABELS.map(({ key, label }) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key,
      style: {
        padding: 12,
        borderRadius: 6,
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        display: "flex",
        flexDirection: "column",
        gap: 6
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#64748B" } }, label),
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "#0F172A" } }, values[key])
  ))) : /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 } }, METRIC_LABELS.map(({ key, label }) => /* @__PURE__ */ React.createElement(
    TimeSeriesChart,
    {
      key,
      data: timeSeriesData[key] || [],
      label,
      color: key === "cpu" ? "#EF4444" : key === "memory" ? "#3B82F6" : key === "inbound" ? "#10B981" : "#F59E0B"
    }
  ))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#64748B", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 } }, /* @__PURE__ */ React.createElement("span", null, "Last updated: ", lastRunAt ? new Date(lastRunAt).toLocaleString() : "Not run yet"), /* @__PURE__ */ React.createElement("span", null, "Queries execute via Grafana datasource proxy.")), error && /* @__PURE__ */ React.createElement("div", { style: { padding: 10, borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", fontSize: 12, color: "#B91C1C" } }, error), datasourceError && !selectedDatasource && /* @__PURE__ */ React.createElement("div", { style: { padding: 10, borderRadius: 6, border: "1px solid #FBBF24", background: "#FFFBEB", fontSize: 12, color: "#92400E" } }, datasourceError)) : /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        marginTop: 12,
        padding: 12,
        borderRadius: 6,
        border: "1px dashed #CBD5F5",
        background: "#FFFFFF",
        color: "#475569",
        fontSize: 12
      }
    },
    "Enable this panel to run Prometheus queries for the ",
    pipelineType,
    " pipeline."
  )));
};

// pages/utils/telemetry.ts
var buildDefaultStageQueries = () => ({
  receivers: {
    inbound: 'sum(rate(otelcol_receiver_accepted_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", receiver="$stage", pipeline="$pipeline"}[5m]))',
    outbound: 'sum(rate(otelcol_receiver_failed_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", receiver="$stage", pipeline="$pipeline"}[5m]))'
  },
  processors: {
    inbound: 'sum(rate(otelcol_processor_incoming_items_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", processor="$stage"}[5m]))',
    outbound: 'sum(rate(otelcol_processor_outgoing_items_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", processor="$stage"}[5m]))'
  },
  exporters: {
    inbound: 'sum(rate(otelcol_exporter_send_failed_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", exporter="$stage"}[5m])) + sum(rate(otelcol_exporter_sent_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", exporter="$stage"}[5m]))',
    outbound: 'sum(rate(otelcol_exporter_sent_log_records_total{service_instance_id="$collector_uid", pod=~"$pod", pipeline="$pipeline", exporter="$stage"}[5m]))'
  }
});
var cloneStageQueries = (incoming) => {
  const defaults = buildDefaultStageQueries();
  const normalize = (key) => {
    const candidate = incoming && incoming[key] || {};
    const inbound = typeof candidate.inbound === "string" && candidate.inbound.trim() !== "" ? candidate.inbound : defaults[key].inbound;
    const outbound = typeof candidate.outbound === "string" && candidate.outbound.trim() !== "" ? candidate.outbound : defaults[key].outbound;
    return { inbound, outbound };
  };
  return {
    receivers: normalize("receivers"),
    processors: normalize("processors"),
    exporters: normalize("exporters")
  };
};
var getDefaultTelemetrySettingsState = () => ({
  metrics: {
    enabled: false,
    datasourceUid: null,
    datasourceOrgId: null,
    queries: buildDefaultMetricQueries("$pipeline"),
    stageQueries: buildDefaultStageQueries()
  },
  logs: {
    enabled: false,
    datasourceUid: null,
    datasourceOrgId: null,
    query: LOGS_QUERY_PLACEHOLDER
  }
});
var normalizeTelemetrySettingsState = (incoming) => {
  const defaults = getDefaultTelemetrySettingsState();
  const parseOrgId = (value) => {
    if (value === null || value === void 0) {
      return null;
    }
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  };
  if (!incoming || typeof incoming !== "object") {
    return defaults;
  }
  const metrics = {
    enabled: Boolean(incoming.metrics?.enabled),
    datasourceUid: typeof incoming.metrics?.datasourceUid === "string" ? incoming.metrics.datasourceUid : typeof incoming.metrics?.datasource_uid === "string" ? incoming.metrics.datasource_uid : null,
    datasourceOrgId: parseOrgId(incoming.metrics?.datasourceOrgId ?? incoming.metrics?.datasource_org_id),
    queries: { ...defaults.metrics.queries },
    stageQueries: cloneStageQueries(incoming.metrics?.stageQueries || incoming.metrics?.stage_queries || null)
  };
  if (incoming.metrics?.queries && typeof incoming.metrics.queries === "object") {
    Object.entries(incoming.metrics.queries).forEach(([key, value]) => {
      if (typeof value === "string" && key && value.trim() !== "") {
        metrics.queries[key] = value;
      }
    });
  }
  const logs = {
    enabled: Boolean(incoming.logs?.enabled),
    datasourceUid: typeof incoming.logs?.datasourceUid === "string" ? incoming.logs.datasourceUid : typeof incoming.logs?.datasource_uid === "string" ? incoming.logs.datasource_uid : null,
    datasourceOrgId: parseOrgId(incoming.logs?.datasourceOrgId ?? incoming.logs?.datasource_org_id),
    query: typeof incoming.logs?.query === "string" && incoming.logs.query.trim() !== "" ? incoming.logs.query : LOGS_QUERY_PLACEHOLDER
  };
  return {
    metrics,
    logs
  };
};

// pages/utils/helpers.tsx
var React2 = __REACT__.default || __REACT__;
var normalizeTelemetryItems = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    const payload = item?.data ?? item ?? {};
    return {
      recorded_at: item?.recorded_at || item?.reported_at || payload?.recorded_at || payload?.reported_at || null,
      cpu_percent: payload?.cpu_percent ?? null,
      memory_bytes: payload?.memory_bytes ?? null,
      inbound_bandwidth_kbps: payload?.inbound_bandwidth_kbps ?? null,
      outbound_bandwidth_kbps: payload?.outbound_bandwidth_kbps ?? null,
      pipelines: payload?.pipelines ?? payload?.pipelines_json ?? null
    };
  });
};
var getStatusBadge = (status) => {
  const styles = {
    online: { bg: "#10B981", color: "white", icon: "\u25CF" },
    offline: { bg: "#EF4444", color: "white", icon: "\u25CF" },
    degraded: { bg: "#F59E0B", color: "white", icon: "\u26A0" },
    unknown: { bg: "#6B7280", color: "white", icon: "\u25CF" }
  };
  const s = styles[status] || styles.unknown;
  return /* @__PURE__ */ React2.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500,
    background: s.bg,
    color: s.color
  } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 8 } }, s.icon), status);
};

// pages/utils/capabilities.tsx
var React2 = __REACT__.default || __REACT__;
var { useMemo: useMemo2 } = React2;
var capabilityMeta = {
  accepts_remote_config: {
    label: "Remote Config",
    description: "Accepts remote configuration updates pushed via OpAMP.",
    icon: "\u2699\uFE0F",
    tone: { bg: "#EEF2FF", border: "#C7D2FE", color: "#3730A3" }
  },
  reports_effective_config: {
    label: "Reports Config",
    description: "Reports effective configuration back to the OpAMP server.",
    icon: "\u{1F9FE}",
    tone: { bg: "#ECFDF5", border: "#A7F3D0", color: "#065F46" }
  },
  reports_health: {
    label: "Health",
    description: "Sends health status updates (required for health widget).",
    icon: "\u2764\uFE0F",
    tone: { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" }
  },
  reports_own_logs: {
    label: "Logs",
    description: "Streams self-observed logs via OpAMP telemetry endpoint.",
    icon: "\u{1F4DC}",
    tone: { bg: "#FDF2F8", border: "#FBCFE8", color: "#9D174D" }
  },
  reports_own_metrics: {
    label: "Metrics",
    description: "Streams self-observed metrics via OpAMP telemetry endpoint.",
    icon: "\u{1F4C8}",
    tone: { bg: "#ECFEFF", border: "#BAE6FD", color: "#0C4A6E" }
  },
  reports_own_traces: {
    label: "Traces",
    description: "Streams self-observed traces via OpAMP telemetry endpoint.",
    icon: "\u{1F6F0}\uFE0F",
    tone: { bg: "#FFF7ED", border: "#FED7AA", color: "#9A3412" }
  },
  accepts_restart_command: {
    label: "Restart Cmd",
    description: "Can be restarted remotely from the OpAMP server.",
    icon: "\u{1F501}",
    tone: { bg: "#E0E7FF", border: "#C7D2FE", color: "#312E81" }
  },
  reports_remote_config: {
    label: "Config Status",
    description: "Reports remote configuration hashes/status for auditing.",
    icon: "\u{1F6F0}\uFE0F",
    tone: { bg: "#F3F4F6", border: "#E5E7EB", color: "#111827" }
  },
  reports_status: {
    label: "Agent Status",
    description: "Sends regular status updates (uptime, metadata, etc.).",
    icon: "\u{1F4E1}",
    tone: { bg: "#F0FDFA", border: "#99F6E4", color: "#115E59" }
  },
  reports_available_components: {
    label: "Component Inventory",
    description: "Reports available receivers/processors/exporters.",
    icon: "\u{1F9E9}",
    tone: { bg: "#EFF6FF", border: "#BFDBFE", color: "#1E3A8A" }
  }
};
var isCapabilityEnabled = (value) => {
  if (value === void 0 || value === null) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return true;
};
var CapabilityBadges = ({
  capabilities,
  limit = 5,
  compact = false,
  onOpenDetails
}) => {
  const badges = useMemo2(() => {
    if (!capabilities || typeof capabilities !== "object") {
      return [];
    }
    const enabled = [];
    for (const key of capabilityOrder) {
      if (isCapabilityEnabled(capabilities[key])) {
        const meta = capabilityMeta[key];
        if (meta) {
          enabled.push({ key, meta });
        }
      }
    }
    return enabled;
  }, [capabilities]);
  const visible = badges.slice(0, limit);
  const remaining = badges.length - visible.length;
  return /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } }, visible.map(({ key, meta }) => /* @__PURE__ */ React2.createElement(
    "span",
    {
      key,
      title: meta.description,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: compact ? "2px 6px" : "4px 8px",
        borderRadius: 6,
        fontSize: compact ? 10 : 11,
        fontWeight: 500,
        background: meta.tone.bg,
        border: `1px solid ${meta.tone.border}`,
        color: meta.tone.color,
        cursor: onOpenDetails ? "pointer" : "default"
      },
      onClick: (e) => {
        e.stopPropagation();
        onOpenDetails?.();
      }
    },
    /* @__PURE__ */ React2.createElement("span", null, meta.icon),
    !compact && /* @__PURE__ */ React2.createElement("span", null, meta.label)
  )), remaining > 0 && /* @__PURE__ */ React2.createElement(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        padding: compact ? "2px 6px" : "4px 8px",
        borderRadius: 6,
        fontSize: compact ? 10 : 11,
        fontWeight: 500,
        background: "#F3F4F6",
        border: "1px solid #E5E7EB",
        color: "#6B7280",
        cursor: onOpenDetails ? "pointer" : "default"
      },
      onClick: (e) => {
        e.stopPropagation();
        onOpenDetails?.();
      }
    },
    "+",
    remaining,
    " more"
  ));
};

// pages/components/TelemetryToggleCard.tsx
var React2 = __REACT__.default || __REACT__;
var TelemetryToggleCard = ({
  title,
  description,
  enabled,
  disabled,
  datasourceLabel,
  footerNote,
  onToggle,
  onConfigure
}) => /* @__PURE__ */ React2.createElement(
  "div",
  {
    style: {
      flex: "1 1 280px",
      minWidth: 260,
      padding: 16,
      borderRadius: 10,
      border: "1px solid #E5E7EB",
      background: enabled ? "#EEF2FF" : "#FFFFFF",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  },
  /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827" } }, title),
  /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#4B5563", lineHeight: 1.6 } }, description),
  datasourceLabel && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#1F2937", fontWeight: 500 } }, datasourceLabel),
  /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#1F2937", flexWrap: "wrap", gap: 8 } }, /* @__PURE__ */ React2.createElement("span", null, "Status: ", /* @__PURE__ */ React2.createElement("strong", null, enabled ? "Enabled" : "Disabled")), /* @__PURE__ */ React2.createElement("label", { style: { display: "inline-flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React2.createElement("input", { type: "checkbox", checked: enabled, disabled, onChange: onToggle }), /* @__PURE__ */ React2.createElement("span", null, enabled ? "Disable" : "Enable"))),
  /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      onClick: onConfigure,
      disabled,
      style: {
        padding: "6px 12px",
        borderRadius: 6,
        border: "1px solid #2563EB",
        background: disabled ? "#BFDBFE" : "#2563EB",
        color: disabled ? "#1D4ED8" : "#FFFFFF",
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s ease"
      }
    },
    "Configure"
  ),
  footerNote && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", lineHeight: 1.4 } }, footerNote)
);

// pages/components/LogsPanelView.tsx
var React2 = __REACT__.default || __REACT__;

var rawBackendSrv3 = __GRAFANA_RUNTIME__.getBackendSrv();
var { useState: useState2, useEffect: useEffect2, useCallback: useCallback2, useMemo: useMemo2 } = React2;
var LogsPanelView = ({ settings, enabled, agentUid, agentName, orgName, onConfigure, backendSrv: backendSrv6 }) => {
  const [datasource, setDatasource] = useState2(null);
  const [entries, setEntries] = useState2([]);
  const [loading, setLoading] = useState2(false);
  const [error, setError] = useState2(null);
  const orgHeaders = useMemo2(
    () => settings.datasourceOrgId ? { "X-Grafana-Org-Id": String(settings.datasourceOrgId) } : void 0,
    [settings.datasourceOrgId]
  );
  useEffect2(() => {
    let cancelled = false;
    const resolveDatasource = async () => {
      if (!settings.datasourceUid) {
        setDatasource(null);
        return;
      }
      try {
        const list = await backendSrv6.get("/api/datasources", { headers: orgHeaders });
        if (!cancelled) {
          setDatasource(Array.isArray(list) ? list.find((ds) => ds.uid === settings.datasourceUid) || null : null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load data sources", err);
        }
      }
    };
    resolveDatasource();
    return () => {
      cancelled = true;
    };
  }, [settings.datasourceUid, backendSrv6, orgHeaders]);
  const buildQuery = useCallback2(() => {
    const template = settings.query || LOGS_QUERY_PLACEHOLDER;
    return template.replace(/\$collector_uid/g, agentUid || "").replace(/\$collector_name/g, agentName || "").replace(/\$org_name/g, orgName || "");
  }, [settings.query, agentUid, agentName, orgName]);
  const fetchLogs = useCallback2(async () => {
    if (!datasource) {
      setError("Select a Loki datasource to fetch logs.");
      return;
    }
    const query = buildQuery();
    if (!query || query.trim() === "") {
      setError("Query template is empty. Update the configuration.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const end = /* @__PURE__ */ new Date();
      const start = new Date(end.getTime() - 10 * 60 * 1e3);
      const response = await rawBackendSrv3.datasourceRequest({
        method: "GET",
        url: `/api/datasources/proxy/${datasource.id}/loki/api/v1/query_range`,
        params: {
          query,
          limit: 50,
          direction: "backward",
          start: start.toISOString(),
          end: end.toISOString()
        },
        headers: orgHeaders
      });
      const result = response?.data?.data?.result || [];
      const rows = [];
      result.forEach((stream) => {
        const values = stream?.values || [];
        values.forEach((value) => {
          if (Array.isArray(value) && value.length >= 2) {
            const ts = Number(value[0]);
            const tsMs = Number.isFinite(ts) ? ts / 1e6 : Date.now();
            rows.push({
              ts: new Date(tsMs).toLocaleString(),
              line: value[1]
            });
          }
        });
      });
      rows.sort((a, b) => a.ts < b.ts ? 1 : -1);
      setEntries(rows.slice(0, 50));
    } catch (err) {
      console.error("Failed to query Loki", err);
      setError(err?.data?.message || err?.message || "Failed to query Loki datasource.");
    } finally {
      setLoading(false);
    }
  }, [datasource, buildQuery, orgHeaders]);
  if (!enabled) {
    return /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          padding: 16,
          borderRadius: 8,
          border: "1px dashed #CBD5F5",
          background: "#F8FAFC",
          color: "#475569",
          fontSize: 12
        }
      },
      "Log snapshots are disabled. Enable them above and configure a Loki data source to view recent collector logs."
    );
  }
  return /* @__PURE__ */ React2.createElement(
    "div",
    {
      style: {
        borderRadius: 8,
        border: "1px solid #E2E8F0",
        padding: 16,
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        gap: 12
      }
    },
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827" } }, "Recent logs"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, datasource ? `Datasource: ${datasource.name}` : "Datasource not configured")), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React2.createElement(
      "button",
      {
        type: "button",
        onClick: fetchLogs,
        disabled: loading || !datasource,
        style: {
          padding: "6px 12px",
          borderRadius: 6,
          border: "none",
          background: loading || !datasource ? "#CBD5F5" : "#2563EB",
          color: "#FFFFFF",
          fontSize: 12,
          cursor: loading || !datasource ? "not-allowed" : "pointer"
        }
      },
      loading ? "Fetching\u2026" : "Refresh logs"
    ), /* @__PURE__ */ React2.createElement(
      "button",
      {
        type: "button",
        onClick: onConfigure,
        style: {
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #E5E7EB",
          background: "#FFFFFF",
          fontSize: 12,
          cursor: "pointer"
        }
      },
      "Configure"
    ))),
    error && /* @__PURE__ */ React2.createElement("div", { style: { padding: 10, borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", fontSize: 12, color: "#B91C1C" } }, error),
    entries.length === 0 ? /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          padding: 12,
          borderRadius: 6,
          border: "1px dashed #CBD5F5",
          background: "#F8FAFC",
          fontSize: 12,
          color: "#475569"
        }
      },
      'No log entries fetched yet. Click "Refresh logs" to query the configured Loki datasource.'
    ) : /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          maxHeight: 260,
          overflowY: "auto",
          borderRadius: 6,
          border: "1px solid #E2E8F0",
          fontFamily: "monospace",
          fontSize: 12,
          background: "#0F172A",
          color: "#E2E8F0"
        }
      },
      entries.map((entry, idx) => /* @__PURE__ */ React2.createElement("div", { key: `${entry.ts}-${idx}`, style: { padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)" } }, /* @__PURE__ */ React2.createElement("span", { style: { color: "#93C5FD", marginRight: 8 } }, entry.ts), /* @__PURE__ */ React2.createElement("span", null, entry.line)))
    )
  );
};

// pages/components/PipelineFlowDiagram.tsx
var React2 = __REACT__.default || __REACT__;

// node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      destination[key] = source[key];
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    if (keyNode === "__proto__") {
      Object.defineProperty(_result, keyNode, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: valueNode
      });
    } else {
      _result[keyNode] = valueNode;
    }
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  }();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  }();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// pages/components/StageMetricsRail.tsx
var React2 = __REACT__.default || __REACT__;

// pages/components/StageMetricsGroup.tsx
var React2 = __REACT__.default || __REACT__;


// pages/utils/metrics.ts
var escapeSelectorValue = (value) => value.replace(/"/g, '\\"');
var extractPrometheusSample = (payload) => {
  if (!payload || payload.status !== "success") {
    return null;
  }
  const data = payload.data;
  if (!data) {
    return null;
  }
  if (data.resultType === "scalar" && Array.isArray(data.result) && data.result.length >= 2) {
    const numeric = parseFloat(data.result[1]);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (data.resultType === "vector" && Array.isArray(data.result)) {
    const aggregated = data.result.reduce((acc, sample) => {
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
var formatStageRate = (value) => {
  if (value === null || Number.isNaN(value)) {
    return "\u2014";
  }
  const abs = Math.abs(value);
  if (abs >= 1e6) {
    return `${(value / 1e6).toFixed(1)} M rec/s`;
  }
  if (abs >= 1e3) {
    return `${(value / 1e3).toFixed(1)} k rec/s`;
  }
  return `${value.toFixed(1)} rec/s`;
};

// pages/components/StageMetricsGroup.tsx
var { useState: useState2, useEffect: useEffect2, useCallback: useCallback2 } = React2;
var rawBackendSrv4 = __GRAFANA_RUNTIME__.getBackendSrv();
var StageMetricsGroup = ({ kind, stages, pipelineType, datasource, templates, agentUid, datasourceOrgId }) => {
  const [values, setValues] = useState2({});
  const [loading, setLoading] = useState2(false);
  const [error, setError] = useState2(null);
  const [lastUpdated, setLastUpdated] = useState2(null);
  const template = templates[kind] || buildDefaultStageQueries()[kind];
  const applyPlaceholders = useCallback2((rawQuery, stageName) => {
    if (!rawQuery || rawQuery.trim() === "") {
      return "";
    }
    const resolvedCollector = agentUid && agentUid.trim() !== "" ? escapeSelectorValue(agentUid) : "$collector_uid";
    const resolvedPod = agentUid && agentUid.trim() !== "" ? escapeSelectorValue(agentUid) : "$pod";
    const resolvedPipeline = pipelineType && pipelineType.trim() !== "" ? escapeSelectorValue(pipelineType) : "$pipeline";
    const resolvedStage = stageName && stageName.trim() !== "" ? escapeSelectorValue(stageName) : "$stage";
    return rawQuery.replace(/\$collector_uid/g, resolvedCollector).replace(/\$collector_pod/g, resolvedPod).replace(/\$pod/g, resolvedPod).replace(/\$pipeline/g, resolvedPipeline).replace(/\$stage/g, resolvedStage);
  }, [agentUid, pipelineType]);
  const executeQuery = useCallback2(async (query, now) => {
    if (!datasource || !query || query.trim() === "") {
      return null;
    }
    const response = await rawBackendSrv4.datasourceRequest({
      method: "GET",
      url: `/api/datasources/proxy/${datasource.id}/api/v1/query`,
      params: { query, time: now },
      headers: datasourceOrgId ? { "X-Grafana-Org-Id": String(datasourceOrgId) } : void 0
    });
    return extractPrometheusSample(response?.data);
  }, [datasource, datasourceOrgId]);
  const runQueries = useCallback2(async () => {
    if (!datasource || stages.length === 0) {
      setValues({});
      setLastUpdated(null);
      setError(stages.length === 0 ? null : "Datasource not ready");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1e3);
      const next = {};
      for (const stageName of stages) {
        const inboundQuery = applyPlaceholders(template.inbound || "", stageName);
        const outboundQuery = applyPlaceholders(template.outbound || "", stageName);
        const inboundValue = inboundQuery ? await executeQuery(inboundQuery, now) : null;
        const outboundValue = outboundQuery ? await executeQuery(outboundQuery, now) : null;
        next[stageName] = {
          inbound: formatStageRate(inboundValue),
          outbound: formatStageRate(outboundValue)
        };
      }
      setValues(next);
      setLastUpdated(Date.now());
    } catch (err) {
      console.error("Stage metrics query failed", err);
      setError(err?.data?.message || err?.message || "Query failed. Adjust selectors and try again.");
    } finally {
      setLoading(false);
    }
  }, [datasource, stages, template, applyPlaceholders, executeQuery]);
  useEffect2(() => {
    if (!datasource || stages.length === 0) {
      return;
    }
    runQueries();
    const interval = setInterval(runQueries, 6e4);
    return () => clearInterval(interval);
  }, [datasource, stages, runQueries]);
  const palette = STAGE_SUMMARY[kind];
  return /* @__PURE__ */ React2.createElement("div", { style: { border: `1px solid ${palette.border}`, borderRadius: 10, padding: 14, background: "#FFFFFF", display: "flex", flexDirection: "column", gap: 10 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: palette.color } }, palette.title, " (", stages.length, ")"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280" } }, palette.description), stages.length === 0 ? /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "None configured in this pipeline.") : /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, stages.map((stage) => /* @__PURE__ */ React2.createElement("div", { key: `${kind}-${stage}`, style: { border: "1px solid #E5E7EB", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#111827" } }, stage), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("div", { style: { flex: "1 1 120px" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280" } }, "Inbound"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#111827" } }, values[stage]?.inbound ?? "\u2014")), /* @__PURE__ */ React2.createElement("div", { style: { flex: "1 1 120px" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280" } }, "Outbound"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#111827" } }, values[stage]?.outbound ?? "\u2014")))))), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 11, color: "#6B7280" } }, /* @__PURE__ */ React2.createElement("span", null, "Last updated: ", lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "Not run yet"), /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      onClick: runQueries,
      disabled: loading || !datasource || stages.length === 0,
      style: {
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid #CBD5F5",
        background: loading ? "#E5E7EB" : "#F8FAFC",
        cursor: loading || !datasource || stages.length === 0 ? "not-allowed" : "pointer"
      }
    },
    loading ? "Running\u2026" : "Refresh"
  )), error && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: 8 } }, error));
};

// pages/components/StageMetricsRail.tsx
var { useState: useState2, useEffect: useEffect2 } = React2;
var runtimeMode2 = detectRuntimeMode();
var isRunningInGrafana2 = runtimeMode2 === "grafana";
var grafanaTransport2 = detectGrafanaTransport(isRunningInGrafana2);
var backendSrv2 = createBackendSrv(isRunningInGrafana2, grafanaTransport2);
var STAGE_SUMMARY = {
  receivers: {
    title: "Receivers",
    color: "#047857",
    border: "#6EE7B7",
    description: "Monitors traffic entering each receiver and any drops/refusals."
  },
  processors: {
    title: "Processors",
    color: "#B45309",
    border: "#FCD34D",
    description: "Observes items entering and exiting each processor in the pipeline."
  },
  exporters: {
    title: "Exporters",
    color: "#1D4ED8",
    border: "#BFDBFE",
    description: "Shows attempted vs. successful sends for each exporter."
  }
};
var StageMetricsRail = ({ flowType, receivers, processors, exporters, metricsSettings, agentUid, onConfigureMetrics }) => {
  const datasourceUid = metricsSettings.datasourceUid;
  const datasourceOrgId = metricsSettings.datasourceOrgId;
  const [datasource, setDatasource] = useState2(null);
  const [dsError, setDsError] = useState2(null);
  const [loadingDatasource, setLoadingDatasource] = useState2(false);
  useEffect2(() => {
    if (!datasourceUid) {
      setDatasource(null);
      setDsError("Select a Prometheus or Mimir datasource to populate per-stage metrics.");
      return;
    }
    let cancelled = false;
    const load2 = async () => {
      setLoadingDatasource(true);
      try {
        const headers = datasourceOrgId ? { "X-Grafana-Org-Id": String(datasourceOrgId) } : void 0;
        const ds = await backendSrv2.get(`/api/datasources/uid/${encodeURIComponent(datasourceUid)}`, { headers });
        if (!cancelled) {
          setDatasource(ds ?? null);
          setDsError(null);
        }
      } catch (err) {
        console.error("Failed to resolve datasource metadata", err);
        if (!cancelled) {
          setDatasource(null);
          setDsError(err?.message || "Failed to resolve datasource metadata");
        }
      } finally {
        if (!cancelled) {
          setLoadingDatasource(false);
        }
      }
    };
    load2();
    return () => {
      cancelled = true;
    };
  }, [datasourceUid, datasourceOrgId]);
  const templates = metricsSettings.stageQueries || buildDefaultStageQueries();
  const totalComponents = receivers.length + processors.length + exporters.length;
  if (totalComponents === 0) {
    return null;
  }
  return /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 16, padding: 16, borderRadius: 12, border: "1px solid #E5E7EB", background: "#FFFFFF", display: "flex", flexDirection: "column", gap: 12 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#111827" } }, "Per-stage throughput (", flowType, ")"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "Each card runs the configured inbound/outbound queries with $stage and $pipeline placeholders.")), !datasource && /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      onClick: onConfigureMetrics,
      style: { padding: "6px 12px", borderRadius: 6, border: "1px solid #2563EB", background: "#2563EB", color: "#FFFFFF", fontSize: 12, cursor: "pointer" }
    },
    "Configure datasource"
  )), dsError && /* @__PURE__ */ React2.createElement("div", { style: { border: "1px solid #FCD34D", background: "#FEF3C7", color: "#92400E", fontSize: 12, borderRadius: 8, padding: 10 } }, dsError), /* @__PURE__ */ React2.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 } }, /* @__PURE__ */ React2.createElement(StageMetricsGroup, { kind: "receivers", stages: receivers, pipelineType: flowType, datasource, templates, agentUid, datasourceOrgId }), /* @__PURE__ */ React2.createElement(StageMetricsGroup, { kind: "processors", stages: processors, pipelineType: flowType, datasource, templates, agentUid, datasourceOrgId }), /* @__PURE__ */ React2.createElement(StageMetricsGroup, { kind: "exporters", stages: exporters, pipelineType: flowType, datasource, templates, agentUid, datasourceOrgId })), loadingDatasource && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280" } }, "Resolving datasource metadata\u2026"));
};

// pages/components/PipelineFlowDiagram.tsx
var { useMemo: useMemo2 } = React2;
var PipelineFlowDiagram = React2.memo(function PipelineFlowDiagram2({
  config,
  pipelines,
  telemetry,
  agentName,
  agentUid,
  orgName,
  metricsSettings,
  onConfigureMetrics,
  agentLabels
}) {
  const podName = agentLabels ? agentLabels["pod"] || agentLabels["k8s.pod.name"] || agentLabels["k8s_pod_name"] || agentLabels["host.name"] || void 0 : void 0;
  const pipelineFlows = useMemo2(() => {
    const flows2 = [];
    if (!config) {
      return flows2;
    }
    try {
      const parsed = load(config);
      const servicePipelines = parsed?.service?.pipelines;
      if (servicePipelines && typeof servicePipelines === "object") {
        Object.entries(servicePipelines).forEach(([pipelineType, pipelineConfig]) => {
          flows2.push({
            type: pipelineType,
            receivers: pipelineConfig?.receivers || [],
            processors: pipelineConfig?.processors || [],
            exporters: pipelineConfig?.exporters || []
          });
        });
      }
    } catch (err) {
      console.error("Failed to parse config for flow diagram:", err);
    }
    return flows2;
  }, [config]);
  const flows = pipelineFlows.length > 0 ? pipelineFlows : Array.isArray(pipelines) ? pipelines : [];
  const hasTelemetryUsage = Array.isArray(telemetry) && telemetry.some((item) => {
    const type2 = String(item?.type || item?.signal || "").toLowerCase();
    return type2.includes("metric") || type2.includes("usage");
  });
  const renderColumn = (items, header, palette) => /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, minWidth: 200 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: palette.color, textAlign: "center", marginBottom: 8 } }, header), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, items.length > 0 ? items.map((name) => /* @__PURE__ */ React2.createElement(
    "div",
    {
      key: name,
      style: {
        padding: 12,
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
        textAlign: "center",
        fontSize: 12,
        color: palette.color
      }
    },
    name
  )) : /* @__PURE__ */ React2.createElement(
    "div",
    {
      style: {
        padding: 12,
        background: "#F3F4F6",
        border: "1px dashed #D1D5DB",
        borderRadius: 6,
        textAlign: "center",
        fontSize: 11,
        color: "#9CA3AF"
      }
    },
    "None"
  )));
  if (flows.length === 0) {
    return null;
  }
  return /* @__PURE__ */ React2.createElement("div", { style: { width: "100%", margin: 0, padding: 0 } }, /* @__PURE__ */ React2.createElement(
    "div",
    {
      style: {
        width: "100%",
        padding: "24px 28px",
        background: "#F9FAFB",
        border: "1px solid #E5E7EB",
        borderRadius: 16,
        boxSizing: "border-box",
        boxShadow: "0 12px 24px rgba(15,23,42,0.08)"
      }
    },
    /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 12 } }, "Pipeline Flow"),
    /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          marginBottom: 20,
          padding: 16,
          background: "#F3F4F6",
          borderRadius: 8,
          border: "1px dashed #D1D5DB",
          fontSize: 12,
          color: "#4B5563",
          lineHeight: 1.6
        }
      },
      hasTelemetryUsage ? "Usage telemetry is arriving from this collector. Enable the metrics overlay to pull CPU/memory gauges and per-stage throughput cards from your Prometheus/Mimir datasource." : "The collector has not reported usage telemetry via OpAMP yet. Configure the agent to report own metrics or scrape it with your preferred monitoring stack to visualise CPU, memory, and throughput."
    ),
    flows.map((flow) => /* @__PURE__ */ React2.createElement(
      "div",
      {
        key: flow.type,
        style: {
          width: "100%",
          marginBottom: 20,
          padding: "20px 24px",
          background: "white",
          borderRadius: 10,
          border: "1px solid #E5E7EB",
          boxSizing: "border-box"
        }
      },
      /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 14, textTransform: "capitalize" } }, flow.type, " pipeline"),
      /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, overflowX: "auto" } }, renderColumn(flow.receivers, `Receivers (${flow.receivers.length})`, {
        background: "#ECFDF5",
        border: "#6EE7B7",
        color: "#047857"
      }), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 24, color: "#9CA3AF" } }, "\u2192"), renderColumn(flow.processors, `Processors (${flow.processors.length})`, {
        background: "#FEF2F2",
        border: "#FECACA",
        color: "#B91C1C"
      }), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 24, color: "#9CA3AF" } }, "\u2192"), renderColumn(flow.exporters, `Exporters (${flow.exporters.length})`, {
        background: "#EFF6FF",
        border: "#BFDBFE",
        color: "#1D4ED8"
      })),
      metricsSettings?.enabled && /* @__PURE__ */ React2.createElement(
        StageMetricsRail,
        {
          flowType: flow.type,
          receivers: flow.receivers,
          processors: flow.processors,
          exporters: flow.exporters,
          metricsSettings,
          agentUid,
          onConfigureMetrics
        }
      ),
      /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 16 } }, metricsSettings?.enabled && metricsSettings.datasourceUid ? /* @__PURE__ */ React2.createElement(
        PipelineMetricsPanelView,
        {
          key: `${flow.type}-${metricsSettings.datasourceUid}-${metricsSettings.datasourceOrgId || "default"}`,
          pipelineType: flow.type,
          agentUid,
          agentName,
          orgName,
          allowDisable: false,
          initialEnabled: true,
          defaultQueries: metricsSettings.queries && Object.keys(metricsSettings.queries).length > 0 ? metricsSettings.queries : buildDefaultMetricQueries(flow.type, agentUid, podName),
          defaultDatasourceUid: metricsSettings.datasourceUid,
          datasourceOrgId: metricsSettings.datasourceOrgId,
          readOnly: true
        }
      ) : /* @__PURE__ */ React2.createElement(
        "div",
        {
          style: {
            padding: 16,
            borderRadius: 8,
            border: "1px dashed #CBD5F5",
            background: "#F8FAFC",
            fontSize: 12,
            color: "#475569",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap"
          }
        },
        /* @__PURE__ */ React2.createElement("span", null, "Metrics overlays are disabled for this pipeline. Configure a Prometheus-compatible datasource to enable live usage charts."),
        /* @__PURE__ */ React2.createElement(
          "button",
          {
            type: "button",
            onClick: onConfigureMetrics,
            style: {
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              background: "#2563EB",
              color: "#FFFFFF",
              fontSize: 12,
              cursor: "pointer"
            }
          },
          "Configure metrics"
        )
      ))
    )),
    /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          marginTop: 12,
          padding: 16,
          background: "#F9FAFB",
          borderRadius: 8,
          border: "1px solid #E5E7EB",
          fontSize: 12,
          color: "#6B7280"
        }
      },
      "Collector logs and error feeds are not streamed through OpAMP yet. Use your existing logging/observability tooling (for example,",
      /* @__PURE__ */ React2.createElement("code", null, "kubectl logs"),
      " or a centralised log store) to review collector output."
    )
  ));
});

// pages/components/MonitoringSection.tsx
var runtimeMode3 = detectRuntimeMode();
var isRunningInGrafana3 = runtimeMode3 === "grafana";
var grafanaTransport3 = detectGrafanaTransport(isRunningInGrafana3);
var backendSrv3 = createBackendSrv(isRunningInGrafana3, grafanaTransport3);
var { useState: useState2, useEffect: useEffect2, useMemo: useMemo2 } = React2;
function MonitoringSection({
  agents,
  bridges,
  telemetrySettings,
  telemetryLoading,
  onToggleMetrics,
  onToggleLogs,
  telemetryDatasourceHints,
  onConfigureTelemetry
}) {
  const [selectedAgentUID, setSelectedAgentUID] = useState2("");
  const [monitoringData, setMonitoringData] = useState2(null);
  const [loading, setLoading] = useState2(false);
  const [expandedGroups, setExpandedGroups] = useState2(/* @__PURE__ */ new Set());
  const metricsSettings = telemetrySettings?.metrics ?? getDefaultTelemetrySettingsState().metrics;
  const logsSettings = telemetrySettings?.logs ?? getDefaultTelemetrySettingsState().logs;
  const metricsDatasourceLabel = metricsSettings.datasourceUid ? `Datasource: ${telemetryDatasourceHints.metrics || metricsSettings.datasourceUid}${metricsSettings.datasourceOrgId ? ` (org ${metricsSettings.datasourceOrgId})` : ""}` : "Datasource: not configured";
  const logsDatasourceLabel = logsSettings.datasourceUid ? `Datasource: ${telemetryDatasourceHints.logs || logsSettings.datasourceUid}${logsSettings.datasourceOrgId ? ` (org ${logsSettings.datasourceOrgId})` : ""}` : "Datasource: not configured";
  useEffect2(() => {
    if (selectedAgentUID) {
      const isBridge = bridges.some((b) => b.agentUid === selectedAgentUID);
      if (isBridge) {
        setSelectedAgentUID("");
        setMonitoringData(null);
      }
    }
  }, [selectedAgentUID, bridges]);
  const loadMonitoringData = async (agentUID, skipLoading = false) => {
    if (!agentUID) {
      setMonitoringData(null);
      return;
    }
    const isBridge = bridges.some((b) => b.agentUid === agentUID);
    if (isBridge) {
      setMonitoringData(null);
      return;
    }
    if (!skipLoading) {
      setLoading(true);
    }
    try {
      const [agentResponse, currentConfigResponse, activityResponse, telemetryResponse, healthResponse, pipelinesResponse] = await Promise.all([
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}`),
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/current-config`),
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/activity?limit=10`),
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/telemetry?limit=50`).catch(() => ({ items: [] })),
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/health?limit=20`).catch(() => ({ items: [], current: {} })),
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/pipelines`).catch(() => ({ items: [] }))
      ]);
      setMonitoringData((prev) => ({
        agent: agentResponse,
        currentConfig: currentConfigResponse,
        recentActivity: activityResponse.items || [],
        telemetry: normalizeTelemetryItems(telemetryResponse.items),
        health: healthResponse,
        pipelines: pipelinesResponse.items || []
      }));
    } catch (err) {
      console.error("Failed to load monitoring data:", err);
      if (!skipLoading) {
        alert("Failed to load monitoring data: " + (err.message || "Unknown error"));
      }
    } finally {
      if (!skipLoading) {
        setLoading(false);
      }
    }
  };
  const refreshMetricsOnly = async (agentUID) => {
    if (!agentUID) return;
    try {
      const [agentResponse, telemetryResponse, healthResponse, pipelinesResponse] = await Promise.all([
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}`).catch(() => null),
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/telemetry?limit=50`).catch(() => ({ items: [] })),
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/health?limit=20`).catch(() => ({ items: [], current: {} })),
        backendSrv3.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/pipelines`).catch(() => ({ items: [] }))
      ]);
      setMonitoringData((prev) => ({
        ...prev,
        agent: agentResponse || prev.agent,
        // Update agent if available (includes status)
        telemetry: normalizeTelemetryItems(telemetryResponse.items),
        health: healthResponse,
        pipelines: pipelinesResponse.items || []
      }));
    } catch (err) {
      console.error("Failed to refresh metrics:", err);
    }
  };
  useEffect2(() => {
    if (selectedAgentUID) {
      loadMonitoringData(selectedAgentUID);
      const interval = setInterval(() => {
        refreshMetricsOnly(selectedAgentUID);
      }, 5e3);
      return () => clearInterval(interval);
    }
  }, [selectedAgentUID]);
  const allCollectors = [
    ...agents,
    // Standalone agents
    ...bridges.flatMap((b) => b.collectors || [])
    // Collectors from bridges
  ];
  const standaloneAgents = useMemo2(() => {
    return agents.filter((agent) => {
      const isBridge = bridges.some((bridge) => bridge.agentUid === agent.agentUid);
      const isBridgeCollector = bridges.some(
        (bridge) => bridge.collectors?.some((collector) => collector.agentUid === agent.agentUid)
      );
      return !isBridge && !isBridgeCollector;
    });
  }, [agents, bridges]);
  const onlineAgents = allCollectors.filter((a) => a.status === "online");
  const totalAgents = allCollectors.length;
  const resolvedAgentCaps = useMemo2(() => {
    if (monitoringData?.agent?.agent?.capabilities) {
      return monitoringData.agent.agent.capabilities;
    }
    if (monitoringData?.agent?.capabilities) {
      return monitoringData.agent.capabilities;
    }
    const fallback = agents.find((a) => a.agentUid === selectedAgentUID);
    return fallback?.capabilities || void 0;
  }, [monitoringData, agents, selectedAgentUID]);
  const healthCapability = resolvedAgentCaps?.reports_health;
  const logsCapability = resolvedAgentCaps?.reports_own_logs;
  const supportsHealthReports = healthCapability === void 0 || healthCapability === true;
  const supportsOwnLogs = logsCapability === void 0 || logsCapability === true;
  const telemetryLogs = Array.isArray(monitoringData?.telemetry) ? monitoringData.telemetry.filter(
    (item) => String(item?.type || item?.signal || item?.category || "").toLowerCase().includes("log")
  ) : [];
  const currentConfig = monitoringData?.currentConfig || null;
  const hasCurrentConfigLoaded = Boolean(currentConfig && (currentConfig.hasAgentConfig || currentConfig.hasConfig));
  const pipelineConfigValue = currentConfig ? currentConfig.agentConfig || currentConfig.config : "";
  const pipelineConfigString = (() => {
    if (!pipelineConfigValue) {
      return "";
    }
    if (typeof pipelineConfigValue === "string") {
      return pipelineConfigValue;
    }
    try {
      return JSON.stringify(pipelineConfigValue, null, 2);
    } catch {
      return String(pipelineConfigValue);
    }
  })();
  const hasPipelineDiagramData = pipelineConfigString.trim().length > 0;
  return /* @__PURE__ */ React2.createElement("div", { style: { width: "100%" } }, /* @__PURE__ */ React2.createElement("div", { style: {
    width: "100%",
    background: "white",
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    padding: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    marginBottom: 24,
    boxSizing: "border-box"
  } }, /* @__PURE__ */ React2.createElement("h3", { style: { margin: 0, fontSize: 18, fontWeight: 600, color: "#111827", marginBottom: 20 } }, "Agent Monitoring & Metrics"), /* @__PURE__ */ React2.createElement("div", { style: {
    marginBottom: 20,
    padding: 16,
    background: "#EFF6FF",
    borderRadius: 6,
    border: "2px solid #3B82F6"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#1E40AF", marginBottom: 8 } }, "\u{1F4A1} How Metrics, Logs, and Traces Work"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#1E3A8A", lineHeight: "1.6" } }, /* @__PURE__ */ React2.createElement("strong", null, "OpAMP vs. Telemetry Data:"), /* @__PURE__ */ React2.createElement("ul", { style: { margin: "8px 0", paddingLeft: 20 } }, /* @__PURE__ */ React2.createElement("li", null, /* @__PURE__ */ React2.createElement("strong", null, "OpAMP (this interface):"), " Manages agents (health, config status, pipeline status, metrics visualization). OpAMP provides agent management and displays metrics/logs/traces flow in the pipeline diagram below."), /* @__PURE__ */ React2.createElement("li", null, /* @__PURE__ */ React2.createElement("strong", null, "Telemetry Data (metrics/logs/traces):"), " Collected by ", /* @__PURE__ */ React2.createElement("strong", null, "receivers"), ", processed by ", /* @__PURE__ */ React2.createElement("strong", null, "processors"), ", and sent via configured ", /* @__PURE__ */ React2.createElement("strong", null, "exporters"), " in the agent's configuration. The pipeline flow diagram shows real-time metrics for each component.")), /* @__PURE__ */ React2.createElement("strong", null, "Metrics & Logs Display:"), /* @__PURE__ */ React2.createElement("ul", { style: { margin: "8px 0", paddingLeft: 20 } }, /* @__PURE__ */ React2.createElement("li", null, "\u{1F4CA} ", /* @__PURE__ */ React2.createElement("strong", null, "Pipeline Flow Diagram:"), " Shows real-time metrics (CPU, Memory, Bandwidth, Throughput) for receivers, processors, and exporters"), /* @__PURE__ */ React2.createElement("li", null, "\u{1F4C8} ", /* @__PURE__ */ React2.createElement("strong", null, "Agent Metrics:"), " Overall agent resource usage (CPU, Memory, Bandwidth, Throughput) displayed at the top"), /* @__PURE__ */ React2.createElement("li", null, "\u{1F4CB} ", /* @__PURE__ */ React2.createElement("strong", null, "Telemetry Data:"), " Historical telemetry data (metrics, logs, traces) is shown in the Telemetry Data section below")), /* @__PURE__ */ React2.createElement("strong", null, "To send telemetry to external backends:"), /* @__PURE__ */ React2.createElement("ol", { style: { margin: "8px 0", paddingLeft: 20 } }, /* @__PURE__ */ React2.createElement("li", null, "Generate a configuration with ", /* @__PURE__ */ React2.createElement("strong", null, "receivers"), " (to collect data) and ", /* @__PURE__ */ React2.createElement("strong", null, "exporters"), " (to send data to your backend)"), /* @__PURE__ */ React2.createElement("li", null, "Configure exporters with endpoints (e.g., OTLP exporter pointing to your metrics backend)"), /* @__PURE__ */ React2.createElement("li", null, "Save and push the configuration to the agent"), /* @__PURE__ */ React2.createElement("li", null, "The agent will send metrics/logs/traces to your configured exporters while displaying metrics here")), /* @__PURE__ */ React2.createElement("strong", null, "Current Status:"), ` The pipeline flow diagram below shows the current configuration's components and their real-time metrics. If "Current Config: Not Available" is shown, the agent has no configuration yet.`)), /* @__PURE__ */ React2.createElement("div", { style: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 24
  } }, /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#EFF6FF",
    borderRadius: 6,
    border: "1px solid #BFDBFE"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#1E40AF", marginBottom: 4, fontWeight: 600 } }, "Total Agents"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 24, fontWeight: 700, color: "#1E40AF" } }, totalAgents)), /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#D1FAE5",
    borderRadius: 6,
    border: "1px solid #86EFAC"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#065F46", marginBottom: 4, fontWeight: 600 } }, "Online"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 24, fontWeight: 700, color: "#065F46" } }, onlineAgents.length), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#059669", marginTop: 4 } }, totalAgents > 0 ? Math.round(onlineAgents.length / totalAgents * 100) : 0, "% availability")), /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#FEE2E2",
    borderRadius: 6,
    border: "1px solid #FECACA"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#991B1B", marginBottom: 4, fontWeight: 600 } }, "Offline"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 24, fontWeight: 700, color: "#991B1B" } }, totalAgents - onlineAgents.length))), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 8 } }, "Select Agent to Monitor"), bridges.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: "12px 16px",
    background: "#FEF3C7",
    border: "1px solid #FCD34D",
    borderRadius: 6,
    marginBottom: 12,
    fontSize: 12,
    color: "#92400E"
  } }, "\u26A0\uFE0F ", /* @__PURE__ */ React2.createElement("strong", null, "Note:"), " Bridges are management agents and cannot be monitored. Only collectors (shown under bridges) can be monitored for pipelines and metrics."), bridges.length > 0 ? /* @__PURE__ */ React2.createElement("div", { style: { border: "1px solid #D1D5DB", borderRadius: 6, background: "white", maxHeight: "400px", overflowY: "auto" } }, bridges.map((bridge) => {
    const bridgeCollectors = bridge.collectors || [];
    const isExpanded = expandedGroups.has(`monitor-${bridge.agentUid}`);
    return /* @__PURE__ */ React2.createElement("div", { key: bridge.agentUid, style: { borderBottom: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement(
      "div",
      {
        onClick: () => {
          const newExpanded = new Set(expandedGroups);
          if (isExpanded) {
            newExpanded.delete(`monitor-${bridge.agentUid}`);
          } else {
            newExpanded.add(`monitor-${bridge.agentUid}`);
          }
          setExpandedGroups(newExpanded);
        },
        style: {
          padding: "12px 16px",
          background: isExpanded ? "#F3F4F6" : "white",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderLeft: "2px solid #E5E7EB"
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.background = "#F9FAFB";
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.background = isExpanded ? "#F3F4F6" : "white";
        }
      },
      /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", width: 20 } }, bridgeCollectors.length > 0 ? isExpanded ? "\u25BC" : "\u25B6" : ""),
      /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, color: "#6B7280", fontSize: 12 } }, bridge.name), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#9CA3AF" } }, "(Bridge - Management Agent)"), bridge.namespace && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#EFF6FF", color: "#1E40AF", borderRadius: 3 } }, "ns: ", bridge.namespace), bridge.cluster && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#F0FDF4", color: "#166534", borderRadius: 3 } }, "cluster: ", bridge.cluster), getStatusBadge(bridge.status), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, bridgeCollectors.length, " collector", bridgeCollectors.length !== 1 ? "s" : ""))
    ), isExpanded && bridgeCollectors.map((collector) => /* @__PURE__ */ React2.createElement(
      "div",
      {
        key: collector.agentUid,
        onClick: (e) => {
          e.stopPropagation();
          setSelectedAgentUID(collector.agentUid);
        },
        style: {
          padding: "10px 16px 10px 48px",
          background: selectedAgentUID === collector.agentUid ? "#DBEAFE" : "#FAFBFC",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderLeft: selectedAgentUID === collector.agentUid ? "4px solid #3B82F6" : "none",
          borderTop: "1px solid #E5E7EB"
        },
        onMouseEnter: (e) => {
          if (selectedAgentUID !== collector.agentUid) {
            e.currentTarget.style.background = "#F9FAFB";
          }
        },
        onMouseLeave: (e) => {
          if (selectedAgentUID !== collector.agentUid) {
            e.currentTarget.style.background = "#FAFBFC";
          }
        }
      },
      /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 500, color: "#111827" } }, collector.name), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "(Collector)"), collector.labels?.["k8s.namespace"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#EFF6FF", color: "#1E40AF", borderRadius: 3 } }, "ns: ", collector.labels["k8s.namespace"]), collector.labels?.["k8s.crd_name"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#FEF3C7", color: "#92400E", borderRadius: 3 } }, "crd: ", collector.labels["k8s.crd_name"]), collector.labels?.["k8s.cluster"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#F0FDF4", color: "#166534", borderRadius: 3 } }, "cluster: ", collector.labels["k8s.cluster"]), getStatusBadge(collector.status), collector.version && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "v", collector.version)),
      /* @__PURE__ */ React2.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            setSelectedAgentUID(collector.agentUid);
          },
          style: {
            padding: "4px 12px",
            background: selectedAgentUID === collector.agentUid ? "#3B82F6" : "#E5E7EB",
            color: selectedAgentUID === collector.agentUid ? "white" : "#374151",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500
          }
        },
        selectedAgentUID === collector.agentUid ? "\u2713 Selected" : "Select"
      )
    )));
  }), standaloneAgents.length > 0 && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { padding: "12px 16px", background: "#F9FAFB", borderTop: "2px solid #E5E7EB", fontWeight: 600, fontSize: 12, color: "#6B7280" } }, "Standalone Agents"), standaloneAgents.map((agent) => /* @__PURE__ */ React2.createElement(
    "div",
    {
      key: agent.agentUid,
      onClick: () => setSelectedAgentUID(agent.agentUid),
      style: {
        padding: "12px 16px",
        background: selectedAgentUID === agent.agentUid ? "#DBEAFE" : "white",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderLeft: selectedAgentUID === agent.agentUid ? "4px solid #3B82F6" : "none",
        borderTop: "1px solid #E5E7EB"
      }
    },
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", null, agent.name || agent.agentUid), getStatusBadge(agent.status), agent.version && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "v", agent.version), agent.labels && Object.keys(agent.labels).length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } }, Object.entries(agent.labels).slice(0, 3).map(([key, value]) => /* @__PURE__ */ React2.createElement("span", { key, style: { fontSize: 10, padding: "2px 6px", background: "#F3F4F6", color: "#374151", borderRadius: 3 } }, key, ": ", value)))),
    /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: (e) => {
          e.stopPropagation();
          setSelectedAgentUID(agent.agentUid);
        },
        style: {
          padding: "4px 12px",
          background: selectedAgentUID === agent.agentUid ? "#3B82F6" : "#E5E7EB",
          color: selectedAgentUID === agent.agentUid ? "white" : "#374151",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 11
        }
      },
      selectedAgentUID === agent.agentUid ? "\u2713 Selected" : "Select"
    )
  )))) : /* @__PURE__ */ React2.createElement(
    "select",
    {
      value: selectedAgentUID,
      onChange: (e) => setSelectedAgentUID(e.target.value),
      style: {
        width: "100%",
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid #D1D5DB",
        fontSize: 14,
        background: "white"
      }
    },
    /* @__PURE__ */ React2.createElement("option", { value: "" }, "-- Select an agent --"),
    agents.map((a) => /* @__PURE__ */ React2.createElement("option", { key: a.agentUid, value: a.agentUid }, a.name || a.agentUid, " (", a.status, ") ", a.labels && Object.keys(a.labels).length > 0 && `[${Object.entries(a.labels).map(([k, v]) => `${k}=${v}`).join(", ")}]`))
  )), loading && /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center", padding: 40, color: "#6B7280" } }, "Loading monitoring data..."), !loading && selectedAgentUID && monitoringData && /* @__PURE__ */ React2.createElement("div", { style: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxSizing: "border-box"
  } }, monitoringData.health && monitoringData.health.current && monitoringData.health.current.healthy !== void 0 && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: monitoringData.health.current.healthy === true ? "#D1FAE5" : "#FEE2E2",
    borderRadius: 6,
    border: `1px solid ${monitoringData.health.current.healthy === true ? "#86EFAC" : "#FECACA"}`
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 8 } }, "\u{1F3E5} Agent Health Status"), /* @__PURE__ */ React2.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Status"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: monitoringData.health.current.healthy === true ? "#065F46" : "#991B1B" } }, monitoringData.health.current.healthy === true ? "\u2713 Healthy" : "\u2717 Unhealthy")), monitoringData.health.current.last_error && /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Last Error"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#991B1B", fontFamily: "monospace" } }, monitoringData.health.current.last_error)), monitoringData.health.current.status_message && /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Status Message"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#111827" } }, monitoringData.health.current.status_message)))), monitoringData.health && (!monitoringData.health.current || monitoringData.health.current.healthy === void 0) && (monitoringData.agent?.agent?.status || monitoringData.agent?.status) === "online" && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#FEF3C7",
    borderRadius: 6,
    border: "1px solid #FCD34D"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 8 } }, "\u{1F3E5} Agent Health Status"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, color: "#92400E", lineHeight: 1.5 } }, supportsHealthReports ? "Health data has not been reported yet. The agent might need a few moments after connecting before it emits OpAMP health messages." : "This agent reported reports_health = false, so the OpAMP server cannot display health data for it."), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, marginTop: 6 } }, /* @__PURE__ */ React2.createElement("a", { href: "https://opentelemetry.io/docs/specs/opamp/protocol/#health-reporting", target: "_blank", rel: "noopener noreferrer", style: { color: "#B45309", textDecoration: "underline" } }, "Learn how OpAMP health reporting works"))), monitoringData.pipelines && monitoringData.pipelines.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 12 } }, "\u{1F504} Pipeline Statuses"), /* @__PURE__ */ React2.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 } }, monitoringData.pipelines.map((pipeline, idx) => /* @__PURE__ */ React2.createElement("div", { key: idx, style: {
    padding: 12,
    background: "white",
    borderRadius: 4,
    border: `1px solid ${pipeline.status === "healthy" ? "#86EFAC" : pipeline.status === "degraded" ? "#FCD34D" : "#FECACA"}`
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#111827" } }, pipeline.name), /* @__PURE__ */ React2.createElement("div", { style: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 4,
    background: pipeline.status === "healthy" ? "#D1FAE5" : pipeline.status === "degraded" ? "#FEF3C7" : "#FEE2E2",
    color: pipeline.status === "healthy" ? "#065F46" : pipeline.status === "degraded" ? "#92400E" : "#991B1B",
    fontWeight: 600
  } }, pipeline.status)), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Type: ", pipeline.type), pipeline.error_message && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#991B1B", marginTop: 4, fontFamily: "monospace" } }, "Error: ", pipeline.error_message), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 10, color: "#9CA3AF", marginTop: 4 } }, "Updated: ", pipeline.last_updated ? new Date(pipeline.last_updated).toLocaleString() : "Never"))))), monitoringData.telemetry && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827" } }, "\u{1F4DC} Collector Telemetry Logs")), telemetryLogs.length > 0 ? /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" } }, telemetryLogs.map((entry, idx) => /* @__PURE__ */ React2.createElement("div", { key: `telemetry-log-${idx}`, style: { padding: 10, background: "white", borderRadius: 4, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B7280", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, color: "#0F172A" } }, entry.level?.toUpperCase() || entry.type || "log"), /* @__PURE__ */ React2.createElement("span", null, entry.reported_at ? new Date(entry.reported_at).toLocaleString() : "")), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#111827", whiteSpace: "pre-wrap", wordBreak: "break-word" } }, entry.message || entry.description || entry.error || JSON.stringify(entry.data || entry))))) : /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", lineHeight: 1.6 } }, supportsOwnLogs ? "No logs have been reported through OpAMP telemetry yet." : "This agent reported reports_own_logs = false, so it will not stream logs through OpAMP. Use your platform (e.g., kubectl logs) to inspect collector logs.")), monitoringData.telemetry && monitoringData.telemetry.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: {
    width: "100%",
    padding: 16,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB",
    marginBottom: 16
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 12 } }, "\u{1F4CA} Agent Telemetry Data"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 12 } }, "Historical telemetry data received from the agent (metrics, logs, traces)"), (() => {
    const grouped = {
      metrics: monitoringData.telemetry.filter((t) => t.type === "metrics"),
      logs: monitoringData.telemetry.filter((t) => t.type === "logs"),
      traces: monitoringData.telemetry.filter((t) => t.type === "traces"),
      other: monitoringData.telemetry.filter((t) => !["metrics", "logs", "traces"].includes(t.type))
    };
    return /* @__PURE__ */ React2.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 } }, grouped.metrics.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#1E40AF", marginBottom: 8 } }, "\u{1F4C8} Metrics (", grouped.metrics.length, ")"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" } }, grouped.metrics.map((tel, idx) => /* @__PURE__ */ React2.createElement("div", { key: `metrics-${idx}`, style: {
      padding: 12,
      background: "white",
      borderRadius: 4,
      border: "1px solid #E5E7EB",
      fontSize: 12
    } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, color: "#9CA3AF" } }, tel.reported_at ? new Date(tel.reported_at).toLocaleString() : "Unknown time")), tel.data && /* @__PURE__ */ React2.createElement("div", { style: {
      background: "#EFF6FF",
      padding: 8,
      borderRadius: 4,
      fontFamily: "monospace",
      fontSize: 11,
      maxHeight: 150,
      overflowY: "auto"
    } }, /* @__PURE__ */ React2.createElement("pre", { style: { margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" } }, JSON.stringify(tel.data, null, 2))))))), grouped.logs.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 8 } }, "\u{1F4CB} Logs (", grouped.logs.length, ")"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" } }, grouped.logs.map((tel, idx) => /* @__PURE__ */ React2.createElement("div", { key: `logs-${idx}`, style: {
      padding: 12,
      background: "white",
      borderRadius: 4,
      border: "1px solid #FCD34D",
      fontSize: 12
    } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, color: "#9CA3AF" } }, tel.reported_at ? new Date(tel.reported_at).toLocaleString() : "Unknown time")), tel.data && /* @__PURE__ */ React2.createElement("div", { style: {
      background: "#FEF3C7",
      padding: 8,
      borderRadius: 4,
      fontFamily: "monospace",
      fontSize: 11,
      maxHeight: 200,
      overflowY: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word"
    } }, typeof tel.data === "string" ? tel.data : JSON.stringify(tel.data, null, 2)))))), grouped.traces.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#7C3AED", marginBottom: 8 } }, "\u{1F50D} Traces (", grouped.traces.length, ")"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" } }, grouped.traces.map((tel, idx) => /* @__PURE__ */ React2.createElement("div", { key: `traces-${idx}`, style: {
      padding: 12,
      background: "white",
      borderRadius: 4,
      border: "1px solid #E5E7EB",
      fontSize: 12
    } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, color: "#9CA3AF" } }, tel.reported_at ? new Date(tel.reported_at).toLocaleString() : "Unknown time")), tel.data && /* @__PURE__ */ React2.createElement("div", { style: {
      background: "#F3E8FF",
      padding: 8,
      borderRadius: 4,
      fontFamily: "monospace",
      fontSize: 11,
      maxHeight: 150,
      overflowY: "auto"
    } }, /* @__PURE__ */ React2.createElement("pre", { style: { margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" } }, JSON.stringify(tel.data, null, 2))))))), grouped.other.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 8 } }, "Other (", grouped.other.length, ")"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" } }, grouped.other.map((tel, idx) => /* @__PURE__ */ React2.createElement("div", { key: `other-${idx}`, style: {
      padding: 12,
      background: "white",
      borderRadius: 4,
      border: "1px solid #E5E7EB",
      fontSize: 12
    } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("div", { style: {
      fontSize: 11,
      padding: "4px 8px",
      borderRadius: 4,
      background: "#F3F4F6",
      color: "#6B7280",
      fontWeight: 600,
      textTransform: "uppercase"
    } }, tel.type || "unknown"), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, color: "#9CA3AF" } }, tel.reported_at ? new Date(tel.reported_at).toLocaleString() : "Unknown time")), tel.data && /* @__PURE__ */ React2.createElement("div", { style: {
      background: "#F9FAFB",
      padding: 8,
      borderRadius: 4,
      fontFamily: "monospace",
      fontSize: 11,
      maxHeight: 150,
      overflowY: "auto"
    } }, /* @__PURE__ */ React2.createElement("pre", { style: { margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" } }, JSON.stringify(tel.data, null, 2))))))));
  })()), /* @__PURE__ */ React2.createElement("div", { style: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 20
  } }, /* @__PURE__ */ React2.createElement("div", { style: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
    width: "100%",
    alignItems: "stretch"
  } }, /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 12
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827" } }, "Agent Status"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Connection Status"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: "#111827", display: "flex", alignItems: "center", gap: 6 } }, (() => {
    const status = monitoringData.agent?.agent?.status || monitoringData.agent?.status;
    if (status === "online") {
      return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("span", { style: {
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#10B981"
      } }), /* @__PURE__ */ React2.createElement("span", null, "Online"));
    } else if (status === "degraded") {
      return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("span", { style: {
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#F59E0B"
      } }), /* @__PURE__ */ React2.createElement("span", null, "Degraded (Unhealthy)"));
    } else if (status === "offline") {
      return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("span", { style: {
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#EF4444"
      } }), /* @__PURE__ */ React2.createElement("span", null, "Offline"));
    } else {
      return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("span", { style: {
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#9CA3AF"
      } }), /* @__PURE__ */ React2.createElement("span", null, "Unknown"));
    }
  })())), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Agent Version"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: "#111827", fontFamily: "monospace" } }, (monitoringData.agent?.agent?.version || monitoringData.agent?.version) && (monitoringData.agent?.agent?.version || monitoringData.agent?.version) !== "unknown" ? monitoringData.agent?.agent?.version || monitoringData.agent?.version : "Not reported")), (monitoringData.agent?.agent?.lastSeen || monitoringData.agent?.lastSeen) && /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Last Seen"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#111827" } }, new Date(monitoringData.agent?.agent?.lastSeen || monitoringData.agent?.lastSeen).toLocaleString())), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Current Config"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: hasCurrentConfigLoaded ? "#10B981" : "#EF4444" } }, hasCurrentConfigLoaded ? "\u2713 Loaded" : "\u2717 Not Available")), resolvedAgentCaps && Object.keys(resolvedAgentCaps).length > 0 && /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "OpAMP Capabilities"), /* @__PURE__ */ React2.createElement(CapabilityBadges, { capabilities: resolvedAgentCaps, limit: 4 })))), /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 12 } }, "Recent Activity"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" } }, monitoringData.recentActivity.length > 0 ? monitoringData.recentActivity.map((act, idx) => /* @__PURE__ */ React2.createElement("div", { key: idx, style: {
    padding: 10,
    background: "white",
    borderRadius: 4,
    border: "1px solid #E5E7EB",
    fontSize: 12
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, color: "#111827" } }, act.type), /* @__PURE__ */ React2.createElement("span", { style: { color: "#9CA3AF", fontSize: 10 } }, act.performedAt ? new Date(act.performedAt).toLocaleString() : "")), /* @__PURE__ */ React2.createElement("div", { style: { color: "#6B7280", fontSize: 11 } }, act.description || act.type), act.performedBy && /* @__PURE__ */ React2.createElement("div", { style: { color: "#9CA3AF", fontSize: 10, marginTop: 4 } }, "by ", act.performedBy))) : /* @__PURE__ */ React2.createElement("div", { style: { color: "#9CA3AF", fontSize: 12, textAlign: "center", padding: 20 } }, "No recent activity"))), hasCurrentConfigLoaded && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 16,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827" } }, "Config Snapshot"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", lineHeight: 1.5 } }, "Currently active configuration returned by the agent. Use this to compare against generated configs or troubleshoot issues."), /* @__PURE__ */ React2.createElement("div", { style: {
    borderRadius: 4,
    border: "1px solid #E5E7EB",
    background: "#FFFFFF",
    maxHeight: 320,
    overflowY: "auto",
    overflowX: "hidden",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    position: "relative",
    flex: "1 1 auto",
    minHeight: 0
  } }, /* @__PURE__ */ React2.createElement("pre", { style: {
    margin: 0,
    padding: 8,
    fontSize: 12,
    fontFamily: "monospace",
    color: "#1F2937",
    backgroundColor: "#FFFFFF",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    lineHeight: "1.5",
    display: "block",
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden"
  } }, pipelineConfigString || "No config")))), hasPipelineDiagramData ? /* @__PURE__ */ React2.createElement("div", { style: { width: "100%", display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#111827" } }, "Pipeline Monitoring"), /* @__PURE__ */ React2.createElement("div", { style: {
    fontSize: 12,
    color: "#4B5563",
    background: "#EFF6FF",
    border: "1px solid #BFDBFE",
    borderRadius: 8,
    padding: 12,
    lineHeight: 1.5
  } }, "Native OpAMP bridge/agent telemetry (reports_own_metrics) is not yet available for discovered collectors. Until upstream support lands, these toggles let you pull CPU, memory, bandwidth, and logs via Grafana data sources instead."), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 12 } }, /* @__PURE__ */ React2.createElement(
    TelemetryToggleCard,
    {
      title: "Metrics overlays",
      description: "Visualize per-pipeline CPU, memory, and throughput via Prometheus or Mimir.",
      enabled: metricsSettings.enabled,
      disabled: telemetryLoading,
      datasourceLabel: metricsDatasourceLabel,
      footerNote: "Applies to both the pipeline cards and the per-stage throughput chips.",
      onToggle: () => onToggleMetrics(!metricsSettings.enabled),
      onConfigure: () => onConfigureTelemetry("metrics")
    }
  ), /* @__PURE__ */ React2.createElement(
    TelemetryToggleCard,
    {
      title: "Log snapshots",
      description: "Use a Loki query template to inspect recent collector logs.",
      enabled: logsSettings.enabled,
      disabled: telemetryLoading,
      datasourceLabel: logsDatasourceLabel,
      footerNote: "Fetches up to 50 log lines from the configured Loki datasource.",
      onToggle: () => onToggleLogs(!logsSettings.enabled),
      onConfigure: () => onConfigureTelemetry("logs")
    }
  )), /* @__PURE__ */ React2.createElement(
    PipelineFlowDiagram,
    {
      config: pipelineConfigString,
      pipelines: monitoringData.pipelines || [],
      telemetry: monitoringData.telemetry || [],
      agentName: monitoringData?.agent?.name || monitoringData?.agent?.agentUid,
      agentUid: monitoringData?.agent?.agentUid,
      orgName: monitoringData?.agent?.orgName,
      metricsSettings,
      onConfigureMetrics: () => onConfigureTelemetry("metrics"),
      agentLabels: monitoringData?.agent?.labels || monitoringData?.agent?.agent?.labels
    }
  ), /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 16 } }, /* @__PURE__ */ React2.createElement(
    LogsPanelView,
    {
      settings: logsSettings,
      enabled: logsSettings.enabled,
      agentUid: monitoringData?.agent?.agentUid,
      agentName: monitoringData?.agent?.name,
      orgName: monitoringData?.agent?.orgName,
      onConfigure: () => onConfigureTelemetry("logs"),
      backendSrv: backendSrv3
    }
  ))) : /* @__PURE__ */ React2.createElement("div", { style: {
    width: "100%",
    padding: 16,
    background: "#FEF3C7",
    borderRadius: 8,
    border: "1px dashed #F59E0B",
    color: "#92400E",
    fontSize: 13
  } }, "No pipeline configuration has been reported by this agent yet. Connect the agent or push a configuration to visualize pipelines here."))), !loading && !selectedAgentUID && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 40,
    textAlign: "center",
    color: "#6B7280",
    background: "#F9FAFB",
    borderRadius: 6
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 48, marginBottom: 12 } }, "\u{1F4CA}"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, marginBottom: 4 } }, "Select an Agent"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14 } }, "Choose an agent from the dropdown above to view monitoring data and metrics."))));
}

// pages/components/TelemetryConfigDrawer.tsx
var React2 = __REACT__.default || __REACT__;

// pages/components/PromQLQueryEditor.tsx

var PromQLQueryEditor = ({
  value,
  onChange,
  placeholder = "Enter PromQL query...",
  height = "200px"
}) => {
  const [useGrafanaEditor, setUseGrafanaEditor] = useState2(false);
  const grafanaEditorRef = useRef2(null);
  useEffect2(() => {
    try {
      const grafanaUI = window.__GRAFANA_UI__ || window.require?.("@grafana/ui");
      if (grafanaUI?.CodeEditor) {
        setUseGrafanaEditor(true);
        grafanaEditorRef.current = grafanaUI.CodeEditor;
      }
    } catch (err) {
    }
  }, []);
  if (useGrafanaEditor && grafanaEditorRef.current) {
    const CodeEditor = grafanaEditorRef.current;
    return /* @__PURE__ */ React2.createElement(
      CodeEditor,
      {
        value: value || "",
        language: "promql",
        height,
        onBlur: (val) => onChange(val),
        onSave: (val) => onChange(val),
        showMiniMap: false,
        showLineNumbers: true
      }
    );
  }
  return /* @__PURE__ */ React2.createElement(
    "textarea",
    {
      value: value || "",
      onChange: (e) => onChange(e.target.value),
      placeholder,
      rows: 8,
      style: {
        width: "100%",
        padding: "8px 12px",
        border: "none",
        outline: "none",
        fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", "Consolas", "source-code-pro", monospace',
        fontSize: "13px",
        lineHeight: "1.6",
        background: "#FFFFFF",
        color: "#1F2937",
        resize: "vertical",
        minHeight: height,
        boxSizing: "border-box"
      },
      spellCheck: false
    }
  );
};

// pages/utils/promql.ts
var IDENT = "[A-Za-z_:][A-Za-z0-9_:]*";
var METRIC_ID = new RegExp(`^${IDENT}$`);
var LABEL_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
function outsideStringPositions(query) {
  const outside = new Array(query.length).fill(true);
  let quote = "";
  let escaped = false;
  for (let i = 0; i < query.length; i++) {
    const char = query[i];
    if (quote) {
      outside[i] = false;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
      outside[i] = false;
    }
  }
  return outside;
}
function metricTokens(query) {
  const trimmedStart = query.search(/\S/);
  const trimmed = query.trim();
  if (trimmedStart >= 0 && METRIC_ID.test(trimmed)) {
    return [{ start: trimmedStart, end: trimmedStart + trimmed.length, name: trimmed }];
  }
  const outside = outsideStringPositions(query);
  const tokens = [];
  const matcher = new RegExp(IDENT, "g");
  let match;
  while ((match = matcher.exec(query)) !== null) {
    const start = match.index;
    if (!outside[start]) continue;
    let after = matcher.lastIndex;
    while (/\s/.test(query[after] || "")) after++;
    if (query[after] !== "{" && query[after] !== "[") continue;
    const prefix = query.slice(0, start);
    if (query[after] === "[" && !/(?:rate|sum)\s*\(\s*(?:(?:rate|sum)\s*\(\s*)?$/.test(prefix)) continue;
    tokens.push({ start, end: matcher.lastIndex, name: match[0] });
  }
  if (tokens.length !== 1 || !isSupportedSingleSelector(query, tokens[0])) return [];
  return tokens;
}
function isSupportedSingleSelector(query, token) {
  const prefix = query.slice(0, token.start);
  const wrappers = prefix.match(/^(\s*)(sum\s*\(\s*)?(rate\s*\(\s*)?$/);
  if (!wrappers) return false;
  const openCount = (wrappers[2] ? 1 : 0) + (wrappers[3] ? 1 : 0);
  let cursor = token.end;
  while (/\s/.test(query[cursor] || "")) cursor++;
  if (query[cursor] === "{") {
    cursor = matchingBrace(query, cursor) + 1;
    if (cursor === 0) return false;
  } else if (openCount === 0 && query[cursor] === "[") {
    return false;
  }
  while (/\s/.test(query[cursor] || "")) cursor++;
  if (query[cursor] === "[") {
    const close = query.indexOf("]", cursor + 1);
    if (close < 0) return false;
    cursor = close + 1;
  }
  const suffix = query.slice(cursor).replace(/\s/g, "");
  return suffix === ")".repeat(openCount);
}
function matchingBrace(query, open) {
  const outside = outsideStringPositions(query);
  let depth = 0;
  for (let i = open; i < query.length; i++) {
    if (!outside[i]) continue;
    if (query[i] === "{") depth++;
    else if (query[i] === "}" && --depth === 0) return i;
  }
  return -1;
}
function insertMetricSuggestion(query, metric) {
  if (!METRIC_ID.test(metric)) return { query, changed: false, hint: "Metric name is not a valid Prometheus identifier." };
  if (!query.trim()) return { query: metric, changed: true };
  const tokens = metricTokens(query);
  if (tokens.length !== 1) return { query, changed: false, hint: "Metric suggestion was not applied because the query is ambiguous." };
  const token = tokens[0];
  return { query: query.slice(0, token.start) + metric + query.slice(token.end), changed: true };
}
function insertLabelMatcher(query, label) {
  if (!LABEL_ID.test(label)) return { query, changed: false, hint: "Label name is not a valid Prometheus identifier." };
  const tokens = metricTokens(query);
  if (tokens.length !== 1) return { query, changed: false, hint: "Label matcher was not added because the query is ambiguous." };
  const token = tokens[0];
  let open = token.end;
  while (/\s/.test(query[open] || "")) open++;
  if (query[open] === "{") {
    const close = matchingBrace(query, open);
    if (close < 0) return { query, changed: false, hint: "Label matcher was not added because the selector is incomplete." };
    const body = query.slice(open + 1, close);
    const exists = new RegExp(`(?:^|,)\\s*${label}\\s*(?:=|!=|=~|!~)`).test(body);
    if (exists) return { query, changed: false, hint: `Selector already contains ${label}.` };
    const separator = body.trim().endsWith(",") ? " " : body.trim() ? ", " : "";
    return { query: query.slice(0, close) + separator + `${label}=""` + query.slice(close), changed: true };
  }
  return { query: query.slice(0, token.end) + `{${label}=""}` + query.slice(token.end), changed: true };
}

// pages/utils/telemetryOrg.ts
function resolveDatasourceOrgId(savedOrgId, currentOrgId) {
  return savedOrgId ?? currentOrgId ?? null;
}
function datasourceOrgSelectValue(savedOrgId, currentOrgId) {
  return savedOrgId == null || savedOrgId === currentOrgId ? "" : String(savedOrgId);
}
function datasourceOrgHeaders(orgId) {
  return orgId == null ? {} : { headers: { "X-Grafana-Org-Id": String(orgId) } };
}
function createRequestEpoch() {
  let epoch = 0;
  return {
    begin: () => ++epoch,
    isCurrent: (requestId) => epoch === requestId,
    invalidate: (requestId) => {
      if (requestId === void 0 || epoch === requestId) epoch++;
    }
  };
}

// pages/components/TelemetryConfigDrawer.tsx
var PROM_DATASOURCE_TYPES = /* @__PURE__ */ new Set(["prometheus", "mimir", "grafana-mimir-datasource", "thanos"]);
var LOKI_DATASOURCE_TYPES = /* @__PURE__ */ new Set(["loki"]);
var STAGE_SUMMARY2 = {
  receivers: { title: "Receivers" },
  processors: { title: "Processors" },
  exporters: { title: "Exporters" }
};
var STAGE_QUERY_HINTS = {
  receivers: "Defaults use otelcol_receiver_accepted_log_records_total and otelcol_receiver_failed_log_records_total filtered by $stage and $pipeline.",
  processors: "Defaults rely on otelcol_processor_incoming_items_total and otelcol_processor_outgoing_items_total per processor.",
  exporters: "Defaults combine otelcol_exporter_sent_log_records_total with otelcol_exporter_send_failed_log_records_total for each exporter."
};
var runtimeMode4 = detectRuntimeMode();
var isRunningInGrafana4 = runtimeMode4 === "grafana";
var grafanaTransport4 = detectGrafanaTransport(isRunningInGrafana4);
var backendSrv4 = createBackendSrv(isRunningInGrafana4, grafanaTransport4);
var { useState: useState2, useEffect: useEffect2, useRef: useRef2 } = React2;
var TelemetryConfigDrawer = ({
  open,
  mode,
  metricsConfig,
  logsConfig,
  currentOrgId,
  orgOptions,
  onMetricsChange,
  onLogsChange,
  onSave,
  onClose,
  saving,
  canSave
}) => {
  const [datasources, setDatasources] = useState2([]);
  const [loading, setLoading] = useState2(false);
  const [error, setError] = useState2(null);
  const [metadataLoading, setMetadataLoading] = useState2(false);
  const [metadataError, setMetadataError] = useState2(null);
  const datasourceRequest = useRef2(createRequestEpoch());
  const metadataRequest = useRef2(createRequestEpoch());
  const effectiveMetricsOrgId = resolveDatasourceOrgId(metricsConfig.datasourceOrgId, currentOrgId);
  const effectiveLogsOrgId = resolveDatasourceOrgId(logsConfig.datasourceOrgId, currentOrgId);
  const [metricNames, setMetricNames] = useState2([]);
  const [labelKeys, setLabelKeys] = useState2([]);
  const [queryHint, setQueryHint] = useState2(null);
  const parseOrgId = (value) => {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  };
  const handleStageQueryChange = (key, field, value) => {
    onMetricsChange({
      ...metricsConfig,
      stageQueries: {
        ...metricsConfig.stageQueries,
        [key]: {
          ...metricsConfig.stageQueries[key],
          [field]: value
        }
      }
    });
  };
  const handleStageReset = (key) => {
    const defaults = buildDefaultStageQueries();
    onMetricsChange({
      ...metricsConfig,
      stageQueries: {
        ...metricsConfig.stageQueries,
        [key]: {
          ...defaults[key]
        }
      }
    });
  };
  const applyMetricSuggestion = (key, metric) => {
    const result = insertMetricSuggestion(metricsConfig.queries[key] || "", metric);
    setQueryHint(result.hint || null);
    if (result.changed) onMetricsChange({ ...metricsConfig, queries: { ...metricsConfig.queries, [key]: result.query } });
  };
  const applyLabelSuggestion = (key, label) => {
    const result = insertLabelMatcher(metricsConfig.queries[key] || "", label);
    setQueryHint(result.hint || null);
    if (result.changed) onMetricsChange({ ...metricsConfig, queries: { ...metricsConfig.queries, [key]: result.query } });
  };
  useEffect2(() => {
    const requestId = datasourceRequest.current.begin();
    setDatasources([]);
    setError(null);
    if (!open) {
      setLoading(false);
      return () => {
        datasourceRequest.current.invalidate(requestId);
      };
    }
    const orgId = mode === "metrics" ? effectiveMetricsOrgId : effectiveLogsOrgId;
    const requestOptions = datasourceOrgHeaders(orgId);
    setLoading(true);
    void (async () => {
      try {
        const response = await backendSrv4.get("/api/datasources", requestOptions);
        if (!datasourceRequest.current.isCurrent(requestId)) return;
        const filtered = Array.isArray(response) ? response.filter((ds) => mode === "metrics" ? PROM_DATASOURCE_TYPES.has(ds.type) : LOKI_DATASOURCE_TYPES.has(ds.type)) : [];
        setDatasources(filtered);
        setError(filtered.length === 0 ? "No compatible data sources were found." : null);
      } catch (err) {
        if (datasourceRequest.current.isCurrent(requestId)) setError(err?.message || "Failed to load data sources.");
      } finally {
        if (datasourceRequest.current.isCurrent(requestId)) setLoading(false);
      }
    })();
    return () => {
      datasourceRequest.current.invalidate(requestId);
    };
  }, [open, mode, effectiveMetricsOrgId, effectiveLogsOrgId]);
  useEffect2(() => {
    const requestId = metadataRequest.current.begin();
    setMetricNames([]);
    setLabelKeys([]);
    setMetadataError(null);
    const dsUid = metricsConfig.datasourceUid;
    const orgId = effectiveMetricsOrgId;
    const ds = datasources.find((item) => item.uid === dsUid);
    if (!open || mode !== "metrics" || !dsUid || !ds) {
      setMetadataLoading(false);
      return () => {
        metadataRequest.current.invalidate(requestId);
      };
    }
    const requestOptions = datasourceOrgHeaders(orgId);
    setMetadataLoading(true);
    void (async () => {
      try {
        const metricResp = await backendSrv4.get(
          `/api/datasources/proxy/${ds.id}/api/v1/label/__name__/values`,
          requestOptions
        );
        const labelsResp = await backendSrv4.get(
          `/api/datasources/proxy/${ds.id}/api/v1/labels`,
          requestOptions
        );
        if (!metadataRequest.current.isCurrent(requestId)) return;
        setMetricNames(Array.isArray(metricResp?.data) ? metricResp.data : []);
        setLabelKeys(Array.isArray(labelsResp?.data) ? labelsResp.data : []);
      } catch (err) {
        if (metadataRequest.current.isCurrent(requestId)) setMetadataError(err?.message || "Failed to load Prometheus metadata.");
      } finally {
        if (metadataRequest.current.isCurrent(requestId)) setMetadataLoading(false);
      }
    })();
    return () => {
      metadataRequest.current.invalidate(requestId);
    };
  }, [open, mode, metricsConfig.datasourceUid, effectiveMetricsOrgId, datasources]);
  if (!open) {
    return null;
  }
  return /* @__PURE__ */ React2.createElement(
    "div",
    {
      style: {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        background: "rgba(15,23,42,0.45)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "flex-end"
      },
      onClick: onClose
    },
    /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          width: 420,
          maxWidth: "100%",
          height: "100%",
          background: "#FFFFFF",
          boxShadow: "-12px 0 24px rgba(15,23,42,0.2)",
          display: "flex",
          flexDirection: "column"
        },
        onClick: (event) => event.stopPropagation()
      },
      /* @__PURE__ */ React2.createElement("div", { style: { padding: 16, borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600 } }, mode === "metrics" ? "Configure metrics overlay" : "Configure log snapshots"), /* @__PURE__ */ React2.createElement(
        "button",
        {
          type: "button",
          onClick: onClose,
          style: { border: "none", background: "transparent", fontSize: 20, cursor: "pointer", lineHeight: 1 },
          "aria-label": "Close telemetry configuration"
        },
        "\xD7"
      )),
      /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 } }, mode === "metrics" ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#475569" } }, "Select a Prometheus/Mimir datasource and adjust the default queries to match your labels. Placeholders like ", /* @__PURE__ */ React2.createElement("code", null, "$collector_uid"), ", ", /* @__PURE__ */ React2.createElement("code", null, "$pipeline"), ", and ", /* @__PURE__ */ React2.createElement("code", null, "$stage"), " are substituted at runtime."), /* @__PURE__ */ React2.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1F2937" } }, "Datasource org", /* @__PURE__ */ React2.createElement(
        "select",
        {
          value: datasourceOrgSelectValue(metricsConfig.datasourceOrgId, currentOrgId),
          onChange: (event) => {
            const newOrgId = parseOrgId(event.target.value);
            console.log(`DEBUG: Org ID changed to ${newOrgId}, resetting datasource`);
            onMetricsChange({
              ...metricsConfig,
              datasourceOrgId: newOrgId,
              datasourceUid: null
              // reset selection when org changes
            });
          },
          style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #CBD5F5", fontSize: 12 }
        },
        /* @__PURE__ */ React2.createElement("option", { value: "" }, "Current org", currentOrgId ? ` (#${currentOrgId})` : ""),
        orgOptions.filter((o) => o.id !== currentOrgId).map((org) => /* @__PURE__ */ React2.createElement("option", { key: org.id, value: org.id }, org.name || `Org ${org.id}`, " (#", org.id, ")"))
      ), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "Pick another Grafana org to discover datasources there (requires access).")), /* @__PURE__ */ React2.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1F2937" } }, "Data source", loading ? /* @__PURE__ */ React2.createElement("div", { style: { padding: "6px 10px", fontSize: 12, color: "#6B7280", background: "#F9FAFB", borderRadius: 6 } }, "Loading datasources...") : error ? /* @__PURE__ */ React2.createElement("div", { style: { padding: "6px 10px", fontSize: 12, color: "#DC2626", background: "#FEE2E2", borderRadius: 6 } }, error) : /* @__PURE__ */ React2.createElement(
        "select",
        {
          value: metricsConfig.datasourceUid ?? "",
          onChange: (event) => {
            console.log(`DEBUG: Datasource changed to ${event.target.value}`);
            onMetricsChange({
              ...metricsConfig,
              datasourceUid: event.target.value || null
            });
          },
          disabled: datasources.length === 0,
          style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #CBD5F5", fontSize: 12 }
        },
        /* @__PURE__ */ React2.createElement("option", { value: "" }, "Select datasource (", datasources.length, " available)"),
        datasources.map((ds) => /* @__PURE__ */ React2.createElement("option", { key: ds.uid, value: ds.uid }, ds.name, " (", ds.type, ")"))
      ), effectiveMetricsOrgId && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "Loading datasources from org ", effectiveMetricsOrgId)), Object.keys(metricsConfig.queries).map((key) => /* @__PURE__ */ React2.createElement("div", { key, style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1F2937" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600 } }, key.toUpperCase(), " query"), /* @__PURE__ */ React2.createElement("div", { style: { position: "relative", border: "1px solid #CBD5F5", borderRadius: 6, overflow: "hidden", background: "#FFFFFF" } }, /* @__PURE__ */ React2.createElement(
        PromQLQueryEditor,
        {
          value: metricsConfig.queries[key] || "",
          onChange: (newValue) => (setQueryHint(null), onMetricsChange({
            ...metricsConfig,
            queries: { ...metricsConfig.queries, [key]: newValue }
          })),
          placeholder: "Enter PromQL query...",
          height: "200px"
        }
      )), mode === "metrics" && metricNames.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11, color: "#475569" } }, metricNames.slice(0, 12).map((name) => /* @__PURE__ */ React2.createElement(
        "button",
        {
          key: name,
          type: "button",
          onClick: () => applyMetricSuggestion(key, name),
          style: {
            border: "1px solid #CBD5F5",
            borderRadius: 4,
            padding: "2px 6px",
            background: "#F8FAFC",
            cursor: "pointer"
          }
        },
        name
      )), labelKeys.slice(0, 8).map((lbl) => /* @__PURE__ */ React2.createElement(
        "button",
        {
          key: lbl,
          type: "button",
          onClick: () => applyLabelSuggestion(key, lbl),
          style: {
            border: "1px solid #E5E7EB",
            borderRadius: 4,
            padding: "2px 6px",
            background: "#FFFFFF",
            cursor: "pointer"
          }
        },
        lbl
      ))), queryHint && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#92400E" } }, queryHint))), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#111827", marginTop: 4 } }, "Per-stage throughput templates"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#475569", lineHeight: 1.5 } }, "These queries power the inbound/outbound chips for each receiver, processor, and exporter. Use placeholders such as ", /* @__PURE__ */ React2.createElement("code", null, "$collector_uid"), ", ", /* @__PURE__ */ React2.createElement("code", null, "$pipeline"), ", and ", /* @__PURE__ */ React2.createElement("code", null, "$stage"), " to interpolate the active component names."), STAGE_KEYS.map((key) => /* @__PURE__ */ React2.createElement("div", { key: `stage-query-${key}`, style: { border: "1px solid #E5E7EB", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#111827" } }, STAGE_SUMMARY2[key].title), /* @__PURE__ */ React2.createElement(
        "button",
        {
          type: "button",
          onClick: () => handleStageReset(key),
          style: { padding: "4px 8px", borderRadius: 4, border: "1px solid #CBD5F5", background: "#FFFFFF", fontSize: 11, cursor: "pointer" }
        },
        "Reset to defaults"
      )), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280" } }, STAGE_QUERY_HINTS[key]), /* @__PURE__ */ React2.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1F2937" } }, "Inbound query", /* @__PURE__ */ React2.createElement(
        "textarea",
        {
          value: metricsConfig.stageQueries[key].inbound,
          rows: 4,
          onChange: (event) => handleStageQueryChange(key, "inbound", event.target.value),
          style: { borderRadius: 6, border: "1px solid #CBD5F5", fontFamily: "monospace", fontSize: 12, padding: 8 }
        }
      )), /* @__PURE__ */ React2.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1F2937" } }, "Outbound query", /* @__PURE__ */ React2.createElement(
        "textarea",
        {
          value: metricsConfig.stageQueries[key].outbound,
          rows: 4,
          onChange: (event) => handleStageQueryChange(key, "outbound", event.target.value),
          style: { borderRadius: 6, border: "1px solid #CBD5F5", fontFamily: "monospace", fontSize: 12, padding: 8 }
        }
      ))))) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#475569" } }, "Provide a Loki query template and adjust its labels to your environment. Supported placeholders: ", /* @__PURE__ */ React2.createElement("code", null, "$collector_uid"), ", ", /* @__PURE__ */ React2.createElement("code", null, "$collector_name"), ", ", /* @__PURE__ */ React2.createElement("code", null, "$org_name"), "."), /* @__PURE__ */ React2.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1F2937" } }, "Datasource org", /* @__PURE__ */ React2.createElement(
        "select",
        {
          value: datasourceOrgSelectValue(logsConfig.datasourceOrgId, currentOrgId),
          onChange: (event) => onLogsChange({
            ...logsConfig,
            datasourceOrgId: parseOrgId(event.target.value),
            datasourceUid: null
            // reset selection when org changes
          }),
          style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #CBD5F5", fontSize: 12 }
        },
        /* @__PURE__ */ React2.createElement("option", { value: "" }, "Current org", currentOrgId ? ` (#${currentOrgId})` : ""),
        orgOptions.filter((o) => o.id !== currentOrgId).map((org) => /* @__PURE__ */ React2.createElement("option", { key: org.id, value: org.id }, org.name || `Org ${org.id}`, " (#", org.id, ")"))
      ), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "Set this when the Loki datasource you need lives in another Grafana org.")), /* @__PURE__ */ React2.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1F2937" } }, "Loki data source", /* @__PURE__ */ React2.createElement(
        "select",
        {
          value: logsConfig.datasourceUid ?? "",
          onChange: (event) => onLogsChange({
            ...logsConfig,
            datasourceUid: event.target.value || null
          }),
          disabled: loading || datasources.length === 0,
          style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #CBD5F5", fontSize: 12 }
        },
        /* @__PURE__ */ React2.createElement("option", { value: "" }, "Select datasource"),
        datasources.map((ds) => /* @__PURE__ */ React2.createElement("option", { key: ds.uid, value: ds.uid }, ds.name, " (", ds.type, ")"))
      )), /* @__PURE__ */ React2.createElement("label", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#1F2937" } }, "Loki query template", /* @__PURE__ */ React2.createElement(
        "textarea",
        {
          value: logsConfig.query,
          rows: 6,
          onChange: (event) => onLogsChange({ ...logsConfig, query: event.target.value }),
          style: { borderRadius: 6, border: "1px solid #CBD5F5", fontFamily: "monospace", fontSize: 12, padding: 8 }
        }
      ))), error && /* @__PURE__ */ React2.createElement("div", { style: { padding: 10, borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", fontSize: 12, color: "#B91C1C" } }, error), metadataLoading && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280" } }, "Loading Prometheus metrics and labels\u2026"), metadataError && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#B91C1C" } }, metadataError)),
      /* @__PURE__ */ React2.createElement("div", { style: { padding: 16, borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end", gap: 8 } }, /* @__PURE__ */ React2.createElement(
        "button",
        {
          type: "button",
          onClick: onClose,
          style: { padding: "8px 16px", borderRadius: 6, border: "1px solid #CBD5F5", background: "#FFFFFF", cursor: "pointer" }
        },
        "Cancel"
      ), /* @__PURE__ */ React2.createElement(
        "button",
        {
          type: "button",
          onClick: () => onSave(mode),
          disabled: saving || !canSave,
          style: { padding: "8px 16px", borderRadius: 6, border: "none", background: saving || !canSave ? "#A5B4FC" : "#4F46E5", color: "#FFFFFF", cursor: saving || !canSave ? "not-allowed" : "pointer" }
        },
        saving ? "Saving\u2026" : canSave ? "Save" : "View only"
      ))
    )
  );
};

// pages/components/ConfigGenerator.tsx
var React2 = __REACT__.default || __REACT__;

// pages/utils/components.ts
var builtinReceiverTemplates = [
  {
    value: "otlp",
    label: "OTLP (gRPC + HTTP)",
    description: "Default OpenTelemetry receiver with gRPC (4317) and HTTP (4318) endpoints.",
    isSystem: true,
    isCustom: false,
    config: {
      protocols: {
        grpc: { endpoint: "0.0.0.0:4317" },
        http: { endpoint: "0.0.0.0:4318" }
      }
    }
  },
  {
    value: "prometheus",
    label: "Prometheus Scraper",
    description: "Scrape metrics from Prometheus targets on port 9090 every 30s.",
    isSystem: true,
    isCustom: false,
    config: {
      config: {
        scrape_configs: [
          {
            job_name: "otel-collector",
            scrape_interval: "30s",
            static_configs: [{ targets: ["0.0.0.0:9090"] }]
          }
        ]
      }
    }
  }
];
var builtinProcessorTemplates = [
  {
    value: "batch",
    label: "Batch",
    description: "Recommended batch processor with sane defaults.",
    isSystem: true,
    isCustom: false,
    config: {
      send_batch_size: 8192,
      timeout: "10s"
    }
  },
  {
    value: "memory_limiter",
    label: "Memory Limiter",
    description: "Prevents the collector from running out of memory.",
    isSystem: true,
    isCustom: false,
    config: {
      check_interval: "2s",
      limit_percentage: 75,
      spike_limit_percentage: 15
    }
  }
];
var builtinExporterTemplates = [
  {
    value: "otlp",
    label: "OTLP (HTTP)",
    description: "Send data to an upstream OTLP endpoint over HTTP.",
    isSystem: true,
    isCustom: false,
    config: {
      endpoint: "http://localhost:4318"
    }
  },
  {
    value: "debug",
    label: "Debug (logging)",
    description: "Log telemetry payloads for troubleshooting.",
    isSystem: true,
    isCustom: false,
    config: {
      verbosity: "basic"
    }
  }
];
var customComponentOption = {
  value: "custom",
  label: "Custom (YAML)",
  config: {},
  isSystem: false,
  isCustom: true
};
var mergeComponentTypeLists = (fetched, fallback) => {
  const merged = /* @__PURE__ */ new Map();
  [...fetched || [], ...fallback || []].forEach((item) => {
    if (!item) {
      return;
    }
    const key = item.value || item.type;
    if (!key) {
      return;
    }
    if (!merged.has(key)) {
      merged.set(key, {
        ...item,
        value: key,
        label: item.label || item.displayLabel || key,
        config: item.config || {}
      });
    }
  });
  const result = Array.from(merged.values());
  if (!result.some((t) => t.value === "custom")) {
    result.push({ ...customComponentOption });
  }
  return result;
};
var deriveComponentTypeFromName = (name) => {
  if (!name) {
    return null;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }
  const [base] = trimmed.split(/[/:]/, 1);
  return base?.trim() || null;
};
var formatComponentLabel = (value) => {
  if (!value) {
    return "Custom";
  }
  const cleaned = value.replace(/\//g, " / ");
  return cleaned.split(/[\s_-]+/).filter(Boolean).map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" ");
};
var cloneSampleConfig = (config) => {
  if (!config || typeof config !== "object") {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(config));
  } catch {
    return { ...config };
  }
};
var inferReceiverTypeByStructure = (config) => {
  if (!config || typeof config !== "object") {
    return null;
  }
  const protocols = config.protocols || {};
  if (protocols.thrift_http || protocols.thrift_compact || protocols.thrift_binary) {
    return "jaeger";
  }
  if (protocols.kafka || config.kafka) {
    return "kafka";
  }
  if (protocols.grpc && protocols.http) {
    return "otlp";
  }
  if (protocols.grpc && !protocols.http && !protocols.thrift_http && !protocols.thrift_compact) {
    return "otlp";
  }
  if (config.scrape_configs || config.config?.scrape_configs) {
    return "prometheus";
  }
  if (Array.isArray(config.include) || Array.isArray(config.exclude) || config.include || config.exclude) {
    return "filelog";
  }
  if (config.endpoint && String(config.endpoint).includes("9411")) {
    return "zipkin";
  }
  if (config.endpoint && String(config.endpoint).includes("14250")) {
    return "jaeger";
  }
  if (config.endpoint && String(config.endpoint).includes("12347")) {
    return "faro";
  }
  return null;
};
var inferProcessorTypeByStructure = (config) => {
  if (!config || typeof config !== "object") {
    return null;
  }
  if (config.send_batch_size !== void 0 || config.send_batch_max_size !== void 0 || config.timeout !== void 0) {
    return "batch";
  }
  if (config.limit_mib !== void 0 || config.memory_limit_mib !== void 0 || config.spike_limit_mib !== void 0 || config.check_interval !== void 0) {
    return "memory_limiter";
  }
  if (config.actions !== void 0) {
    return "attributes";
  }
  if (config.include || config.exclude) {
    return "filter";
  }
  return null;
};
var inferExporterTypeByStructure = (config) => {
  if (!config || typeof config !== "object") {
    return null;
  }
  if (config.endpoint) {
    const endpoint = String(config.endpoint);
    if (/4317|4318/.test(endpoint) || endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
      return "otlp";
    }
    if (endpoint.includes("9411")) {
      return "zipkin";
    }
    if (endpoint.includes("14250")) {
      return "jaeger";
    }
  }
  if (config.loglevel !== void 0 || config.verbosity !== void 0) {
    return "debug";
  }
  if (config.prometheusremotewrite || config.namespace || config.collectd) {
    return "prometheus";
  }
  return null;
};
var inferComponentType = (category, name, config) => {
  let structural = null;
  if (category === "receiver") {
    structural = inferReceiverTypeByStructure(config);
  } else if (category === "processor") {
    structural = inferProcessorTypeByStructure(config);
  } else if (category === "exporter") {
    structural = inferExporterTypeByStructure(config);
  }
  if (structural) {
    return structural;
  }
  const fromName = deriveComponentTypeFromName(name);
  if (fromName) {
    return fromName;
  }
  return "custom";
};

// pages/components/ConfigGenerator.tsx
var { useState: useState2, useEffect: useEffect2, useMemo: useMemo2, useCallback: useCallback2 } = React2;
function ConfigGenerator({
  agents,
  bridges,
  onPushConfig,
  backendSrv: backendSrv6
}) {
  const [receivers, setReceivers] = useState2([]);
  const [processors, setProcessors] = useState2([]);
  const [exporters, setExporters] = useState2([]);
  const [generatedConfig, setGeneratedConfig] = useState2("");
  const [selectedAgentUID, setSelectedAgentUID] = useState2("");
  const [savedTemplates, setSavedTemplates] = useState2([]);
  const [showSaveDialog, setShowSaveDialog] = useState2(false);
  const [saveName, setSaveName] = useState2("");
  const [saveDescription, setSaveDescription] = useState2("");
  const [expandedComponents, setExpandedComponents] = useState2(/* @__PURE__ */ new Set());
  const [expandedGroups, setExpandedGroups] = useState2(/* @__PURE__ */ new Set());
  const [deletingTemplateId, setDeletingTemplateId] = useState2(null);
  const [configVersions, setConfigVersions] = useState2([]);
  const [configSyncStatus, setConfigSyncStatus] = useState2({});
  const [selectedConfigVersion, setSelectedConfigVersion] = useState2(null);
  const [showDiff, setShowDiff] = useState2(false);
  const [diffData, setDiffData] = useState2(null);
  const [showFullDiff, setShowFullDiff] = useState2(false);
  const [isAdmin, setIsAdmin] = useState2(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState2(false);
  const [approvalAction, setApprovalAction] = useState2(null);
  const [approvalConfigId, setApprovalConfigId] = useState2(null);
  const [approvalComment, setApprovalComment] = useState2("");
  const [showComponentTypeManager, setShowComponentTypeManager] = useState2(false);
  const [editingComponentType, setEditingComponentType] = useState2(null);
  const [receiverTypes, setReceiverTypes] = useState2([]);
  const [processorTypes, setProcessorTypes] = useState2([]);
  const [exporterTypes, setExporterTypes] = useState2([]);
  const registerDiscoveredTypes = useCallback2(
    (category, discovered) => {
      if (!discovered || discovered.length === 0) {
        return;
      }
      const setter = category === "receiver" ? setReceiverTypes : category === "processor" ? setProcessorTypes : setExporterTypes;
      setter((prev = []) => {
        const existing = new Set(prev.map((opt) => opt.value));
        let mutated = false;
        const next = [...prev];
        for (const entry of discovered) {
          const normalized = entry.type?.trim();
          if (!normalized || normalized === "custom" || existing.has(normalized)) {
            continue;
          }
          existing.add(normalized);
          mutated = true;
          next.push({
            value: normalized,
            label: formatComponentLabel(normalized),
            config: cloneSampleConfig(entry.sample || {}),
            isSystem: false,
            isCustom: true,
            isDiscovered: true
          });
        }
        return mutated ? next : prev;
      });
    },
    [setReceiverTypes, setProcessorTypes, setExporterTypes]
  );
  const [useRawYAML, setUseRawYAML] = useState2(false);
  const [rawYAMLConfig, setRawYAMLConfig] = useState2("");
  const [includeDeploymentSettings, setIncludeDeploymentSettings] = useState2(false);
  const [selectedSignals, setSelectedSignals] = useState2({
    logs: true,
    metrics: true,
    traces: true
  });
  const [showCRDSettings, setShowCRDSettings] = useState2(false);
  const [crdSettings, setCrdSettings] = useState2({
    name: "",
    // Optional: for creating NEW collectors
    namespace: "",
    // Optional: for creating NEW collectors
    mode: "deployment",
    replicas: 1,
    image: "otel/opentelemetry-collector-contrib:latest",
    managementState: "managed",
    upgradeStrategy: "automatic",
    resources: {
      requests: {
        cpu: "200m",
        memory: "256Mi"
      },
      limits: {
        cpu: "1000m",
        memory: "1Gi"
      }
    },
    advancedYaml: ""
    // For custom fields: targetAllocator, volumes, serviceAccount, etc.
  });
  useEffect2(() => {
    setIncludeDeploymentSettings(false);
  }, [selectedAgentUID]);
  useEffect2(() => {
    loadTemplates();
    fetchUserRole();
  }, []);
  const fetchUserRole = async () => {
    try {
      try {
        const roleResponse = await backendSrv6.get("/api/plugins/otel-collector-agent-fleet-management/resources/user-role");
        const isAdminValue = roleResponse.isAdmin === true || roleResponse.isAdmin === "true" || roleResponse.role === "RoleAdmin" || roleResponse.role === "Admin" || roleResponse.role === 2 || roleResponse.isAdmin === 1;
        setIsAdmin(isAdminValue);
        console.log("User role detected:", { isAdmin: isAdminValue, role: roleResponse.role, isAdminRaw: roleResponse.isAdmin });
        if (!isAdminValue) {
          console.warn("Admin role not detected, but allowing approvals for testing purposes");
        }
        return;
      } catch (e) {
        console.error("Failed to fetch user role from dedicated endpoint:", e);
        const response = await backendSrv6.get("/api/plugins/otel-collector-agent-fleet-management/resources/agents");
        if (response.userRole) {
          const isAdminValue = response.userRole.isAdmin === true || response.userRole.isAdmin === "true" || response.userRole.role === "RoleAdmin" || response.userRole.role === "Admin" || response.userRole.role === 2 || response.userRole.isAdmin === 1;
          setIsAdmin(isAdminValue);
          console.log("User role from agents endpoint:", { isAdmin: isAdminValue, role: response.userRole.role });
        } else {
          console.warn("User role not found in response, defaulting to admin for testing purposes");
          setIsAdmin(true);
        }
      }
    } catch (err) {
      console.error("Failed to fetch user role:", err);
      console.warn("Defaulting to admin mode for testing purposes");
      setIsAdmin(true);
    }
  };
  useEffect2(() => {
    if (selectedAgentUID) {
      loadConfigVersions(selectedAgentUID);
      loadCurrentConfig(selectedAgentUID);
    } else {
      setReceivers([]);
      setProcessors([]);
      setExporters([]);
      setGeneratedConfig("");
    }
  }, [selectedAgentUID]);
  const loadTemplates = async () => {
    try {
      const response = await backendSrv6.get("/api/plugins/otel-collector-agent-fleet-management/resources/config-templates");
      setSavedTemplates(response.items || []);
    } catch (err) {
      console.error("Failed to load templates:", err);
    }
  };
  const loadConfigVersions = async (agentUID) => {
    if (!agentUID || agentUID.trim() === "") {
      console.warn("loadConfigVersions called without agentUID, clearing versions");
      setConfigVersions([]);
      setConfigSyncStatus({});
      return;
    }
    try {
      const response = await backendSrv6.get(`/api/plugins/otel-collector-agent-fleet-management/resources/configs?agent_uid=${encodeURIComponent(agentUID)}`);
      const filteredConfigs = (response.items || []).filter((cfg) => cfg.agentUid === agentUID);
      console.log(`Loaded ${filteredConfigs.length} config versions for agent ${agentUID}`);
      setConfigVersions(filteredConfigs);
      const pushedConfigs = filteredConfigs.filter((cfg) => cfg.pushedAt);
      const syncStatusMap = {};
      for (const cfg of pushedConfigs) {
        try {
          const syncResp = await backendSrv6.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/config-sync-status`);
          syncStatusMap[cfg.id] = syncResp;
        } catch (err) {
          console.log("Could not load sync status for config", cfg.id, err);
        }
      }
      if (Object.keys(syncStatusMap).length > 0) {
        setConfigSyncStatus(syncStatusMap);
      }
    } catch (err) {
      console.error("Failed to load config versions for agent", agentUID, err);
      setConfigVersions([]);
      setConfigSyncStatus({});
    }
  };
  useEffect2(() => {
    if (!selectedAgentUID) return;
    const selectedIsBridge = bridges.some((b) => b.agentUid === selectedAgentUID);
    if (selectedIsBridge) {
      setSelectedAgentUID("");
    }
  }, [selectedAgentUID, bridges]);
  useEffect2(() => {
    if (!selectedAgentUID) return;
    const pushedConfigs = configVersions.filter((v) => v.pushedAt);
    if (pushedConfigs.length === 0) return;
    const checkSync = async () => {
      for (const cfg of pushedConfigs) {
        try {
          const syncResp = await backendSrv6.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${selectedAgentUID}/config-sync-status`);
          setConfigSyncStatus((prev) => ({ ...prev, [cfg.id]: syncResp }));
        } catch (err) {
          console.log("Could not check sync status for config", cfg.id, err);
        }
      }
    };
    checkSync();
    const interval = setInterval(checkSync, 5e3);
    return () => clearInterval(interval);
  }, [selectedAgentUID, configVersions, backendSrv6]);
  const loadCurrentConfig = async (agentUID) => {
    try {
      const response = await backendSrv6.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/current-config`);
      if (response.hasConfig && response.config) {
        parseConfigYAML(response.config);
        alert("\u2713 Successfully loaded and parsed current configuration from agent!");
      } else {
        alert("\u26A0 Agent does not have a current configuration yet.");
      }
    } catch (err) {
      console.error("Failed to load current config:", err);
      alert("Failed to load current config: " + (err.message || "Unknown error"));
    }
  };
  const parseConfigYAML = (yamlConfig) => {
    try {
      const parsed = load(yamlConfig);
      const discoveredReceiverSamples = {};
      const discoveredProcessorSamples = {};
      const discoveredExporterSamples = {};
      const parsedReceivers = [];
      if (parsed.receivers && typeof parsed.receivers === "object") {
        for (const [name, config] of Object.entries(parsed.receivers)) {
          const recConfig = config;
          const recType = inferComponentType("receiver", name, recConfig);
          if (recType !== "custom" && !discoveredReceiverSamples[recType]) {
            discoveredReceiverSamples[recType] = recConfig;
          }
          parsedReceivers.push({
            name,
            type: recType,
            ...recConfig,
            // If type is custom, store original as customYaml
            ...recType === "custom" ? { customYaml: dump({ [name]: recConfig }) } : {}
          });
        }
      }
      const parsedProcessors = [];
      if (parsed.processors && typeof parsed.processors === "object") {
        for (const [name, config] of Object.entries(parsed.processors)) {
          const procConfig = config;
          const procType = inferComponentType("processor", name, procConfig) || "custom";
          if (procType !== "custom" && !discoveredProcessorSamples[procType]) {
            discoveredProcessorSamples[procType] = procConfig;
          }
          parsedProcessors.push({
            name,
            type: procType,
            ...procConfig,
            ...procType === "custom" ? { customYaml: dump({ [name]: procConfig }) } : {}
          });
        }
      }
      const parsedExporters = [];
      if (parsed.exporters && typeof parsed.exporters === "object") {
        for (const [name, config] of Object.entries(parsed.exporters)) {
          const expConfig = config;
          const expType = inferComponentType("exporter", name, expConfig);
          if (expType !== "custom" && !discoveredExporterSamples[expType]) {
            discoveredExporterSamples[expType] = expConfig;
          }
          parsedExporters.push({
            name,
            type: expType,
            ...expConfig,
            ...expType === "custom" ? { customYaml: dump({ [name]: expConfig }) } : {}
          });
        }
      }
      const customSections = [];
      for (const [key, value] of Object.entries(parsed)) {
        if (!["receivers", "processors", "exporters", "service"].includes(key)) {
          customSections.push({
            name: key,
            type: "custom",
            section: key,
            customYaml: dump({ [key]: value })
          });
        }
      }
      setReceivers(parsedReceivers);
      setProcessors(parsedProcessors);
      setExporters(parsedExporters);
      registerDiscoveredTypes(
        "receiver",
        Object.entries(discoveredReceiverSamples).map(([type2, sample]) => ({ type: type2, sample }))
      );
      registerDiscoveredTypes(
        "processor",
        Object.entries(discoveredProcessorSamples).map(([type2, sample]) => ({ type: type2, sample }))
      );
      registerDiscoveredTypes(
        "exporter",
        Object.entries(discoveredExporterSamples).map(([type2, sample]) => ({ type: type2, sample }))
      );
      const allKeys = /* @__PURE__ */ new Set();
      parsedReceivers.forEach((_, i) => allKeys.add(`receiver-${i}`));
      parsedProcessors.forEach((_, i) => allKeys.add(`processor-${i}`));
      parsedExporters.forEach((_, i) => allKeys.add(`exporter-${i}`));
      if (customSections.length > 0) {
        const customComponents = customSections.map((cs) => ({
          name: `custom_${cs.section}`,
          type: "custom",
          customYaml: dump({ [cs.section]: parsed[cs.section] }),
          _isExtension: true,
          _sectionName: cs.section
        }));
        setExporters([...parsedExporters, ...customComponents]);
        const customKeys = customComponents.map((_, i) => `exporter-${parsedExporters.length + i}`);
        customKeys.forEach((key) => allKeys.add(key));
      }
      const signalsInConfig = {
        logs: false,
        metrics: false,
        traces: false
      };
      if (parsed.service?.pipelines) {
        const pipelines = parsed.service.pipelines;
        if (pipelines.logs) signalsInConfig.logs = true;
        if (pipelines.metrics) signalsInConfig.metrics = true;
        if (pipelines.traces) signalsInConfig.traces = true;
      }
      setSelectedSignals(signalsInConfig);
      setGeneratedConfig(yamlConfig);
      setRawYAMLConfig(yamlConfig);
      setExpandedComponents(allKeys);
      return true;
    } catch (err) {
      console.error("Failed to parse config YAML:", err);
      alert("Failed to parse current configuration: " + (err.message || "Unknown error"));
      return false;
    }
  };
  const loadConfigDiff = async (configId, compareId) => {
    if (!configId || configId === "undefined" || configId === "null") {
      alert("Invalid config ID for diff operation");
      return;
    }
    if (!selectedAgentUID) {
      alert("Please select an agent first");
      return;
    }
    try {
      const url = `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${selectedAgentUID}/config-diff?config_id=${configId}`;
      console.log("Loading diff for config:", configId, "against baseline, URL:", url);
      const response = await backendSrv6.get(url);
      setDiffData(response);
      setShowFullDiff(false);
      setShowDiff(true);
    } catch (err) {
      const errMsg = err.data?.message || err.message || err.statusText || "Unknown error";
      console.error("Failed to load diff:", err, "configId:", configId);
      if (errMsg.includes("not found") || errMsg.includes("404")) {
        alert("Failed to load diff: Configuration not found. This might be the first version with nothing to compare against.");
      } else if (errMsg.includes("invalid config ID")) {
        alert("Failed to load diff: Invalid config ID. Please refresh the page and try again.");
      } else {
        alert("Failed to load diff: " + errMsg + "\n\nIf this is the first version, there is no baseline to compare against.");
      }
    }
  };
  const handleApprovalClick = (configId, action) => {
    setApprovalAction(action);
    setApprovalConfigId(configId);
    setApprovalComment("");
    setShowApprovalDialog(true);
  };
  const approveConfig = async () => {
    if (!approvalConfigId || !approvalAction) return;
    const actionText = approvalAction === "approve" ? "approve" : "reject";
    const commentRequired = approvalAction === "reject";
    if (commentRequired && !approvalComment.trim()) {
      alert("Please provide a comment explaining why you are rejecting this configuration.");
      return;
    }
    try {
      const response = await backendSrv6.post(`/api/plugins/otel-collector-agent-fleet-management/resources/configs/${approvalConfigId}/approve`, {
        action: approvalAction,
        comment: approvalComment.trim() || null
      });
      if (selectedAgentUID) {
        await loadConfigVersions(selectedAgentUID);
      }
      setShowApprovalDialog(false);
      setApprovalAction(null);
      setApprovalConfigId(null);
      setApprovalComment("");
      alert(`\u2705 Configuration ${actionText}d successfully!`);
    } catch (err) {
      const errMsg = err.data?.message || err.message || err.statusText || "Unknown error";
      console.error(`Failed to ${actionText} config:`, err);
      if (errMsg.includes("forbidden") || errMsg.includes("insufficient role")) {
        alert(`\u274C Failed to ${actionText} config: Permission denied. The backend may require admin role.

Error: ${errMsg}

Note: Check backend logs and ensure the approval handler allows testing mode.`);
      } else {
        alert(`\u274C Failed to ${actionText} config: ${errMsg}`);
      }
    }
  };
  const revertConfig = async (configId) => {
    if (!configId || isNaN(configId)) {
      alert("Invalid config ID for revert operation");
      return;
    }
    if (!confirm("Are you sure you want to revert to this configuration version? This will create a new version.")) return;
    try {
      const response = await backendSrv6.post("/api/plugins/otel-collector-agent-fleet-management/resources/configs/revert", {
        configId: Number(configId)
      });
      if (selectedAgentUID) {
        await loadConfigVersions(selectedAgentUID);
      }
      alert("\u2705 Configuration reverted successfully! A new version has been created with pending approval.");
    } catch (err) {
      const errMsg = err.data?.message || err.message || err.statusText || "Unknown error";
      console.error("Failed to revert config:", err, "configId:", configId);
      alert("\u274C Failed to revert config: " + errMsg);
    }
  };
  const saveTemplate = async () => {
    if (!saveName.trim()) {
      alert("Please enter a name for the template");
      return;
    }
    try {
      await backendSrv6.post("/api/plugins/otel-collector-agent-fleet-management/resources/config-templates", {
        name: saveName,
        description: saveDescription,
        receivers,
        processors,
        exporters
      });
      setShowSaveDialog(false);
      setSaveName("");
      setSaveDescription("");
      await loadTemplates();
      alert("Template saved successfully!");
    } catch (err) {
      alert("Failed to save template: " + (err.message || "Unknown error"));
    }
  };
  const loadTemplate = (template) => {
    setReceivers(template.receivers || []);
    setProcessors(template.processors || []);
    setExporters(template.exporters || []);
    setGeneratedConfig("");
    setExpandedComponents(/* @__PURE__ */ new Set());
  };
  const deleteTemplate = async (id) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    setDeletingTemplateId(id);
    try {
      await backendSrv6.request({
        url: `/api/plugins/otel-collector-agent-fleet-management/resources/config-templates?id=${id}`,
        method: "DELETE"
      });
      await loadTemplates();
    } catch (err) {
      alert("Failed to delete template: " + (err.message || "Unknown error"));
    } finally {
      setDeletingTemplateId(null);
    }
  };
  const getComponentSignals = (component, componentType) => {
    const type2 = component.type || "";
    const name = component.name || "";
    if (type2 === "custom" || !type2) {
      return ["logs", "metrics", "traces"];
    }
    if (componentType === "receiver") {
      const receiverSignalMap = {
        "filelog": ["logs"],
        "hostmetrics": ["metrics"],
        "prometheus": ["metrics"],
        "kubeletstats": ["metrics"],
        "jmx": ["metrics"],
        "otlp": ["logs", "metrics", "traces"],
        "jaeger": ["traces"],
        "zipkin": ["traces"],
        "kafka": ["logs", "metrics", "traces"],
        "syslog": ["logs"],
        "journald": ["logs"],
        "fluentforward": ["logs"],
        "carbon": ["metrics"],
        "collectd": ["metrics"],
        "statsd": ["metrics"],
        "opencensus": ["metrics", "traces"],
        "signalfx": ["metrics"],
        "wavefront": ["metrics"],
        "splunk_hec": ["logs", "metrics", "traces"]
      };
      return receiverSignalMap[type2] || ["logs", "metrics", "traces"];
    }
    if (componentType === "processor") {
      const processorSignalMap = {
        "cumulativetodelta": ["metrics"],
        "deltatorate": ["metrics"],
        "probabilistic_sampler": ["traces"],
        "servicegraph": ["traces"],
        "span": ["traces"],
        "tail_sampling": ["traces"],
        "batch": ["logs", "metrics", "traces"],
        "attributes": ["logs", "metrics", "traces"],
        "resource": ["logs", "metrics", "traces"],
        "memory_limiter": ["logs", "metrics", "traces"],
        "filter": ["logs", "metrics", "traces"],
        "transform": ["logs", "metrics", "traces"],
        "groupbytrace": ["traces"],
        "k8sattributes": ["logs", "metrics", "traces"],
        "metricstransform": ["metrics"],
        "routing": ["logs", "metrics", "traces"],
        "spanmetrics": ["traces"]
      };
      return processorSignalMap[type2] || ["logs", "metrics", "traces"];
    }
    if (componentType === "exporter") {
      const exporterSignalMap = {
        "elasticsearch": ["logs", "metrics"],
        // Primarily logs, but can do metrics
        "splunk_hec": ["logs", "metrics", "traces"],
        "kafka": ["logs", "metrics", "traces"],
        "otlp": ["logs", "metrics", "traces"],
        "logging": ["logs", "metrics", "traces"],
        "debug": ["logs", "metrics", "traces"],
        "prometheus": ["metrics"],
        "prometheusremotewrite": ["metrics"],
        "datadog": ["logs", "metrics", "traces"],
        "dynatrace": ["logs", "metrics", "traces"],
        "newrelic": ["logs", "metrics", "traces"],
        "signalfx": ["metrics"],
        "wavefront": ["metrics"],
        "jaeger": ["traces"],
        "zipkin": ["traces"],
        "opencensus": ["metrics", "traces"],
        "carbon": ["metrics"],
        "sapm": ["traces"]
      };
      return exporterSignalMap[type2] || ["logs", "metrics", "traces"];
    }
    return ["logs", "metrics", "traces"];
  };
  const getAvailableSignals = () => {
    if (receivers.length === 0 && processors.length === 0 && exporters.length === 0) {
      return { logs: true, metrics: true, traces: true };
    }
    const receiverSignals = receivers.length > 0 ? receivers.map((r) => getComponentSignals(r, "receiver")).reduce((acc, signals) => {
      signals.forEach((s) => acc.add(s));
      return acc;
    }, /* @__PURE__ */ new Set()) : /* @__PURE__ */ new Set(["logs", "metrics", "traces"]);
    const processorSignals = processors.length > 0 ? processors.map((p) => getComponentSignals(p, "processor")).reduce((acc, signals) => {
      signals.forEach((s) => acc.add(s));
      return acc;
    }, /* @__PURE__ */ new Set()) : /* @__PURE__ */ new Set(["logs", "metrics", "traces"]);
    const exporterSignals = exporters.length > 0 ? exporters.map((e) => getComponentSignals(e, "exporter")).reduce((acc, signals) => {
      signals.forEach((s) => acc.add(s));
      return acc;
    }, /* @__PURE__ */ new Set()) : /* @__PURE__ */ new Set(["logs", "metrics", "traces"]);
    const allSignals = ["logs", "metrics", "traces"];
    const available = {
      logs: receiverSignals.has("logs") && processorSignals.has("logs") && exporterSignals.has("logs"),
      metrics: receiverSignals.has("metrics") && processorSignals.has("metrics") && exporterSignals.has("metrics"),
      traces: receiverSignals.has("traces") && processorSignals.has("traces") && exporterSignals.has("traces")
    };
    return available;
  };
  useEffect2(() => {
    const available = getAvailableSignals();
    setSelectedSignals((prev) => ({
      logs: available.logs && prev.logs,
      metrics: available.metrics && prev.metrics,
      traces: available.traces && prev.traces
    }));
  }, [receivers, processors, exporters]);
  const isValidHostPort = (value) => {
    if (!value) {
      return false;
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      return false;
    }
    if (trimmed.startsWith("[")) {
      const closing = trimmed.indexOf("]");
      if (closing > 0) {
        const portPart = trimmed.slice(closing + 1);
        if (portPart.startsWith(":")) {
          const port2 = Number(portPart.slice(1));
          return Number.isInteger(port2) && port2 > 0 && port2 <= 65535;
        }
      }
      return false;
    }
    const parts = trimmed.split(":");
    if (parts.length !== 2) {
      return false;
    }
    const port = Number(parts[1]);
    return parts[0].length > 0 && Number.isInteger(port) && port > 0 && port <= 65535;
  };
  const isValidHttpUrl = (value) => {
    if (!value) {
      return false;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  };
  const validateCRDSettings = (opts) => {
    const errors = [];
    if (!opts.includeDeploymentSettings) {
      return errors;
    }
    if (!(opts.isNewCollector || opts.canModifyDeploymentSettings)) {
      return errors;
    }
    const settings = opts.crdSettings;
    if (!settings.name?.trim()) {
      errors.push("CRD name is required when deployment settings are enabled.");
    }
    if (!settings.namespace?.trim()) {
      errors.push("CRD namespace is required when deployment settings are enabled.");
    }
    if (!settings.image?.trim()) {
      errors.push("Collector image is required in deployment settings.");
    }
    if ((settings.mode === "deployment" || settings.mode === "statefulset") && (!settings.replicas || settings.replicas < 1)) {
      errors.push("Replicas must be at least 1 for deployment/statefulset modes.");
    }
    const cpuReq = settings.resources.requests.cpu?.trim();
    const memReq = settings.resources.requests.memory?.trim();
    const cpuLimit = settings.resources.limits.cpu?.trim();
    const memLimit = settings.resources.limits.memory?.trim();
    if (!cpuReq || !memReq || !cpuLimit || !memLimit) {
      errors.push("CPU/Memory requests and limits must be provided in deployment settings.");
    }
    return errors;
  };
  const generateConfig = async () => {
    if (receivers.length === 0) {
      alert("Please add at least one receiver");
      return;
    }
    if (exporters.length === 0) {
      const proceed = confirm("No exporters configured. The generated config will not have a complete pipeline.\n\nNote: OpenTelemetry Collector requires at least one exporter to send data.\n\nDo you want to continue generating the config anyway?");
      if (!proceed) {
        return;
      }
    }
    const availableSignals = getAvailableSignals();
    const hasSelectedSignal = Object.entries(selectedSignals).some(
      ([signal, selected]) => selected && availableSignals[signal]
    );
    if (!hasSelectedSignal) {
      alert("Please select at least one telemetry signal (logs, metrics, or traces) that is compatible with your selected components.");
      return;
    }
    const invalidComponents = [];
    receivers.forEach((r, i) => {
      if (!r.type || r.type === "") {
        invalidComponents.push(`Receiver ${i + 1} (${r.name || "unnamed"}) is missing type`);
      }
      if (r.type === "otlp") {
        const grpcEndpoint = r.protocols?.grpc?.endpoint?.trim();
        const httpEndpoint = r.protocols?.http?.endpoint?.trim();
        if (!grpcEndpoint && !httpEndpoint) {
          invalidComponents.push(`Receiver ${i + 1} (${r.name || "otlp"}) requires at least one endpoint (gRPC and/or HTTP).`);
        }
        if (grpcEndpoint && !isValidHostPort(grpcEndpoint)) {
          invalidComponents.push(`Receiver ${i + 1} (${r.name || "otlp"}) has invalid gRPC endpoint "${grpcEndpoint}". Use host:port (e.g., 0.0.0.0:4317).`);
        }
        if (httpEndpoint && !isValidHostPort(httpEndpoint)) {
          invalidComponents.push(`Receiver ${i + 1} (${r.name || "otlp"}) has invalid HTTP endpoint "${httpEndpoint}". Use host:port (e.g., 0.0.0.0:4318).`);
        }
      }
    });
    processors.forEach((p, i) => {
      if (!p.type || p.type === "") {
        invalidComponents.push(`Processor ${i + 1} (${p.name || "unnamed"}) is missing type`);
      }
      if (p.name && p.type && p.name === p.type && !p.name.includes("_")) {
        console.warn(`Processor ${p.name} has type matching its name. This may cause validation errors.`);
      }
    });
    exporters.forEach((e, i) => {
      if (!e.type || e.type === "") {
        invalidComponents.push(`Exporter ${i + 1} (${e.name || "unnamed"}) is missing type`);
      }
      if (e.type === "otlp") {
        const endpoint = e.endpoint?.trim();
        if (!endpoint) {
          invalidComponents.push(`Exporter ${i + 1} (${e.name || "otlp"}) requires an endpoint (http://host:port or host:port).`);
        } else if (!isValidHttpUrl(endpoint) && !isValidHostPort(endpoint)) {
          invalidComponents.push(`Exporter ${i + 1} (${e.name || "otlp"}) endpoint "${endpoint}" is invalid. Use http(s) URL or host:port for gRPC.`);
        }
      }
    });
    const selectedAgent = agents.find((a) => a.agentUid === selectedAgentUID);
    const isDaemonSet = selectedAgent?.labels?.["k8s.crd_name"]?.toLowerCase().includes("daemonset") || selectedAgent?.name?.toLowerCase().includes("daemonset");
    const isNewCollector = Boolean(crdSettings.name && crdSettings.namespace);
    const canModifyDeploymentSettings = Boolean(!isDaemonSet && selectedAgentUID);
    const crdValidationErrors = validateCRDSettings({
      includeDeploymentSettings,
      crdSettings,
      isNewCollector,
      canModifyDeploymentSettings
    });
    invalidComponents.push(...crdValidationErrors);
    if (invalidComponents.length > 0) {
      alert("Invalid configuration:\n\n" + invalidComponents.join("\n") + "\n\nPlease ensure all components have a valid type.");
      return;
    }
    try {
      const response = await backendSrv6.post(
        "/api/plugins/otel-collector-agent-fleet-management/resources/config-generator",
        {
          receivers,
          processors,
          exporters,
          service: {
            selectedSignals: Object.entries(selectedSignals).filter(([_, selected]) => selected).map(([signal, _]) => signal)
          },
          // Include CRD settings only when the user opts-in AND it's permitted for this collector
          // 1. NEW collectors (name + namespace provided)
          // 2. EXISTING Deployment/StatefulSet collectors (deployment settings can be modified)
          // Do NOT include for DaemonSet collectors (only spec.config is updated)
          crdSettings: includeDeploymentSettings && (isNewCollector || canModifyDeploymentSettings) ? {
            name: crdSettings.name,
            namespace: crdSettings.namespace,
            mode: crdSettings.mode,
            replicas: crdSettings.mode === "deployment" || crdSettings.mode === "statefulset" ? crdSettings.replicas : void 0,
            image: crdSettings.image,
            managementState: crdSettings.managementState,
            upgradeStrategy: crdSettings.upgradeStrategy,
            resources: crdSettings.resources,
            advancedYaml: crdSettings.advancedYaml || void 0
          } : void 0
        }
      );
      const generated = typeof response.config === "string" ? response.config : "";
      if (!generated.trim()) {
        alert("The config generator did not return any YAML. Please verify that you have at least one receiver and exporter configured.");
      }
      setGeneratedConfig(generated);
    } catch (err) {
      alert("Failed to generate config: " + (err.message || "Unknown error"));
    }
  };
  const loadComponentTypes = async () => {
    try {
      const [receiversRes, processorsRes, exportersRes] = await Promise.all([
        backendSrv6.get("/api/plugins/otel-collector-agent-fleet-management/resources/component-types?category=receiver"),
        backendSrv6.get("/api/plugins/otel-collector-agent-fleet-management/resources/component-types?category=processor"),
        backendSrv6.get("/api/plugins/otel-collector-agent-fleet-management/resources/component-types?category=exporter")
      ]);
      const receiversList = (receiversRes.items || []).map((t) => ({
        value: t.type,
        label: t.label,
        config: t.config || {},
        description: t.description,
        isSystem: t.isSystem,
        isCustom: t.isCustom,
        id: t.id
      }));
      const processorsList = (processorsRes.items || []).map((t) => ({
        value: t.type,
        label: t.label,
        config: t.config || {},
        description: t.description,
        isSystem: t.isSystem,
        isCustom: t.isCustom,
        id: t.id
      }));
      const exportersList = (exportersRes.items || []).map((t) => ({
        value: t.type,
        label: t.label,
        config: t.config || {},
        description: t.description,
        isSystem: t.isSystem,
        isCustom: t.isCustom,
        id: t.id
      }));
      setReceiverTypes(mergeComponentTypeLists(receiversList, builtinReceiverTemplates));
      setProcessorTypes(mergeComponentTypeLists(processorsList, builtinProcessorTemplates));
      setExporterTypes(mergeComponentTypeLists(exportersList, builtinExporterTemplates));
    } catch (err) {
      console.error("Failed to load component types:", err);
    }
  };
  useEffect2(() => {
    loadComponentTypes();
    loadTemplates();
  }, []);
  const getTypesForCategory = (category) => {
    switch (category) {
      case "receiver":
        return receiverTypes;
      case "processor":
        return processorTypes;
      case "exporter":
        return exporterTypes;
    }
  };
  const addComponent = (category) => {
    const types = getTypesForCategory(category);
    const defaultType = types.length > 0 ? types[0] : { value: "custom", label: "Custom", config: {} };
    const componentIndex = category === "receiver" ? receivers.length + 1 : category === "processor" ? processors.length + 1 : exporters.length + 1;
    const componentName = defaultType.value !== "custom" ? `${defaultType.value}_${componentIndex}` : `${category}_${componentIndex}`;
    const newComponent = {
      name: componentName,
      type: defaultType.value,
      ...defaultType.config || {}
    };
    if (category === "receiver") {
      setReceivers([...receivers, newComponent]);
      const newKey = `${category}-${receivers.length}`;
      setExpandedComponents(/* @__PURE__ */ new Set([...expandedComponents, newKey]));
    } else if (category === "processor") {
      setProcessors([...processors, newComponent]);
      const newKey = `${category}-${processors.length}`;
      setExpandedComponents(/* @__PURE__ */ new Set([...expandedComponents, newKey]));
    } else {
      setExporters([...exporters, newComponent]);
      const newKey = `${category}-${exporters.length}`;
      setExpandedComponents(/* @__PURE__ */ new Set([...expandedComponents, newKey]));
    }
  };
  const removeComponent = (type2, index) => {
    if (type2 === "receiver") {
      setReceivers(receivers.filter((_, i) => i !== index));
    } else if (type2 === "processor") {
      setProcessors(processors.filter((_, i) => i !== index));
    } else {
      setExporters(exporters.filter((_, i) => i !== index));
    }
    const key = `${type2}-${index}`;
    const newExpanded = new Set(expandedComponents);
    newExpanded.delete(key);
    setExpandedComponents(newExpanded);
  };
  const updateComponent = (type2, index, updates) => {
    if (type2 === "receiver") {
      const updated = [...receivers];
      updated[index] = { ...updated[index], ...updates };
      setReceivers(updated);
    } else if (type2 === "processor") {
      const updated = [...processors];
      updated[index] = { ...updated[index], ...updates };
      setProcessors(updated);
    } else {
      const updated = [...exporters];
      updated[index] = { ...updated[index], ...updates };
      setExporters(updated);
    }
  };
  const toggleExpand = (key) => {
    const newExpanded = new Set(expandedComponents);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedComponents(newExpanded);
  };
  const changeComponentType = (category, index, newType) => {
    const types = getTypesForCategory(category);
    const template = types.find((t) => t.value === newType);
    if (newType === "custom") {
      if (category === "receiver") {
        const updated = [...receivers];
        updated[index] = { name: updated[index].name, type: "custom", customYaml: "" };
        setReceivers(updated);
      } else if (category === "processor") {
        const updated = [...processors];
        updated[index] = { name: updated[index].name, type: "custom", customYaml: "" };
        setProcessors(updated);
      } else {
        const updated = [...exporters];
        updated[index] = { name: updated[index].name, type: "custom", customYaml: "" };
        setExporters(updated);
      }
      return;
    }
    if (template) {
      if (category === "receiver") {
        const updated = [...receivers];
        updated[index] = { name: updated[index].name, type: newType, ...template.config || {} };
        setReceivers(updated);
      } else if (category === "processor") {
        const updated = [...processors];
        updated[index] = { name: updated[index].name, type: newType, ...template.config || {} };
        setProcessors(updated);
      } else {
        const updated = [...exporters];
        updated[index] = { name: updated[index].name, type: newType, ...template.config || {} };
        setExporters(updated);
      }
    }
  };
  const renderComponentEditor = (comp, type2, index) => {
    const key = `${type2}-${index}`;
    const isExpanded = expandedComponents.has(key);
    return /* @__PURE__ */ React2.createElement("div", { key: index, style: { marginBottom: 12, border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden" } }, /* @__PURE__ */ React2.createElement("div", { style: {
      padding: 12,
      background: isExpanded ? "#F9FAFB" : "white",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      cursor: "pointer"
    }, onClick: () => toggleExpand(key) }, /* @__PURE__ */ React2.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 2 } }, comp.name || `${type2}_${index + 1}`), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280" } }, comp.type)), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } }, /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: (e) => {
          e.stopPropagation();
          removeComponent(type2, index);
        },
        style: {
          padding: "4px 8px",
          background: "#EF4444",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 500
        }
      },
      "Delete"
    ), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 14, color: "#6B7280" } }, isExpanded ? "\u25BC" : "\u25B6"))), isExpanded && /* @__PURE__ */ React2.createElement("div", { style: { padding: 12, background: "white", borderTop: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Name"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "text",
        value: comp.name || "",
        onChange: (e) => updateComponent(type2, index, { name: e.target.value }),
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      }
    )), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Type"), /* @__PURE__ */ React2.createElement(
      "select",
      {
        value: comp.type,
        onChange: (e) => changeComponentType(type2, index, e.target.value),
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      },
      getTypesForCategory(type2).map((t) => /* @__PURE__ */ React2.createElement("option", { key: t.value, value: t.value }, t.label))
    )), comp.type === "otlp" && type2 === "receiver" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "gRPC Endpoint"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "text",
        value: comp.protocols?.grpc?.endpoint || "0.0.0.0:4317",
        onChange: (e) => {
          const updated = { ...comp };
          if (!updated.protocols) updated.protocols = {};
          if (!updated.protocols.grpc) updated.protocols.grpc = {};
          updated.protocols.grpc.endpoint = e.target.value;
          updateComponent(type2, index, updated);
        },
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      }
    )), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "HTTP Endpoint"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "text",
        value: comp.protocols?.http?.endpoint || "0.0.0.0:4318",
        onChange: (e) => {
          const updated = { ...comp };
          if (!updated.protocols) updated.protocols = {};
          if (!updated.protocols.http) updated.protocols.http = {};
          updated.protocols.http.endpoint = e.target.value;
          updateComponent(type2, index, updated);
        },
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      }
    ))), comp.type === "otlp" && type2 === "exporter" && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Endpoint"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "text",
        value: comp.endpoint || "http://localhost:4317",
        onChange: (e) => updateComponent(type2, index, { endpoint: e.target.value }),
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      }
    )), comp.type === "batch" && type2 === "processor" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Batch Size"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "number",
        value: comp.send_batch_size || 1024,
        onChange: (e) => updateComponent(type2, index, { send_batch_size: parseInt(e.target.value) || 1024 }),
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      }
    )), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Timeout"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "text",
        value: comp.timeout || "10s",
        onChange: (e) => updateComponent(type2, index, { timeout: e.target.value }),
        placeholder: "10s, 1m, etc",
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      }
    ))), comp.type === "memory_limiter" && type2 === "processor" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Limit (MiB)"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "number",
        value: comp.limit_mib || 512,
        onChange: (e) => updateComponent(type2, index, { limit_mib: parseInt(e.target.value) || 512 }),
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      }
    )), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Spike Limit (MiB)"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        type: "number",
        value: comp.spike_limit_mib || 128,
        onChange: (e) => updateComponent(type2, index, { spike_limit_mib: parseInt(e.target.value) || 128 }),
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13 }
      }
    ))), comp.type === "filelog" && type2 === "receiver" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Include Paths (one per line, glob patterns)"), /* @__PURE__ */ React2.createElement(
      "textarea",
      {
        value: Array.isArray(comp.include) ? comp.include.join("\n") : comp.include || "",
        onChange: (e) => {
          const lines = e.target.value.split("\n").filter((l) => l.trim());
          updateComponent(type2, index, { include: lines.length > 0 ? lines : [] });
        },
        placeholder: "/var/log/**/*.log\n/tmp/**/*.log",
        rows: 4,
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13, fontFamily: "monospace" }
      }
    )), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Exclude Paths (one per line, glob patterns)"), /* @__PURE__ */ React2.createElement(
      "textarea",
      {
        value: Array.isArray(comp.exclude) ? comp.exclude.join("\n") : comp.exclude || "",
        onChange: (e) => {
          const lines = e.target.value.split("\n").filter((l) => l.trim());
          updateComponent(type2, index, { exclude: lines.length > 0 ? lines : [] });
        },
        placeholder: "/var/log/**/*.tmp\n/tmp/**/debug.log",
        rows: 4,
        style: { width: "100%", padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 13, fontFamily: "monospace" }
      }
    ))), comp.type === "custom" ? /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 12, padding: 12, background: "#FEF3C7", borderRadius: 6, border: "2px solid #FCD34D" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#92400E" } }, "\u2699\uFE0F Custom YAML Configuration", comp._isExtension && comp._sectionName && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, marginLeft: 8, color: "#78350F", fontWeight: 400 } }, "(Extension: ", comp._sectionName, ")")), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#78350F", marginBottom: 8 } }, comp._isExtension ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, `This is a custom section (like extensions) that doesn't fit into standard receivers/processors/exporters. It will be preserved in the generated config as the "`, comp._sectionName, '" section.') : /* @__PURE__ */ React2.createElement(React2.Fragment, null, 'Enter your complete component configuration in YAML format. The component name "', comp.name || `${type2}_${index + 1}`, '" will be added automatically in the generated config.')), /* @__PURE__ */ React2.createElement(
      "textarea",
      {
        value: comp.customYaml || "",
        onChange: (e) => {
          updateComponent(type2, index, { ...comp, customYaml: e.target.value });
        },
        placeholder: comp._isExtension ? `# Custom section: ${comp._sectionName}
# Enter YAML configuration for this section
# Example:
${comp._sectionName}:
  key: value` : `# Enter your ${type2} YAML configuration here
# Example:
endpoint: http://localhost:4317
tls:
  insecure: true
headers:
  authorization: "Bearer token"`,
        style: {
          width: "100%",
          minHeight: 300,
          fontFamily: "monospace",
          fontSize: 12,
          padding: 12,
          border: "2px solid #F59E0B",
          borderRadius: 4,
          background: "white",
          color: "#111827",
          resize: "vertical"
        }
      }
    ), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#92400E", marginTop: 8 } }, "\u{1F4A1} ", /* @__PURE__ */ React2.createElement("strong", null, "Tip:"), " This YAML will be merged into the final OpenTelemetry Collector configuration as-is. Make sure the syntax is valid YAML.")) : (
      /* Raw YAML Editor for non-custom types (Advanced) */
      /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 12, padding: 8, background: "#F9FAFB", borderRadius: 4, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 11, fontWeight: 500, marginBottom: 4, color: "#6B7280" } }, "Advanced: Edit Full YAML Config"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 10, color: "#9CA3AF", marginBottom: 8 } }, "Edit the complete component configuration. Changes here override the form fields above."), /* @__PURE__ */ React2.createElement(
        "textarea",
        {
          value: dump(comp, { indent: 2, lineWidth: -1, skipInvalid: true }),
          onChange: (e) => {
            try {
              const parsed = load(e.target.value);
              if (parsed && typeof parsed === "object") {
                updateComponent(type2, index, parsed);
              }
            } catch (err) {
              console.error("Invalid YAML:", err.message);
            }
          },
          style: {
            width: "100%",
            minHeight: 150,
            fontFamily: "monospace",
            fontSize: 11,
            padding: 8,
            border: "1px solid #D1D5DB",
            borderRadius: 4,
            background: "white",
            resize: "vertical"
          }
        }
      ))
    )));
  };
  return /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: {
    background: "white",
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    padding: 24,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } }, /* @__PURE__ */ React2.createElement("h3", { style: { margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" } }, "Configuration Builder"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setShowComponentTypeManager(true),
      style: {
        padding: "8px 16px",
        background: "#8B5CF6",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 500
      }
    },
    "\u2699\uFE0F Manage Component Types"
  ))), savedTemplates.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 20, padding: 12, background: "#F3F4F6", borderRadius: 6 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#6B7280" } }, "Saved Templates"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } }, savedTemplates.map((t) => /* @__PURE__ */ React2.createElement("div", { key: t.id, style: { display: "flex", gap: 4, alignItems: "center", padding: "6px 12px", background: "white", borderRadius: 4, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 13, fontWeight: 500 } }, t.name), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => loadTemplate(t),
      style: { padding: "2px 8px", background: "#3B82F6", color: "white", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11 }
    },
    "Load"
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => deleteTemplate(t.id),
      disabled: deletingTemplateId === t.id,
      style: {
        padding: "2px 8px",
        background: deletingTemplateId === t.id ? "#9CA3AF" : "#EF4444",
        color: "white",
        border: "none",
        borderRadius: 3,
        cursor: deletingTemplateId === t.id ? "not-allowed" : "pointer",
        fontSize: 11
      }
    },
    deletingTemplateId === t.id ? "Deleting..." : "\xD7"
  ))))), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24, padding: 16, background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#111827" } }, "\u{1F527} Configuration Mode"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 16 } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        if (useRawYAML) {
          const source = rawYAMLConfig.trim() || generatedConfig;
          if (source) {
            const ok = parseConfigYAML(source);
            if (!ok) {
              return;
            }
          }
        }
        setUseRawYAML(false);
      },
      style: {
        padding: "10px 20px",
        background: !useRawYAML ? "#3B82F6" : "#F3F4F6",
        color: !useRawYAML ? "white" : "#6B7280",
        border: `2px solid ${!useRawYAML ? "#3B82F6" : "#E5E7EB"}`,
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        transition: "all 0.2s"
      }
    },
    "\u{1F4DD} Form-based Editor"
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        setUseRawYAML(true);
        if (!useRawYAML && generatedConfig) {
          setRawYAMLConfig(generatedConfig);
        }
      },
      style: {
        padding: "10px 20px",
        background: useRawYAML ? "#10B981" : "#F3F4F6",
        color: useRawYAML ? "white" : "#6B7280",
        border: `2px solid ${useRawYAML ? "#10B981" : "#E5E7EB"}`,
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        transition: "all 0.2s"
      }
    },
    "\u26A1 Raw YAML Editor (Direct)"
  )), useRawYAML && /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 12, padding: 12, background: "#FEF3C7", borderRadius: 6, border: "2px solid #FCD34D" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#92400E" } }, "\u26A1 Raw YAML Mode Active"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#78350F" } }, "You can directly edit the OpenTelemetry Collector YAML configuration. This will bypass the form-based editor and sync directly to the agent after approval."))), !useRawYAML && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24, padding: 16, background: "#F0F9FF", borderRadius: 6, border: "1px solid #93C5FD" } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#1E40AF" } }, "\u{1F4CA} Select Telemetry Signals"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 24, flexWrap: "wrap" } }, ["logs", "metrics", "traces"].map((signal) => {
    const availableSignals = getAvailableSignals();
    const isAvailable = availableSignals[signal];
    const isSelected = selectedSignals[signal];
    const signalLabel = signal.charAt(0).toUpperCase() + signal.slice(1);
    return /* @__PURE__ */ React2.createElement(
      "label",
      {
        key: signal,
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: isAvailable ? "pointer" : "not-allowed",
          opacity: isAvailable ? 1 : 0.5,
          padding: "8px 12px",
          background: isSelected ? "#DBEAFE" : "white",
          borderRadius: 6,
          border: `2px solid ${isSelected ? "#3B82F6" : "#D1D5DB"}`,
          fontSize: 13,
          fontWeight: isSelected ? 600 : 400,
          color: isSelected ? "#1E40AF" : "#6B7280"
        }
      },
      /* @__PURE__ */ React2.createElement(
        "input",
        {
          type: "checkbox",
          checked: isSelected,
          disabled: !isAvailable,
          onChange: (e) => {
            if (isAvailable) {
              setSelectedSignals((prev) => ({ ...prev, [signal]: e.target.checked }));
            }
          },
          style: { cursor: isAvailable ? "pointer" : "not-allowed" }
        }
      ),
      /* @__PURE__ */ React2.createElement("span", null, signalLabel),
      !isAvailable && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, color: "#9CA3AF", marginLeft: 4 } }, "(not compatible)")
    );
  })), /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 12, fontSize: 11, color: "#6B7280" } }, (() => {
    const available = getAvailableSignals();
    const availableCount = Object.values(available).filter((v) => v).length;
    if (availableCount === 0) {
      return "\u26A0\uFE0F No signals are compatible with your selected components. Please add compatible receivers, processors, and exporters.";
    }
    const selectedCount = Object.values(selectedSignals).filter((v) => v).length;
    if (selectedCount === 0) {
      return "\u26A0\uFE0F Please select at least one signal to generate a configuration.";
    }
    return `\u2139\uFE0F ${selectedCount} signal(s) selected. Only compatible signals are enabled based on your component selection.`;
  })())), !useRawYAML && false, !useRawYAML && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24, padding: 16, background: "#F3F4F6", borderRadius: 6, border: "1px solid #D1D5DB", color: "#4B5563", fontSize: 12 } }, "\u2139\uFE0F Deployment (CRD) settings must be updated directly in Kubernetes. This generator only manages the collector's ", /* @__PURE__ */ React2.createElement("code", null, "spec.config"), " that OpAMP can push."), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24, padding: 16, background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#111827" } }, "\u{1F4CD} Select Agent / Collector (Required for saving configuration)"), bridges.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 12, padding: "10px 12px", background: "#FEF3C7", borderRadius: 4, border: "1px solid #FCD34D", fontSize: 12, color: "#92400E" } }, "\u26A0\uFE0F ", /* @__PURE__ */ React2.createElement("strong", null, "Note:"), " Bridges are management agents and cannot receive collector configurations. Only collectors are shown below."), bridges.length > 0 ? /* @__PURE__ */ React2.createElement("div", { style: { border: "1px solid #D1D5DB", borderRadius: 6, background: "white", maxHeight: "400px", overflowY: "auto" } }, bridges.map((bridge) => {
    const bridgeCollectors = bridge.collectors || [];
    const isExpanded = expandedGroups.has(`config-${bridge.agentUid}`);
    if (bridgeCollectors.length === 0) {
      return null;
    }
    return /* @__PURE__ */ React2.createElement("div", { key: bridge.agentUid, style: { borderBottom: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement(
      "div",
      {
        onClick: () => {
          const newExpanded = new Set(expandedGroups);
          if (isExpanded) {
            newExpanded.delete(`config-${bridge.agentUid}`);
          } else {
            newExpanded.add(`config-${bridge.agentUid}`);
          }
          setExpandedGroups(newExpanded);
        },
        style: {
          padding: "12px 16px",
          background: isExpanded ? "#F3F4F6" : "#F9FAFB",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderLeft: "2px solid #E5E7EB"
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.background = "#F3F4F6";
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.background = isExpanded ? "#F3F4F6" : "#F9FAFB";
        }
      },
      /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", width: 20 } }, bridgeCollectors.length > 0 ? isExpanded ? "\u25BC" : "\u25B6" : ""),
      /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, color: "#6B7280", fontSize: 12 } }, bridge.name), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#9CA3AF" } }, "(Bridge - Management Agent)"), bridge.namespace && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#EFF6FF", color: "#1E40AF", borderRadius: 3 } }, "ns: ", bridge.namespace), bridge.cluster && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#F0FDF4", color: "#166534", borderRadius: 3 } }, "cluster: ", bridge.cluster), getStatusBadge(bridge.status), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, bridgeCollectors.length, " collector", bridgeCollectors.length !== 1 ? "s" : ""))
    ), isExpanded && bridgeCollectors.map((collector) => /* @__PURE__ */ React2.createElement(
      "div",
      {
        key: collector.agentUid,
        onClick: (e) => {
          e.stopPropagation();
          setSelectedAgentUID(collector.agentUid);
        },
        style: {
          padding: "10px 16px 10px 48px",
          background: selectedAgentUID === collector.agentUid ? "#DBEAFE" : "#FAFBFC",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderLeft: selectedAgentUID === collector.agentUid ? "4px solid #3B82F6" : "none",
          borderTop: "1px solid #E5E7EB"
        },
        onMouseEnter: (e) => {
          if (selectedAgentUID !== collector.agentUid) {
            e.currentTarget.style.background = "#F9FAFB";
          }
        },
        onMouseLeave: (e) => {
          if (selectedAgentUID !== collector.agentUid) {
            e.currentTarget.style.background = "#FAFBFC";
          }
        }
      },
      /* @__PURE__ */ React2.createElement("div", { style: { flex: 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 500, color: "#111827" } }, collector.name), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "(Collector)"), collector.labels?.["k8s.namespace"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#EFF6FF", color: "#1E40AF", borderRadius: 3 } }, "ns: ", collector.labels["k8s.namespace"]), collector.labels?.["k8s.crd_name"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#FEF3C7", color: "#92400E", borderRadius: 3 } }, "crd: ", collector.labels["k8s.crd_name"]), collector.labels?.["k8s.cluster"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, padding: "2px 6px", background: "#F0FDF4", color: "#166534", borderRadius: 3 } }, "cluster: ", collector.labels["k8s.cluster"]), getStatusBadge(collector.status), collector.version && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "v", collector.version)),
      /* @__PURE__ */ React2.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            setSelectedAgentUID(collector.agentUid);
          },
          style: {
            padding: "4px 12px",
            background: selectedAgentUID === collector.agentUid ? "#3B82F6" : "#E5E7EB",
            color: selectedAgentUID === collector.agentUid ? "white" : "#374151",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500
          }
        },
        selectedAgentUID === collector.agentUid ? "\u2713 Selected" : "Select"
      )
    )));
  }), agents.filter((a) => {
    const isBridge = bridges.some((b) => b.agentUid === a.agentUid);
    const isBridgeCollector = bridges.some((b) => b.collectors.some((c) => c.agentUid === a.agentUid));
    return !isBridge && !isBridgeCollector;
  }).length > 0 && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { padding: "12px 16px", background: "#F9FAFB", borderTop: "2px solid #E5E7EB", fontWeight: 600, fontSize: 12, color: "#6B7280" } }, "Standalone Agents"), agents.filter((a) => {
    const isBridge = bridges.some((b) => b.agentUid === a.agentUid);
    const isBridgeCollector = bridges.some((b) => b.collectors.some((c) => c.agentUid === a.agentUid));
    return !isBridge && !isBridgeCollector;
  }).map((agent) => /* @__PURE__ */ React2.createElement(
    "div",
    {
      key: agent.agentUid,
      onClick: () => setSelectedAgentUID(agent.agentUid),
      style: {
        padding: "12px 16px",
        background: selectedAgentUID === agent.agentUid ? "#DBEAFE" : "white",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderLeft: selectedAgentUID === agent.agentUid ? "4px solid #3B82F6" : "none",
        borderTop: "1px solid #E5E7EB"
      }
    },
    /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React2.createElement("span", null, agent.name || agent.agentUid), getStatusBadge(agent.status), agent.version && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "v", agent.version)),
    /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: (e) => {
          e.stopPropagation();
          setSelectedAgentUID(agent.agentUid);
        },
        style: {
          padding: "4px 12px",
          background: selectedAgentUID === agent.agentUid ? "#3B82F6" : "#E5E7EB",
          color: selectedAgentUID === agent.agentUid ? "white" : "#374151",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 11
        }
      },
      selectedAgentUID === agent.agentUid ? "\u2713 Selected" : "Select"
    )
  )))) : /* @__PURE__ */ React2.createElement(
    "select",
    {
      value: selectedAgentUID,
      onChange: (e) => setSelectedAgentUID(e.target.value),
      style: {
        width: "100%",
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid #D1D5DB",
        fontSize: 14,
        background: selectedAgentUID ? "white" : "#FEF3C7"
      }
    },
    /* @__PURE__ */ React2.createElement("option", { value: "" }, agents.length === 0 ? "-- No agents available --" : "-- Select an agent/collector first --"),
    agents.map((a) => /* @__PURE__ */ React2.createElement("option", { key: a.agentUid, value: a.agentUid }, a.name || a.agentUid, " (", a.status, ") ", a.version ? `v${a.version}` : ""))
  ), (() => {
    const selectedIsBridge = bridges.some((b) => b.agentUid === selectedAgentUID);
    if (!selectedAgentUID) {
      return /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "#78350F", padding: 8, background: "#FEF3C7", borderRadius: 4 } }, "\u26A0\uFE0F ", /* @__PURE__ */ React2.createElement("strong", null, "Important:"), " You must select a collector before generating or saving a configuration. Bridges are management agents and cannot receive collector configurations.");
    }
    if (selectedIsBridge) {
      return /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "#991B1B", padding: 8, background: "#FEE2E2", borderRadius: 4 } }, "\u274C ", /* @__PURE__ */ React2.createElement("strong", null, "Error:"), " Bridges cannot receive collector configurations. Please select a collector instead.");
    }
    return /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 8, fontSize: 12, color: "#065F46", padding: 8, background: "#D1FAE5", borderRadius: 4 } }, "\u2713 Collector selected. You can now generate, edit, and save configurations for this collector.");
  })()), !useRawYAML && /* @__PURE__ */ React2.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 } }, /* @__PURE__ */ React2.createElement("div", { style: { border: "1px solid #E5E7EB", borderRadius: 6, padding: 16, background: "white" } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("h4", { style: { margin: 0, fontSize: 14, fontWeight: 600, color: "#3B82F6" } }, "Receivers (", receivers.length, ")"), /* @__PURE__ */ React2.createElement("button", { onClick: () => addComponent("receiver"), style: { padding: "4px 8px", background: "#3B82F6", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 } }, "+ Add")), receivers.length === 0 ? /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: 20 } }, "No receivers added") : /* @__PURE__ */ React2.createElement("div", { style: { maxHeight: "600px", overflowY: "auto" } }, receivers.map((rec, idx) => renderComponentEditor(rec, "receiver", idx)))), /* @__PURE__ */ React2.createElement("div", { style: { border: "1px solid #E5E7EB", borderRadius: 6, padding: 16, background: "white" } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("h4", { style: { margin: 0, fontSize: 14, fontWeight: 600, color: "#10B981" } }, "Processors (", processors.length, ")"), /* @__PURE__ */ React2.createElement("button", { onClick: () => addComponent("processor"), style: { padding: "4px 8px", background: "#10B981", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 } }, "+ Add")), processors.length === 0 ? /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: 20 } }, "No processors added") : /* @__PURE__ */ React2.createElement("div", { style: { maxHeight: "600px", overflowY: "auto" } }, processors.map((proc, idx) => renderComponentEditor(proc, "processor", idx)))), /* @__PURE__ */ React2.createElement("div", { style: { border: "1px solid #E5E7EB", borderRadius: 6, padding: 16, background: "white" } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("h4", { style: { margin: 0, fontSize: 14, fontWeight: 600, color: "#F59E0B" } }, "Exporters (", exporters.length, ")"), /* @__PURE__ */ React2.createElement("button", { onClick: () => addComponent("exporter"), style: { padding: "4px 8px", background: "#F59E0B", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 } }, "+ Add")), exporters.length === 0 ? /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: 20 } }, "No exporters added") : /* @__PURE__ */ React2.createElement("div", { style: { maxHeight: "600px", overflowY: "auto" } }, exporters.map((exp, idx) => {
    const compKey = `exporter-${idx}`;
    const isExtension = exp._isExtension === true;
    if (isExtension) {
      const isExpanded = expandedComponents.has(compKey);
      return /* @__PURE__ */ React2.createElement("div", { key: idx, style: { marginBottom: 12, border: "1px solid #F59E0B", borderRadius: 6, overflow: "hidden", borderLeft: "4px solid #F59E0B", background: "#FFFBEB" } }, /* @__PURE__ */ React2.createElement("div", { style: {
        padding: 12,
        background: isExpanded ? "#FEF3C7" : "#FFFBEB",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer"
      }, onClick: () => toggleExpand(compKey) }, /* @__PURE__ */ React2.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#92400E", marginBottom: 2 } }, exp.name || `exporter_${idx + 1}`, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, marginLeft: 8, color: "#78350F", fontWeight: 400 } }, "(Extension: ", exp._sectionName, ")")), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#92400E" } }, "Custom Section")), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } }, /* @__PURE__ */ React2.createElement(
        "button",
        {
          onClick: (e) => {
            e.stopPropagation();
            removeComponent("exporter", idx);
          },
          style: {
            padding: "4px 8px",
            background: "#EF4444",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500
          }
        },
        "Delete"
      ), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 14, color: "#92400E" } }, isExpanded ? "\u25BC" : "\u25B6"))), isExpanded && renderComponentEditor(exp, "exporter", idx));
    }
    return renderComponentEditor(exp, "exporter", idx);
  })))), useRawYAML && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React2.createElement("label", { style: { fontSize: 14, fontWeight: 600, color: "#111827" } }, "\u26A1 Raw YAML Configuration Editor"), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        if (generatedConfig) {
          setRawYAMLConfig(generatedConfig);
        }
      },
      style: { padding: "6px 12px", background: "#6B7280", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }
    },
    "Load from Generated"
  )), /* @__PURE__ */ React2.createElement(
    "textarea",
    {
      value: rawYAMLConfig,
      onChange: (e) => setRawYAMLConfig(e.target.value),
      placeholder: `# OpenTelemetry Collector Configuration (YAML)
# Example:
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024

exporters:
  logging:
    loglevel: info

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [logging]
`,
      style: {
        width: "100%",
        minHeight: 500,
        fontFamily: "monospace",
        fontSize: 12,
        padding: 16,
        border: "2px solid #10B981",
        borderRadius: 6,
        background: "#F9FAFB",
        resize: "vertical",
        lineHeight: "1.6"
      }
    }
  ), /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        if (!selectedAgentUID) {
          alert("Please select an agent first");
          return;
        }
        if (!rawYAMLConfig.trim()) {
          alert("Please enter a YAML configuration");
          return;
        }
        const saveRawConfig = async () => {
          if (!selectedAgentUID || selectedAgentUID.trim() === "") {
            alert("\u274C Error: No agent selected. Please select an agent from the dropdown above.");
            return;
          }
          const configToSave = rawYAMLConfig.trim();
          if (!configToSave || configToSave === "") {
            alert("\u274C Error: Configuration is empty. Please enter a YAML configuration.");
            return;
          }
          const saveButton = document.activeElement;
          const originalText = saveButton?.textContent;
          if (saveButton) {
            saveButton.textContent = "\u23F3 Saving...";
            saveButton.disabled = true;
          }
          try {
            console.log("Saving raw config for agent:", selectedAgentUID);
            const response = await backendSrv6.post("/api/plugins/otel-collector-agent-fleet-management/resources/configs", {
              agentUid: selectedAgentUID,
              name: `Raw Config - ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
              config: configToSave
            });
            if (response.validationErrors && response.validationErrors.length > 0) {
              alert("\u274C Configuration validation failed:\n\n" + response.validationErrors.join("\n") + "\n\nPlease fix the errors and try again.");
            } else if (response.ok === false) {
              alert("\u274C Failed to save configuration:\n" + (response.message || "Unknown error"));
            } else {
              setGeneratedConfig(configToSave);
              if (selectedAgentUID) {
                await loadConfigVersions(selectedAgentUID);
              }
              alert("\u2705 Raw YAML configuration saved successfully!\n\n\u26A0\uFE0F Note: It will require admin approval before it can be pushed to the agent.");
            }
          } catch (err) {
            console.error("Failed to save raw config:", err);
            const errorMsg = err.data?.message || err.message || "Unknown error";
            const validationErrors = err.data?.validationErrors;
            if (validationErrors && validationErrors.length > 0) {
              alert("\u274C Configuration validation failed:\n\n" + validationErrors.join("\n") + "\n\nPlease fix the errors and try again.");
            } else {
              alert("\u274C Failed to save raw config:\n\n" + errorMsg + "\n\nPlease check the console for details.");
            }
          } finally {
            if (saveButton) {
              if (originalText) saveButton.textContent = originalText;
              saveButton.disabled = false;
            }
          }
        };
        saveRawConfig();
      },
      style: { padding: "8px 20px", background: "#10B981", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 }
    },
    "\u{1F4BE} Save Raw YAML Config"
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        if (!rawYAMLConfig.trim()) {
          alert("Please enter a YAML configuration to apply.");
          return;
        }
        const trimmed = rawYAMLConfig.trim();
        const ok = parseConfigYAML(trimmed);
        if (ok) {
          setGeneratedConfig(trimmed);
          alert("\u2705 Applied raw YAML to the visual editor preview. Review the Generated Configuration section below.");
        } else {
          console.warn("Raw YAML apply failed validation.");
        }
      },
      style: { padding: "8px 16px", background: "#2563EB", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }
    },
    "\u2699\uFE0F Apply Raw YAML"
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setRawYAMLConfig(""),
      style: { padding: "6px 16px", background: "#6B7280", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }
    },
    "Clear"
  )), /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 12, padding: 12, background: "#DBEAFE", borderRadius: 6, border: "1px solid #93C5FD" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 4, color: "#1E40AF" } }, "\u{1F4A1} Raw YAML Mode Tips"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#1E3A8A" } }, "\u2022 Write your OpenTelemetry Collector YAML configuration directly", /* @__PURE__ */ React2.createElement("br", null), "\u2022 The configuration will be validated before saving", /* @__PURE__ */ React2.createElement("br", null), "\u2022 After saving, it will require admin approval before pushing to agents", /* @__PURE__ */ React2.createElement("br", null), "\u2022 You can switch back to form-based mode at any time"))), !useRawYAML && /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("label", { style: { fontWeight: 600, fontSize: 14, color: "#111827" } }, "Generated Configuration"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: generateConfig,
      style: {
        padding: "8px 16px",
        background: (() => {
          const configuredReceivers = receivers.filter((r) => typeof r.name === "string" && r.name.trim() !== "");
          return configuredReceivers.length === 0 ? "#FBBF24" : "#3B82F6";
        })(),
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: (() => {
          const configuredReceivers = receivers.filter((r) => typeof r.name === "string" && r.name.trim() !== "");
          return configuredReceivers.length === 0 ? "pointer" : "pointer";
        })(),
        fontSize: 14,
        fontWeight: 500
      },
      title: (() => {
        const configuredReceivers = receivers.filter((r) => typeof r.name === "string" && r.name.trim() !== "");
        if (configuredReceivers.length === 0) {
          return "No receivers configured; generated YAML will be incomplete. Click only if you plan to edit the result manually.";
        }
        return exporters.length === 0 ? "Warning: No exporters configured. Config will be incomplete." : "";
      })()
    },
    "Generate Config"
  ), generatedConfig && /* @__PURE__ */ React2.createElement("button", { onClick: () => setGeneratedConfig(""), style: { padding: "4px 12px", background: "#6B7280", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 } }, "Clear"))), generatedConfig && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(
    "textarea",
    {
      readOnly: true,
      value: generatedConfig,
      style: {
        width: "100%",
        minHeight: 300,
        fontFamily: "monospace",
        fontSize: 12,
        padding: 12,
        border: "1px solid #E5E7EB",
        borderRadius: 6,
        background: "#F9FAFB"
      }
    }
  ), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setShowSaveDialog(true),
      disabled: !generatedConfig || generatedConfig.trim() === "",
      style: {
        padding: "8px 16px",
        background: !generatedConfig || generatedConfig.trim() === "" ? "#D1D5DB" : "#6B7280",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: !generatedConfig || generatedConfig.trim() === "" ? "not-allowed" : "pointer",
        fontSize: 14,
        fontWeight: 500,
        opacity: !generatedConfig || generatedConfig.trim() === "" ? 0.5 : 1
      },
      title: !generatedConfig || generatedConfig.trim() === "" ? "Generate config first to enable saving as template" : "Save current configuration as a reusable template"
    },
    "\u{1F4BE} Save Template"
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: async () => {
        if (!selectedAgentUID || selectedAgentUID.trim() === "") {
          alert("\u274C Error: No agent selected. Please select an agent from the dropdown above.");
          return;
        }
        const configToSave = generatedConfig.trim();
        if (!configToSave || configToSave === "") {
          alert("\u274C Error: No configuration generated. Please generate a configuration first.");
          return;
        }
        try {
          const response = await backendSrv6.post("/api/plugins/otel-collector-agent-fleet-management/resources/configs", {
            agentUid: selectedAgentUID,
            name: `Config ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
            config: configToSave
          });
          if (response.validationErrors && response.validationErrors.length > 0) {
            alert("Configuration validation failed:\n" + response.validationErrors.join("\n"));
            return;
          }
          if (!response.ok) {
            alert(response.message || "Failed to save configuration");
            return;
          }
          if (selectedAgentUID) {
            await loadConfigVersions(selectedAgentUID);
          }
          alert("Configuration saved successfully! It will require admin approval before it can be pushed.");
        } catch (err) {
          const errorMsg = err.data?.message || err.message || "Unknown error";
          const validationErrors = err.data?.validationErrors;
          if (validationErrors && validationErrors.length > 0) {
            alert("Configuration validation failed:\n" + validationErrors.join("\n"));
          } else {
            alert("Failed to save config: " + errorMsg);
          }
        }
      },
      disabled: !generatedConfig || generatedConfig.trim() === "" || !selectedAgentUID,
      style: {
        padding: "8px 16px",
        background: !generatedConfig || generatedConfig.trim() === "" || !selectedAgentUID ? "#D1D5DB" : "#10B981",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: !generatedConfig || generatedConfig.trim() === "" || !selectedAgentUID ? "not-allowed" : "pointer",
        fontSize: 14,
        fontWeight: 500,
        opacity: !generatedConfig || generatedConfig.trim() === "" || !selectedAgentUID ? 0.5 : 1
      },
      title: !selectedAgentUID ? "Select an agent first" : !generatedConfig || generatedConfig.trim() === "" ? "Generate config first to enable saving" : "Save configuration to selected agent"
    },
    "\u{1F4BE} Save"
  )))), selectedAgentUID && configVersions.length > 0 && (() => {
    const pendingConfigs = configVersions.filter((v) => v.agentUid === selectedAgentUID && v.approvalStatus === "pending");
    if (pendingConfigs.length === 0) return null;
    return /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 24, marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: {
      padding: 16,
      background: "#FEF3C7",
      borderRadius: 6,
      border: "2px solid #FCD34D"
    } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#92400E", marginBottom: 4 } }, "\u26A0\uFE0F Pending Approvals (", pendingConfigs.length, ")"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#78350F" } }, isAdmin ? "Review and approve these configurations below to enable pushing them to agents." : `These configurations are waiting for admin approval. Only admins can approve configurations.`))), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, color: "#78350F", marginTop: 8 } }, pendingConfigs.map((cfg, idx) => /* @__PURE__ */ React2.createElement("div", { key: cfg.id, style: { marginBottom: 8, padding: 8, background: "white", borderRadius: 4 } }, /* @__PURE__ */ React2.createElement("strong", null, "Version ", cfg.version), " - Created by ", cfg.createdBy || "unknown", " at ", cfg.createdAt ? new Date(cfg.createdAt).toLocaleString() : "N/A", !isAdmin && /* @__PURE__ */ React2.createElement("span", { style: { marginLeft: 8, fontSize: 11, color: "#B45309" } }, "\u23F3 Awaiting admin approval")))), !isAdmin && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#78350F", marginTop: 8, padding: 8, background: "white", borderRadius: 4 } }, "\u{1F4A1} ", /* @__PURE__ */ React2.createElement("strong", null, "Next Steps:"), " Contact an administrator to approve the configuration. Once approved, you'll be able to push it to the agent.")));
  })(), selectedAgentUID && configVersions.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("label", { style: { fontWeight: 600, fontSize: 16, color: "#111827" } }, "\u{1F4CB} Configuration History & Approval Queue"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", marginTop: 4 } }, (() => {
    const agentConfigs = configVersions.filter((v) => v.agentUid === selectedAgentUID);
    const pending = agentConfigs.filter((v) => v.approvalStatus === "pending").length;
    const approved = agentConfigs.filter((v) => v.approvalStatus === "approved").length;
    const rejected = agentConfigs.filter((v) => v.approvalStatus === "rejected").length;
    return `Agent: ${selectedAgentUID.substring(0, 16)}... \u2022 ${pending} pending \u2022 ${approved} approved \u2022 ${rejected} rejected \u2022 Last 5 versions shown`;
  })())), isAdmin && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: "6px 12px",
    background: "#D1FAE5",
    borderRadius: 6,
    border: "1px solid #86EFAC"
  } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 12, color: "#065F46", fontWeight: 600 } }, "\u{1F464} Admin Mode - Can Approve/Reject")), !isAdmin && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: "6px 12px",
    background: "#FEF3C7",
    borderRadius: 6,
    border: "1px solid #FCD34D",
    fontSize: 11,
    color: "#92400E"
  } }, "\u26A0\uFE0F Admin role not detected. Check console for role details. For testing, approvals may still work.")), /* @__PURE__ */ React2.createElement("div", { style: { background: "white", border: "1px solid #E5E7EB", borderRadius: 6, overflow: "hidden" } }, configVersions.filter((v) => v.agentUid === selectedAgentUID).map((version, idx) => {
    const syncStatus = configSyncStatus[version.id];
    const hasFailed = syncStatus && version.pushedAt && ((syncStatus.remoteConfigStatus || "").includes("FAILED") || !!syncStatus.remoteConfigError);
    const statusColor = hasFailed ? "#EF4444" : version.approvalStatus === "approved" ? "#10B981" : version.approvalStatus === "rejected" ? "#EF4444" : "#F59E0B";
    const isApproved = version.approvalStatus === "approved";
    const displayStatus = hasFailed ? "FAILED" : version.approvalStatus || "pending";
    return /* @__PURE__ */ React2.createElement("div", { key: version.id, style: {
      padding: 16,
      borderBottom: idx < configVersions.length - 1 ? "1px solid #E5E7EB" : "none",
      background: idx === 0 ? "#F9FAFB" : "white"
    } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 12, alignItems: "center", marginBottom: 6, flexWrap: "wrap" } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, fontSize: 14 } }, "Version ", version.version), /* @__PURE__ */ React2.createElement("span", { style: {
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 500,
      background: statusColor,
      color: "white"
    } }, displayStatus), hasFailed && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#EF4444", fontWeight: 600 } }, "\u26A0\uFE0F Config Error"), version.pushedAt && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#3B82F6", fontWeight: 500 } }, "\u2713 Pushed at ", new Date(version.pushedAt).toLocaleString(), version.pushedBy && ` by ${version.pushedBy}`), isApproved && !version.pushedAt && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#10B981", fontWeight: 500 } }, "\u2713 Ready to Push")), /* @__PURE__ */ React2.createElement("div", { style: {
      fontSize: 12,
      color: "#6B7280",
      padding: 8,
      background: "#F3F4F6",
      borderRadius: 4,
      marginBottom: 8
    } }, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("strong", null, "Created:"), " ", version.createdBy || "unknown", " at ", version.createdAt ? new Date(version.createdAt).toLocaleString() : "N/A"), version.modifiedAt && version.modifiedAt !== version.createdAt && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("strong", null, "Modified:"), " ", version.modifiedBy, " at ", new Date(version.modifiedAt).toLocaleString()), version.approvedBy && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 4, color: version.approvalStatus === "approved" ? "#10B981" : "#EF4444" } }, /* @__PURE__ */ React2.createElement("strong", null, version.approvalStatus === "approved" ? "\u2713 Approved" : "\u2717 Rejected", ":"), " ", version.approvedBy, " at ", version.approvedAt ? new Date(version.approvedAt).toLocaleString() : "", version.approvalComment && /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 6, fontSize: 11, fontStyle: "italic", color: "#6B7280", padding: "6px 10px", background: "#F9FAFB", borderRadius: 4, borderLeft: "3px solid #D1D5DB" } }, "\u{1F4AC} ", /* @__PURE__ */ React2.createElement("strong", null, "Comment:"), " ", version.approvalComment)), (() => {
      const syncStatus2 = configSyncStatus[version.id];
      if (syncStatus2 && version.pushedAt) {
        const remoteStatus = syncStatus2.remoteConfigStatus || "";
        const hashMatch = syncStatus2.hashMatch;
        const hasError = syncStatus2.remoteConfigError;
        if (remoteStatus.includes("FAILED") || hasError) {
          const errorMsg = syncStatus2.remoteConfigError || "Configuration failed to apply";
          return /* @__PURE__ */ React2.createElement("div", { style: {
            marginTop: 8,
            padding: "10px 12px",
            background: "#FEE2E2",
            borderRadius: 4,
            border: "2px solid #EF4444",
            fontSize: 11
          } }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, color: "#991B1B", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 } }, "\u274C ", /* @__PURE__ */ React2.createElement("span", null, "Configuration Failed to Apply")), /* @__PURE__ */ React2.createElement("div", { style: {
            color: "#7F1D1D",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 10,
            lineHeight: "1.5",
            maxHeight: "150px",
            overflowY: "auto",
            padding: "6px 8px",
            background: "#FFFFFF",
            borderRadius: 3
          } }, errorMsg));
        }
      }
      return null;
    })())), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: () => {
          const configId = version.id || version["id"];
          if (!configId) {
            alert("Invalid config ID");
            console.error("Config ID missing in version:", version);
            return;
          }
          loadConfigDiff(String(configId));
        },
        style: { padding: "6px 14px", background: "#3B82F6", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 500 }
      },
      "\u{1F4CA} View Diff"
    ), (() => {
      const agentConfigs = configVersions.filter((v) => v.agentUid === selectedAgentUID);
      const latestVersion = agentConfigs.length > 0 ? Math.max(...agentConfigs.map((v) => v.version || 0)) : 0;
      const isLatestVersion = version.version === latestVersion;
      const isNotApproved = version.approvalStatus !== "approved";
      const agent = agents.find((a) => a.agentUid === selectedAgentUID);
      const agentNotOnline = !agent || agent.status !== "online";
      const canRevert = !isLatestVersion && isApproved && !agentNotOnline;
      const disabledReason = isLatestVersion ? "Cannot revert to the latest version" : isNotApproved ? "Only approved configurations can be reverted" : agentNotOnline ? "Agent must be online to revert" : "";
      return /* @__PURE__ */ React2.createElement(
        "button",
        {
          onClick: () => {
            if (!canRevert) {
              alert(`Cannot revert: ${disabledReason}`);
              return;
            }
            const configId = version.id || version["id"];
            if (!configId) {
              alert("Invalid config ID");
              console.error("Config ID missing in version:", version);
              return;
            }
            revertConfig(Number(configId));
          },
          disabled: !canRevert,
          title: disabledReason || "Revert to this configuration version",
          style: {
            padding: "6px 14px",
            background: canRevert ? "#6B7280" : "#D1D5DB",
            color: canRevert ? "white" : "#9CA3AF",
            border: "none",
            borderRadius: 4,
            cursor: canRevert ? "pointer" : "not-allowed",
            fontSize: 12,
            fontWeight: 500,
            opacity: canRevert ? 1 : 0.6
          }
        },
        "\u21A9\uFE0F Revert"
      );
    })(), isApproved && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, !version.pushedAt ? /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: async () => {
          try {
            const resp = await backendSrv6.get(`/api/plugins/otel-collector-agent-fleet-management/resources/configs/${version.id}`);
            await onPushConfig(selectedAgentUID, resp.config);
            alert("\u2705 Configuration pushed. Watch the collector health badge for status updates.");
            if (selectedAgentUID) {
              await loadConfigVersions(selectedAgentUID);
            }
          } catch (err) {
            alert("Failed to push config: " + (err.message || "Unknown error"));
          }
        },
        style: {
          padding: "6px 14px",
          background: "#10B981",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500
        }
      },
      "\u{1F680} Push This Version"
    ) : /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React2.createElement("div", { style: {
      padding: "8px 12px",
      background: "#E0E7FF",
      borderRadius: 4,
      border: "1px solid #C7D2FE",
      fontSize: 11,
      color: "#3730A3"
    } }, "\u2713 Pushed at ", new Date(version.pushedAt).toLocaleString(), version.pushedBy && ` by ${version.pushedBy}`), (() => {
      const syncStatus2 = configSyncStatus[version.id];
      if (!syncStatus2) {
        return /* @__PURE__ */ React2.createElement("span", { style: {
          padding: "4px 10px",
          background: "#6B7280",
          color: "white",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: 6
        } }, "\u23F3 Checking sync status...");
      }
      const remoteStatus = syncStatus2.remoteConfigStatus || "";
      const hashMatch = syncStatus2.hashMatch;
      const hasError = syncStatus2.remoteConfigError;
      if (remoteStatus.includes("APPLIED") && hashMatch) {
        return /* @__PURE__ */ React2.createElement("span", { style: {
          padding: "4px 10px",
          background: "#10B981",
          color: "white",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: 6
        } }, "\u2705 Synced");
      } else if (remoteStatus.includes("FAILED") || hasError) {
        const errorMsg = syncStatus2.remoteConfigError || "Unknown error";
        return /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React2.createElement("span", { style: {
          padding: "6px 12px",
          background: "#EF4444",
          color: "white",
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          gap: 6
        } }, "\u274C Configuration Failed"), errorMsg && /* @__PURE__ */ React2.createElement("div", { style: {
          padding: "10px 12px",
          background: "#FEE2E2",
          borderRadius: 4,
          border: "1px solid #FCA5A5",
          fontSize: 11,
          color: "#991B1B",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxWidth: "400px",
          maxHeight: "200px",
          overflowY: "auto"
        } }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, marginBottom: 4 } }, "Error Details:"), errorMsg));
      } else if (remoteStatus.includes("APPLYING")) {
        return /* @__PURE__ */ React2.createElement("span", { style: {
          padding: "4px 10px",
          background: "#F59E0B",
          color: "white",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          gap: 6
        } }, "\u23F3 Syncing...");
      } else {
        return /* @__PURE__ */ React2.createElement("div", { style: {
          padding: "6px 10px",
          background: "#F3F4F6",
          color: "#374151",
          borderRadius: 4,
          fontSize: 11,
          lineHeight: 1.5
        } }, "Agent has not reported a RemoteConfigStatus yet. After pushing, track the collector health badge in the roster (green = applied, red = offline).");
      }
    })(), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginTop: 6 } }, "After pushing, watch the collector health indicator under the Collectors tab. Green means the agent is healthy, red means it needs attention."))), version.approvalStatus === "pending" && /* @__PURE__ */ React2.createElement("div", { style: {
      padding: 12,
      background: "#FEF3C7",
      borderRadius: 6,
      border: "2px solid #FCD34D",
      marginTop: 8
    } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#92400E", marginBottom: 8 } }, "\u26A0\uFE0F AWAITING APPROVAL ", isAdmin ? "(You are admin)" : "(Admin role not detected - trying anyway for testing)"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: () => handleApprovalClick(String(version.id), "approve"),
        disabled: version.approvalStatus === "approved" || version.approvalStatus === "rejected",
        style: {
          flex: 1,
          padding: "8px 16px",
          background: version.approvalStatus === "approved" || version.approvalStatus === "rejected" ? "#D1D5DB" : "#10B981",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: version.approvalStatus === "approved" || version.approvalStatus === "rejected" ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          opacity: version.approvalStatus === "approved" || version.approvalStatus === "rejected" ? 0.5 : 1
        },
        title: version.approvalStatus === "approved" || version.approvalStatus === "rejected" ? `Configuration already ${version.approvalStatus}` : isAdmin ? "Approve this configuration as admin" : "Attempting to approve (testing mode)"
      },
      "\u2713 Approve Configuration"
    ), /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: () => handleApprovalClick(String(version.id), "reject"),
        disabled: version.approvalStatus === "approved" || version.approvalStatus === "rejected",
        style: {
          flex: 1,
          padding: "8px 16px",
          background: version.approvalStatus === "approved" || version.approvalStatus === "rejected" ? "#D1D5DB" : "#EF4444",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: version.approvalStatus === "approved" || version.approvalStatus === "rejected" ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          opacity: version.approvalStatus === "approved" || version.approvalStatus === "rejected" ? 0.5 : 1
        },
        title: version.approvalStatus === "approved" || version.approvalStatus === "rejected" ? `Configuration already ${version.approvalStatus}` : isAdmin ? "Reject this configuration as admin" : "Attempting to reject (testing mode)"
      },
      "\u2717 Reject Configuration"
    )), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#78350F", marginTop: 8 } }, "\u{1F4A1} Review the configuration above, then approve or reject it. Approved configs can be pushed to agents.", !isAdmin && /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 4, fontSize: 10 } }, "\u26A0\uFE0F Note: Admin role not detected, but approval will be attempted anyway for testing."))), version.approvalStatus === "rejected" && /* @__PURE__ */ React2.createElement("div", { style: {
      padding: 12,
      background: "#FEE2E2",
      borderRadius: 6,
      border: "2px solid #FECACA",
      marginTop: 8
    } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#991B1B", marginBottom: 4 } }, "\u2717 Configuration Rejected"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#7F1D1D" } }, "This configuration has been rejected and cannot be approved again. Create a new version if you need to make changes.")))));
  }))), showApprovalDialog && approvalAction && approvalConfigId && /* @__PURE__ */ React2.createElement("div", { style: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2e3
  }, onClick: () => {
    setShowApprovalDialog(false);
    setApprovalAction(null);
    setApprovalConfigId(null);
    setApprovalComment("");
  } }, /* @__PURE__ */ React2.createElement("div", { style: {
    background: "white",
    borderRadius: 8,
    padding: 24,
    maxWidth: 500,
    width: "90%",
    maxHeight: "80vh",
    overflowY: "auto",
    boxShadow: "0 10px 25px rgba(0,0,0,0.3)"
  }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React2.createElement("h3", { style: { margin: "0 0 16px 0", fontSize: 18, fontWeight: 600, color: approvalAction === "approve" ? "#10B981" : "#EF4444" } }, approvalAction === "approve" ? "\u2713 Approve Configuration" : "\u2717 Reject Configuration"), /* @__PURE__ */ React2.createElement("p", { style: { margin: "0 0 16px 0", fontSize: 14, color: "#6B7280" } }, approvalAction === "approve" ? "Are you sure you want to approve this configuration? Approved configurations can be pushed to agents." : "Please provide a reason for rejecting this configuration. Comments are required for rejections."), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 13, fontWeight: 500, marginBottom: 8, color: "#111827" } }, approvalAction === "reject" ? "Rejection Reason *" : "Comment (Optional)"), /* @__PURE__ */ React2.createElement(
    "textarea",
    {
      value: approvalComment,
      onChange: (e) => setApprovalComment(e.target.value),
      placeholder: approvalAction === "reject" ? "Please explain why this configuration is being rejected..." : "Add any notes about this approval (optional)...",
      rows: 4,
      style: {
        width: "100%",
        padding: "10px 12px",
        border: "1px solid #D1D5DB",
        borderRadius: 6,
        fontSize: 13,
        fontFamily: "inherit",
        resize: "vertical"
      }
    }
  )), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 12, justifyContent: "flex-end" } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        setShowApprovalDialog(false);
        setApprovalAction(null);
        setApprovalConfigId(null);
        setApprovalComment("");
      },
      style: {
        padding: "8px 16px",
        background: "#F3F4F6",
        color: "#111827",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500
      }
    },
    "Cancel"
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: approveConfig,
      disabled: approvalAction === "reject" && !approvalComment.trim(),
      style: {
        padding: "8px 16px",
        background: approvalAction === "approve" ? "#10B981" : "#EF4444",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: approvalAction === "reject" && !approvalComment.trim() ? "not-allowed" : "pointer",
        fontSize: 13,
        fontWeight: 600,
        opacity: approvalAction === "reject" && !approvalComment.trim() ? 0.5 : 1
      }
    },
    approvalAction === "approve" ? "\u2713 Confirm Approval" : "\u2717 Confirm Rejection"
  )))), showDiff && diffData && /* @__PURE__ */ React2.createElement("div", { style: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2e3
  }, onClick: () => setShowDiff(false) }, /* @__PURE__ */ React2.createElement("div", { style: {
    background: "white",
    borderRadius: 8,
    padding: 24,
    maxWidth: "90%",
    maxHeight: "90%",
    width: 1e3,
    overflow: "auto",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
  }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } }, /* @__PURE__ */ React2.createElement("h3", { style: { margin: 0 } }, "Configuration Diff"), /* @__PURE__ */ React2.createElement("button", { onClick: () => setShowDiff(false), style: { background: "none", border: "none", fontSize: 24, cursor: "pointer" } }, "\xD7")), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#4B5563" } }, "Viewing scope:\xA0", /* @__PURE__ */ React2.createElement("strong", null, diffData.currentScope ? diffData.currentScope : "full document"), diffData.previousScope && diffData.previousScope !== diffData.currentScope && /* @__PURE__ */ React2.createElement(React2.Fragment, null, " (previous: ", diffData.previousScope, ")")), diffData.fullCurrent && /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setShowFullDiff((prev) => !prev),
      style: {
        padding: "6px 12px",
        background: showFullDiff ? "#1F2937" : "#2563EB",
        color: "white",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500
      }
    },
    showFullDiff ? "Hide Full CR YAML" : "Show Full CR YAML"
  )), showFullDiff && diffData.fullCurrent && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 6 } }, "Full Current CRD YAML"), /* @__PURE__ */ React2.createElement("pre", { style: {
    maxHeight: 200,
    overflow: "auto",
    background: "#F3F4F6",
    padding: 12,
    borderRadius: 4,
    fontSize: 11
  } }, diffData.fullCurrent)), /* @__PURE__ */ React2.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, marginBottom: 8, color: "#DC2626" } }, "\u274C ", diffData.isUsingBaseline ? "Baseline" : `Previous Version (v${diffData.previousVersion || "N/A"})`, " (Removed/Changed)"), /* @__PURE__ */ React2.createElement("div", { style: {
    width: "100%",
    minHeight: 400,
    maxHeight: 500,
    fontFamily: "monospace",
    fontSize: 11,
    padding: 8,
    border: "2px solid #FCA5A5",
    borderRadius: 4,
    background: "#FEE2E2",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word"
  } }, diffData.diff && diffData.diff.length > 0 ? diffData.diff.map((change, idx) => {
    if (change.type === "removed" || change.type === "modified") {
      return /* @__PURE__ */ React2.createElement("div", { key: idx, style: {
        padding: "2px 4px",
        background: "#FECACA",
        borderLeft: "3px solid #DC2626",
        marginBottom: 1
      } }, /* @__PURE__ */ React2.createElement("span", { style: { color: "#991B1B", marginRight: 8, userSelect: "none", fontWeight: 600 } }, "L", change.line), /* @__PURE__ */ React2.createElement("span", { style: { color: "#7F1D1D" } }, change.old || " "));
    }
    return null;
  }) : /* @__PURE__ */ React2.createElement("div", { style: { color: "#6B7280", fontStyle: "italic" } }, "No changes detected"))), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, marginBottom: 8, color: "#059669" } }, "\u2705 Selected Version (v", diffData.currentVersion || "N/A", ") (New/Changed)"), /* @__PURE__ */ React2.createElement("div", { style: {
    width: "100%",
    minHeight: 400,
    maxHeight: 500,
    fontFamily: "monospace",
    fontSize: 11,
    padding: 8,
    border: "2px solid #86EFAC",
    borderRadius: 4,
    background: "#D1FAE5",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word"
  } }, diffData.diff && diffData.diff.length > 0 ? diffData.diff.map((change, idx) => {
    if (change.type === "added" || change.type === "modified") {
      return /* @__PURE__ */ React2.createElement("div", { key: idx, style: {
        padding: "2px 4px",
        background: change.type === "modified" ? "#A7F3D0" : "#D1FAE5",
        borderLeft: change.type === "modified" ? "3px solid #059669" : "3px solid #10B981",
        marginBottom: 1
      } }, /* @__PURE__ */ React2.createElement("span", { style: { color: "#065F46", marginRight: 8, userSelect: "none", fontWeight: 600 } }, "L", change.line), /* @__PURE__ */ React2.createElement("span", { style: { color: "#047857" } }, change.new || " "));
    }
    return null;
  }) : /* @__PURE__ */ React2.createElement("div", { style: { color: "#6B7280", fontStyle: "italic" } }, "No changes detected")))), /* @__PURE__ */ React2.createElement("div", { style: { borderTop: "1px solid #E5E7EB", paddingTop: 16 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, marginBottom: 8, fontSize: 16 } }, "Changes Summary"), /* @__PURE__ */ React2.createElement("div", { style: {
    marginBottom: 16,
    padding: 12,
    background: diffData.diff && diffData.diff.filter((d) => d.type === "modified").length > 0 ? "#FEF3C7" : "#F3F4F6",
    borderRadius: 6,
    border: `2px solid ${diffData.diff && diffData.diff.filter((d) => d.type === "modified").length > 0 ? "#F59E0B" : "#D1D5DB"}`
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, marginBottom: 4 } }, "\u{1F4CA} Change Statistics"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "\u2022 ", /* @__PURE__ */ React2.createElement("strong", null, diffData.diff ? diffData.diff.filter((d) => d.type === "modified").length : 0), " lines modified/changed"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "\u2022 ", /* @__PURE__ */ React2.createElement("strong", null, diffData.diff ? diffData.diff.filter((d) => d.type === "unchanged").length : 0), " lines unchanged"), (diffData.current || "").split("\n").length !== (diffData.previous || "").split("\n").length && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#F59E0B", marginTop: 4 } }, "\u26A0\uFE0F Line count changed: Previous (", (diffData.previous || "").split("\n").length, ") \u2192 Current (", (diffData.current || "").split("\n").length, ")")), /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, marginBottom: 8, fontSize: 16 } }, "Line-by-Line Changes"), /* @__PURE__ */ React2.createElement("div", { style: {
    maxHeight: 300,
    overflow: "auto",
    background: "#F9FAFB",
    padding: 12,
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, diffData.diff && diffData.diff.length > 0 ? diffData.diff.filter((change) => change.type !== "unchanged").map((change, idx) => /* @__PURE__ */ React2.createElement("div", { key: idx, style: {
    padding: 10,
    marginBottom: 6,
    background: change.type === "modified" ? "#FFF3CD" : change.type === "added" ? "#D1FAE5" : "#FEE2E2",
    borderRadius: 4,
    fontSize: 12,
    borderLeft: change.type === "modified" ? "3px solid #F59E0B" : change.type === "added" ? "3px solid #10B981" : "3px solid #EF4444"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, marginBottom: 4, color: "#111827" } }, "Line ", change.line, ": ", change.type === "modified" ? "\u270F\uFE0F Modified" : change.type === "added" ? "\u2795 Added" : "\u2796 Removed"), change.type === "modified" || change.type === "removed" ? /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { color: "#7F1D1D", marginBottom: 4, padding: 4, background: "#FEE2E2", borderRadius: 2, fontWeight: 600 } }, /* @__PURE__ */ React2.createElement("strong", null, "- "), " ", change.old || "(empty)"), change.type === "modified" && /* @__PURE__ */ React2.createElement("div", { style: { color: "#065F46", padding: 4, background: "#D1FAE5", borderRadius: 2, fontWeight: 600 } }, /* @__PURE__ */ React2.createElement("strong", null, "+ "), " ", change.new || "(empty)")) : /* @__PURE__ */ React2.createElement("div", { style: { color: "#065F46", padding: 4, background: "#D1FAE5", borderRadius: 2, fontWeight: 600 } }, /* @__PURE__ */ React2.createElement("strong", null, "+ "), " ", change.new || "(empty)"))) : /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center", padding: 20, color: "#6B7280" } }, "No changes detected (configurations are identical)")))))), showComponentTypeManager && /* @__PURE__ */ React2.createElement("div", { style: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1e3
  }, onClick: () => {
    setShowComponentTypeManager(false);
    setEditingComponentType(null);
  } }, /* @__PURE__ */ React2.createElement("div", { style: {
    background: "white",
    borderRadius: 8,
    padding: 24,
    maxWidth: 900,
    width: "90%",
    maxHeight: "90vh",
    overflow: "auto",
    boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)"
  }, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } }, /* @__PURE__ */ React2.createElement("h3", { style: { margin: 0, fontSize: 20, fontWeight: 600 } }, "Manage Component Types"), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        setShowComponentTypeManager(false);
        setEditingComponentType(null);
      },
      style: {
        background: "#EF4444",
        color: "white",
        border: "none",
        borderRadius: 6,
        padding: "8px 16px",
        cursor: "pointer",
        fontSize: 14
      }
    },
    "Close"
  )), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "2px solid #E5E7EB" } }, ["receiver", "processor", "exporter"].map((cat) => /* @__PURE__ */ React2.createElement(
    "button",
    {
      key: cat,
      onClick: () => {
        if (!editingComponentType || editingComponentType.category !== cat) {
          setEditingComponentType({ category: cat, type: "", label: "", config: {}, description: "" });
        }
      },
      style: {
        padding: "10px 20px",
        background: (editingComponentType?.category || "receiver") === cat ? "#3B82F6" : "transparent",
        color: (editingComponentType?.category || "receiver") === cat ? "white" : "#6B7280",
        border: "none",
        borderBottom: (editingComponentType?.category || "receiver") === cat ? "3px solid #2563EB" : "3px solid transparent",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
        textTransform: "capitalize"
      }
    },
    cat,
    "s"
  ))), editingComponentType && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24, padding: 16, background: "#F9FAFB", borderRadius: 6 } }, /* @__PURE__ */ React2.createElement("h4", { style: { margin: "0 0 16px 0", fontSize: 16 } }, editingComponentType.id ? "Edit" : "Add New", " ", editingComponentType.category?.charAt(0).toUpperCase(), editingComponentType.category?.slice(1), " Type"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 } }, 'Type Name (e.g., "my_custom_receiver")'), /* @__PURE__ */ React2.createElement(
    "input",
    {
      type: "text",
      value: editingComponentType.type || "",
      onChange: (e) => setEditingComponentType({ ...editingComponentType, type: e.target.value }),
      placeholder: "my_custom_receiver",
      disabled: !!editingComponentType.isSystem,
      style: { width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 4 }
    }
  )), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 } }, "Display Label"), /* @__PURE__ */ React2.createElement(
    "input",
    {
      type: "text",
      value: editingComponentType.label || "",
      onChange: (e) => setEditingComponentType({ ...editingComponentType, label: e.target.value }),
      placeholder: "My Custom Receiver",
      style: { width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 4 }
    }
  )), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 } }, "Description"), /* @__PURE__ */ React2.createElement(
    "textarea",
    {
      value: editingComponentType.description || "",
      onChange: (e) => setEditingComponentType({ ...editingComponentType, description: e.target.value }),
      placeholder: "Description of this component type...",
      style: { width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 4, minHeight: 60 }
    }
  )), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 } }, "Default Config (JSON)"), /* @__PURE__ */ React2.createElement(
    "textarea",
    {
      value: JSON.stringify(editingComponentType.config || {}, null, 2),
      onChange: (e) => {
        try {
          setEditingComponentType({ ...editingComponentType, config: JSON.parse(e.target.value) });
        } catch (err) {
        }
      },
      placeholder: '{"endpoint": "http://localhost:4317"}',
      style: { width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 4, minHeight: 100, fontFamily: "monospace", fontSize: 12 }
    }
  )), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: async () => {
        try {
          if (editingComponentType.id) {
            await backendSrv6.request({
              url: `/api/plugins/otel-collector-agent-fleet-management/resources/component-types`,
              method: "PATCH",
              data: {
                id: editingComponentType.id,
                label: editingComponentType.label,
                config: editingComponentType.config,
                description: editingComponentType.description
              }
            });
          } else {
            await backendSrv6.post("/api/plugins/otel-collector-agent-fleet-management/resources/component-types", {
              category: editingComponentType.category,
              type: editingComponentType.type,
              label: editingComponentType.label,
              config: editingComponentType.config,
              description: editingComponentType.description
            });
          }
          await loadComponentTypes();
          setEditingComponentType(null);
          alert("Component type saved successfully!");
        } catch (err) {
          alert("Failed to save: " + (err.message || "Unknown error"));
        }
      },
      disabled: !editingComponentType.category || !editingComponentType.type || !editingComponentType.label,
      style: {
        padding: "10px 20px",
        background: !editingComponentType.category || !editingComponentType.type || !editingComponentType.label ? "#D1D5DB" : "#10B981",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: !editingComponentType.category || !editingComponentType.type || !editingComponentType.label ? "not-allowed" : "pointer",
        fontSize: 14,
        fontWeight: 600
      }
    },
    editingComponentType.id ? "Update" : "Create",
    " Type"
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setEditingComponentType(null),
      style: {
        padding: "10px 20px",
        background: "#6B7280",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 14
      }
    },
    "Cancel"
  )))), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("h4", { style: { margin: 0, fontSize: 16 } }, "Existing Types"), !editingComponentType && /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setEditingComponentType({ category: "receiver", type: "", label: "", config: {}, description: "" }),
      style: {
        padding: "6px 12px",
        background: "#3B82F6",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 12
      }
    },
    "+ Add New"
  )), /* @__PURE__ */ React2.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 } }, ["receiver", "processor", "exporter"].map((category) => {
    const types = getTypesForCategory(category);
    return types.map((t) => /* @__PURE__ */ React2.createElement("div", { key: `${category}-${t.value}`, style: {
      padding: 12,
      background: "white",
      border: "1px solid #E5E7EB",
      borderRadius: 6
    } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontWeight: 600 } }, t.label), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", fontFamily: "monospace" } }, t.value), t.description && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#9CA3AF", marginTop: 4 } }, t.description), t.isSystem && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, color: "#3B82F6", fontWeight: 600 } }, "System")), !t.isSystem && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 4 } }, /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: () => setEditingComponentType({ ...t, category }),
        style: { padding: "4px 8px", background: "#3B82F6", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 10 }
      },
      "Edit"
    ), /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: async () => {
          if (confirm(`Delete ${t.label}?`)) {
            try {
              await backendSrv6.request({
                url: `/api/plugins/otel-collector-agent-fleet-management/resources/component-types?id=${t.id}`,
                method: "DELETE"
              });
              await loadComponentTypes();
            } catch (err) {
              alert("Failed to delete: " + (err.message || "Unknown error"));
            }
          }
        },
        style: { padding: "4px 8px", background: "#EF4444", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 10 }
      },
      "Delete"
    )))));
  }))))), showSaveDialog && /* @__PURE__ */ React2.createElement("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2e3 } }, /* @__PURE__ */ React2.createElement("div", { style: { background: "white", borderRadius: 8, padding: 24, maxWidth: 500, width: "90%", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" } }, /* @__PURE__ */ React2.createElement("h3", { style: { marginTop: 0 } }, "Save Configuration Template"), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 } }, "Name *"), /* @__PURE__ */ React2.createElement(
    "input",
    {
      type: "text",
      value: saveName,
      onChange: (e) => setSaveName(e.target.value),
      placeholder: "e.g., Production OTLP Pipeline",
      style: { width: "100%", padding: "8px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 14 }
    }
  )), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 12 } }, /* @__PURE__ */ React2.createElement("label", { style: { display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 } }, "Description"), /* @__PURE__ */ React2.createElement(
    "textarea",
    {
      value: saveDescription,
      onChange: (e) => setSaveDescription(e.target.value),
      placeholder: "Optional description...",
      rows: 3,
      style: { width: "100%", padding: "8px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 14 }
    }
  )), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } }, /* @__PURE__ */ React2.createElement("button", { onClick: () => {
    setShowSaveDialog(false);
    setSaveName("");
    setSaveDescription("");
  }, style: { padding: "8px 16px", background: "#6B7280", color: "white", border: "none", borderRadius: 6, cursor: "pointer" } }, "Cancel"), /* @__PURE__ */ React2.createElement("button", { onClick: saveTemplate, style: { padding: "8px 16px", background: "#3B82F6", color: "white", border: "none", borderRadius: 6, cursor: "pointer" } }, "Save")))));
}

// pages/App.tsx
var PLUGIN_ID2 = "otel-collector-agent-fleet-management";
var RESOURCE_ROOT2 = `/api/plugins/${PLUGIN_ID2}/resources`;
var RESOURCE_PREFIX2 = `${RESOURCE_ROOT2}/plugin-api`;
var PROXY_PREFIX2 = `/api/plugin-proxy/${PLUGIN_ID2}/plugin-api`;
var STANDALONE_PREFIX2 = "/plugin-api";
var DEFAULT_OPAMP_WS2 = "ws://localhost:4321/v1/opamp";
var normalizeOpampPath = (pathname) => {
  if (!pathname || pathname.trim() === "" || pathname === "/") {
    return "/v1/opamp";
  }
  const trimmed = pathname.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1/opamp")) {
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  const normalized = `${trimmed}/v1/opamp`;
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
};
var coerceWebsocketUrlFromServer = (value) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    let protocol = parsed.protocol;
    if (protocol === "http:") {
      protocol = "ws:";
    } else if (protocol === "https:") {
      protocol = "wss:";
    } else if (protocol !== "ws:" && protocol !== "wss:") {
      protocol = "ws:";
    }
    const path = normalizeOpampPath(parsed.pathname);
    const search = parsed.search ?? "";
    return `${protocol}//${parsed.host}${path}${search}`;
  } catch {
  }
  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
    const cleaned = trimmed.replace(/\/+$/, "");
    if (/\/v1\/opamp$/i.test(cleaned)) {
      return cleaned;
    }
    return `${cleaned}/v1/opamp`;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return coerceWebsocketUrlFromServer(trimmed);
  }
  return null;
};
var coerceWebsocketUrlFromEndpoint = (value) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return coerceWebsocketUrlFromServer(trimmed);
  }
  if (/^[\w\.\-]+:\d+$/.test(trimmed)) {
    const sanitized = trimmed.replace(/^0\.0\.0\.0/, "localhost");
    return `ws://${sanitized}/v1/opamp`;
  }
  return null;
};
var buildOpampConnectionUrl = (serverUrl, endpoint) => {
  return coerceWebsocketUrlFromServer(serverUrl) ?? coerceWebsocketUrlFromEndpoint(endpoint) ?? DEFAULT_OPAMP_WS2;
};
var detectRuntimeMode2 = () => {
  if (typeof window === "undefined") {
    return "grafana";
  }
  const coerceMode = (value) => {
    if (!value) {
      return null;
    }
    const lower = value.toLowerCase();
    if (lower === "grafana" || lower === "standalone") {
      return lower;
    }
    return null;
  };
  let storedMode = null;
  try {
    storedMode = window.localStorage?.getItem("otelFleetAppMode") ?? null;
  } catch {
    storedMode = null;
  }
  const forcedMode = coerceMode(window.__OTEL_FLEET_APP_MODE__) || coerceMode(new URLSearchParams(window.location.search).get("mode")) || coerceMode(storedMode);
  if (forcedMode) {
    return forcedMode;
  }
  const grafanaMarkers = [
    window.__grafanaBootData,
    window.grafanaBootData,
    window.__grafana_public_path__
  ];
  if (grafanaMarkers.some(Boolean)) {
    return "grafana";
  }
  if (typeof document !== "undefined") {
    const grafanaRoot = document.getElementById("grafana-app") || document.getElementById("grafanaRoot") || document.querySelector("grafana-app");
    if (grafanaRoot) {
      return "grafana";
    }
  }
  const path = window.location?.pathname ?? "";
  if (path.includes("/api/plugins/") || path.includes("/a/")) {
    return "grafana";
  }
  return "standalone";
};
var runtimeMode5 = detectRuntimeMode2();
var isRunningInGrafana5 = runtimeMode5 === "grafana";
var detectGrafanaTransport2 = () => {
  if (!isRunningInGrafana5) {
    return "resources";
  }
  const coerce = (value) => {
    if (!value) {
      return null;
    }
    const lower = value.toLowerCase();
    if (lower === "proxy" || lower === "resources") {
      return lower;
    }
    if (lower === "callresource") {
      return "resources";
    }
    return null;
  };
  let stored = null;
  try {
    stored = window.localStorage?.getItem("otelFleetTransport") ?? null;
  } catch {
    stored = null;
  }
  return coerce(window.__OTEL_FLEET_TRANSPORT__) || coerce(new URLSearchParams(window.location.search).get("transport")) || coerce(stored) || "proxy";
};
var grafanaTransport5 = detectGrafanaTransport2();
var normalizeUrl2 = (rawUrl) => {
  if (!rawUrl) {
    if (!isRunningInGrafana5) {
      return STANDALONE_PREFIX2;
    }
    return grafanaTransport5 === "proxy" ? PROXY_PREFIX2 : RESOURCE_PREFIX2;
  }
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  const base = !isRunningInGrafana5 ? STANDALONE_PREFIX2 : grafanaTransport5 === "proxy" ? PROXY_PREFIX2 : RESOURCE_PREFIX2;
  let urlWithoutBase = rawUrl;
  if (urlWithoutBase.startsWith(base)) {
    return urlWithoutBase;
  }
  if (urlWithoutBase.startsWith(RESOURCE_PREFIX2)) {
    urlWithoutBase = urlWithoutBase.slice(RESOURCE_PREFIX2.length);
  } else if (urlWithoutBase.startsWith(RESOURCE_ROOT2)) {
    urlWithoutBase = urlWithoutBase.slice(RESOURCE_ROOT2.length);
  } else if (urlWithoutBase.startsWith(PROXY_PREFIX2)) {
    urlWithoutBase = urlWithoutBase.slice(PROXY_PREFIX2.length);
  } else if (urlWithoutBase.startsWith(STANDALONE_PREFIX2)) {
    urlWithoutBase = urlWithoutBase.slice(STANDALONE_PREFIX2.length);
  } else if (urlWithoutBase.startsWith(`/api/plugins/${PLUGIN_ID2}/resources`)) {
    const parts = urlWithoutBase.split("/resources");
    if (parts.length > 1) {
      urlWithoutBase = parts.slice(1).join("/resources");
    }
  }
  urlWithoutBase = urlWithoutBase.replace(/^\/plugin-api(\/|$)/, "/");
  urlWithoutBase = urlWithoutBase.replace(/^\/r(\/|$)/, "/");
  if (!urlWithoutBase.startsWith("/")) {
    urlWithoutBase = `/${urlWithoutBase}`;
  }
  return `${base}${urlWithoutBase}`;
};
var classificationStyles = {
  direct: {
    label: "Direct agent",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    color: "#1E3A8A"
  },
  supervisor: {
    label: "Supervisor",
    bg: "#F5F3FF",
    border: "#DDD6FE",
    color: "#6D28D9"
  },
  unclassified: {
    label: "Unclassified",
    bg: "#FEF2F2",
    border: "#FECACA",
    color: "#B91C1C"
  }
};
var isSupervisorAgent = (agent) => {
  const labels = agent.labels || {};
  const supervisorMode = (labels["supervisor.mode"] || "").toLowerCase();
  const agentType = (labels["agent.type"] || "").toLowerCase();
  return supervisorMode === "true" || agentType === "supervisor";
};
var isUnclassifiedAgent = (agent) => {
  const classificationStatus = (agent.labels?.["classification.status"] || "").toLowerCase();
  return classificationStatus === "unclassified" || agent.status === "unclassified";
};
var getAgentClassification = (agent) => {
  if (isUnclassifiedAgent(agent)) {
    return "unclassified";
  }
  if (isSupervisorAgent(agent)) {
    return "supervisor";
  }
  return "direct";
};
var rawBackendSrv5 = __GRAFANA_RUNTIME__.getBackendSrv();
var capabilityOrder2 = [
  "accepts_remote_config",
  "reports_effective_config",
  "reports_health",
  "reports_own_logs",
  "reports_own_metrics",
  "reports_own_traces",
  "accepts_restart_command",
  "reports_remote_config",
  "reports_status",
  "reports_available_components"
];
var capabilityMeta2 = {
  accepts_remote_config: {
    label: "Remote Config",
    description: "Accepts remote configuration updates pushed via OpAMP.",
    icon: "\u2699\uFE0F",
    tone: { bg: "#EEF2FF", border: "#C7D2FE", color: "#3730A3" }
  },
  reports_effective_config: {
    label: "Reports Config",
    description: "Reports effective configuration back to the OpAMP server.",
    icon: "\u{1F9FE}",
    tone: { bg: "#ECFDF5", border: "#A7F3D0", color: "#065F46" }
  },
  reports_health: {
    label: "Health",
    description: "Sends health status updates (required for health widget).",
    icon: "\u2764\uFE0F",
    tone: { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" }
  },
  reports_own_logs: {
    label: "Logs",
    description: "Streams self-observed logs via OpAMP telemetry endpoint.",
    icon: "\u{1F4DC}",
    tone: { bg: "#FDF2F8", border: "#FBCFE8", color: "#9D174D" }
  },
  reports_own_metrics: {
    label: "Metrics",
    description: "Streams self-observed metrics via OpAMP telemetry endpoint.",
    icon: "\u{1F4C8}",
    tone: { bg: "#ECFEFF", border: "#BAE6FD", color: "#0C4A6E" }
  },
  reports_own_traces: {
    label: "Traces",
    description: "Streams self-observed traces via OpAMP telemetry endpoint.",
    icon: "\u{1F6F0}\uFE0F",
    tone: { bg: "#FFF7ED", border: "#FED7AA", color: "#9A3412" }
  },
  accepts_restart_command: {
    label: "Restart Cmd",
    description: "Can be restarted remotely from the OpAMP server.",
    icon: "\u{1F501}",
    tone: { bg: "#E0E7FF", border: "#C7D2FE", color: "#312E81" }
  },
  reports_remote_config: {
    label: "Config Status",
    description: "Reports remote configuration hashes/status for auditing.",
    icon: "\u{1F6F0}\uFE0F",
    tone: { bg: "#F3F4F6", border: "#E5E7EB", color: "#111827" }
  },
  reports_status: {
    label: "Agent Status",
    description: "Sends regular status updates (uptime, metadata, etc.).",
    icon: "\u{1F4E1}",
    tone: { bg: "#F0FDFA", border: "#99F6E4", color: "#115E59" }
  },
  reports_available_components: {
    label: "Component Inventory",
    description: "Reports available receivers/processors/exporters.",
    icon: "\u{1F9E9}",
    tone: { bg: "#EFF6FF", border: "#BFDBFE", color: "#1E3A8A" }
  }
};
var isCapabilityEnabled2 = (value) => {
  if (value === void 0 || value === null) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return true;
};
var CapabilityBadges2 = ({
  capabilities,
  limit = 5,
  compact = false,
  onOpenDetails
}) => {
  const badges = React2.useMemo(() => {
    if (!capabilities) {
      return [];
    }
    const seen = /* @__PURE__ */ new Set();
    const enabledPairs = [];
    const orderedKeys = [...capabilityOrder2, ...Object.keys(capabilities)];
    orderedKeys.forEach((key) => {
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      if (!isCapabilityEnabled2(capabilities[key])) {
        return;
      }
      const meta = capabilityMeta2[key] || {
        label: key.replace(/_/g, " "),
        description: "Reported capability",
        icon: "\u2728",
        tone: { bg: "#F3F4F6", border: "#E5E7EB", color: "#111827" }
      };
      enabledPairs.push({ key, meta, rawKey: key });
    });
    return enabledPairs;
  }, [capabilities]);
  if (!capabilities || badges.length === 0) {
    return null;
  }
  const displayed = badges.slice(0, limit);
  const remaining = badges.length - displayed.length;
  return /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" } }, displayed.map(({ key, meta }) => /* @__PURE__ */ React2.createElement(
    "span",
    {
      key,
      title: meta.description,
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
        padding: compact ? "2px 6px" : "4px 8px",
        borderRadius: 999,
        background: meta.tone.bg,
        border: `1px solid ${meta.tone.border}`,
        color: meta.tone.color,
        whiteSpace: "nowrap"
      }
    },
    /* @__PURE__ */ React2.createElement("span", null, meta.icon),
    /* @__PURE__ */ React2.createElement("span", null, meta.label)
  )), remaining > 0 && /* @__PURE__ */ React2.createElement(
    "span",
    {
      style: { fontSize: 10, color: "#3B82F6", cursor: onOpenDetails ? "pointer" : "default", textDecoration: onOpenDetails ? "underline" : "none" },
      title: "Additional capabilities reported by this agent",
      onClick: (e) => {
        e.stopPropagation();
        onOpenDetails?.();
      }
    },
    "+",
    remaining,
    " more"
  ));
};
var tenantHeaderValue2 = null;
var setTenantHeaderValue = (value) => {
  tenantHeaderValue2 = value && value.trim() ? value.trim() : null;
};
var normalizeRequestHeaders2 = (incoming) => {
  if (!incoming) {
    return {};
  }
  if (incoming instanceof Headers) {
    const headers = {};
    incoming.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }
  if (Array.isArray(incoming)) {
    return incoming.reduce((acc, [key, value]) => {
      if (key) {
        acc[key] = String(value ?? "");
      }
      return acc;
    }, {});
  }
  return { ...incoming };
};
var fetchWithAuth2 = async ({ responseType, headers: requestHeaders, ...rest }) => {
  const headers = normalizeRequestHeaders2(requestHeaders);
  if (tenantHeaderValue2 && !headers["X-Scoper-Tenant"]) {
    headers["X-Scoper-Tenant"] = tenantHeaderValue2;
  }
  const response = await lastValueFrom(
    rawBackendSrv5.fetch({
      responseType: responseType ?? "json",
      ...rest,
      headers
    })
  );
  if (response.status >= 200 && response.status < 300) {
    return response.data;
  }
  const error = new Error(response.statusText || `Request failed with status ${response.status}`);
  error.status = response.status;
  error.statusText = response.statusText;
  error.data = response.data;
  throw error;
};
var backendSrv5 = {
  get: (url, options = {}) => fetchWithAuth2({ ...options, url: normalizeUrl2(url), method: "GET" }),
  post: (url, data, options = {}) => fetchWithAuth2({ ...options, url: normalizeUrl2(url), data, method: "POST" }),
  delete: (url, options = {}) => fetchWithAuth2({ ...options, url: normalizeUrl2(url), method: "DELETE" }),
  patch: (url, data, options = {}) => fetchWithAuth2({ ...options, url: normalizeUrl2(url), data, method: "PATCH" }),
  request: (options) => fetchWithAuth2({
    ...options,
    url: normalizeUrl2(options.url ?? ""),
    method: options.method
  })
};
var getStatusBadge2 = (status) => {
  const styles = {
    online: { bg: "#10B981", color: "white", icon: "\u25CF" },
    offline: { bg: "#EF4444", color: "white", icon: "\u25CF" },
    degraded: { bg: "#F59E0B", color: "white", icon: "\u26A0" },
    unknown: { bg: "#6B7280", color: "white", icon: "\u25CF" }
  };
  const s = styles[status] || styles.unknown;
  return /* @__PURE__ */ React2.createElement("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500,
    background: s.bg,
    color: s.color
  } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 8 } }, s.icon), status);
};
var App = () => {
  const [activeTab, setActiveTab] = useState2("collectors");
  const [agents, setAgents] = useState2([]);
  const [bridges, setBridges] = useState2([]);
  const [selectedAgent, setSelectedAgent] = useState2(null);
  const [error, setError] = useState2("");
  const [loading, setLoading] = useState2(true);
  const [refreshing, setRefreshing] = useState2(false);
  const [searchQuery, setSearchQuery] = useState2("");
  const [selectedLabelFilter, setSelectedLabelFilter] = useState2(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState2(false);
  const [detailTab, setDetailTab] = useState2("overview");
  const [detailPanelMonitoringData, setDetailPanelMonitoringData] = useState2(null);
  const [loadingDetailMonitoring, setLoadingDetailMonitoring] = useState2(false);
  const [groupByDeploymentType, setGroupByDeploymentType] = useState2(true);
  const [expandedGroups, setExpandedGroups] = useState2(/* @__PURE__ */ new Set());
  const [bridgeCapabilitySheet, setBridgeCapabilitySheet] = useState2({
    bridge: null,
    open: false
  });
  const closeBridgeCapabilitySheet = () => setBridgeCapabilitySheet({ bridge: null, open: false });
  const [selectedOrgId, setSelectedOrgId] = useState2(null);
  const [currentOrgName, setCurrentOrgName] = useState2("");
  const [agentActivityLog, setAgentActivityLog] = useState2([]);
  const [grafanaOrgName, setGrafanaOrgName] = useState2("");
  const [opampConnectionUrl, setOpampConnectionUrl] = useState2(DEFAULT_OPAMP_WS2);
  const [isAdmin, setIsAdmin] = useState2(false);
  const [userContext, setUserContext] = useState2({
    name: "",
    role: "",
    isAdmin: false
  });
  const [collectorTotals, setCollectorTotals] = useState2({
    direct: 0,
    directOnline: 0,
    managed: 0,
    managedOnline: 0,
    total: 0,
    online: 0
  });
  const [telemetrySettings, setTelemetrySettings] = useState2(getDefaultTelemetrySettingsState());
  const [telemetryLoading, setTelemetryLoading] = useState2(false);
  const [telemetrySaving, setTelemetrySaving] = useState2(false);
  const [telemetryDrawerOpen, setTelemetryDrawerOpen] = useState2(false);
  const [telemetryDrawerMode, setTelemetryDrawerMode] = useState2("metrics");
  const [telemetryDatasourceHints, setTelemetryDatasourceHints] = useState2({});
  const [orgOptions, setOrgOptions] = useState2([]);
  const selectedAgentTenantName = useMemo2(() => currentOrgName.trim(), [currentOrgName]);
  const displayUserName = useMemo2(() => {
    const raw = (userContext.name || "").trim();
    if (!raw) {
      return "unknown";
    }
    if (selectedOrgId && raw.endsWith(` ${selectedOrgId}`)) {
      const sliced = raw.slice(0, raw.length - ` ${selectedOrgId}`.length).trim();
      if (sliced) {
        return sliced;
      }
    }
    return raw;
  }, [userContext.name, selectedOrgId]);
  const displayOrgBadge = useMemo2(() => {
    if (currentOrgName && selectedOrgId) {
      return `${currentOrgName} (#${selectedOrgId})`;
    }
    if (currentOrgName) {
      return currentOrgName;
    }
    if (selectedOrgId) {
      return `Org #${selectedOrgId}`;
    }
    return "Organization unknown";
  }, [currentOrgName, selectedOrgId]);
  const handleDeleteBridge = async (bridgeUid, bridgeName) => {
    if (!window.confirm(`Are you sure you want to delete bridge "${bridgeName}"?

This will remove the bridge from the UI. Collectors managed by this bridge will be cleaned up automatically if they remain offline for 24 hours.`)) {
      return;
    }
    try {
      const url = `/api/plugins/otel-collector-agent-fleet-management/resources/bridges/${bridgeUid}/delete`;
      await backendSrv5.post(url);
      await fetchBridges();
      await fetchAgents();
    } catch (err) {
      alert(`Failed to delete bridge: ${err.message || "Unknown error"}`);
    }
  };
  const loadTelemetrySettings = useCallback2(async () => {
    setTelemetryLoading(true);
    try {
      const response = await backendSrv5.get("/telemetry-settings");
      const incoming = response?.settings ?? response;
      const normalized = normalizeTelemetrySettingsState(incoming);
      setTelemetrySettings(normalized);
      if (incoming?.hints && typeof incoming.hints === "object") {
        setTelemetryDatasourceHints(incoming.hints);
      }
    } catch (err) {
      console.error("Failed to load telemetry settings", err);
    } finally {
      setTelemetryLoading(false);
    }
  }, []);
  const saveTelemetrySettings = useCallback2(
    async (next) => {
      setTelemetrySaving(true);
      try {
        await backendSrv5.post("/telemetry-settings", next);
        setTelemetrySettings(next);
      } catch (err) {
        console.error("Failed to save telemetry settings", err);
        setError(err?.message || "Failed to save telemetry settings");
      } finally {
        setTelemetrySaving(false);
      }
    },
    [backendSrv5]
  );
  const handleToggleMetrics = async (next) => {
    const updated = {
      ...telemetrySettings,
      metrics: { ...telemetrySettings.metrics, enabled: next }
    };
    setTelemetrySettings(updated);
    await saveTelemetrySettings(updated);
  };
  const handleToggleLogs = async (next) => {
    const updated = {
      ...telemetrySettings,
      logs: { ...telemetrySettings.logs, enabled: next }
    };
    setTelemetrySettings(updated);
    await saveTelemetrySettings(updated);
  };
  const handleOpenTelemetryDrawer = (mode) => {
    setTelemetryDrawerMode(mode);
    setTelemetryDrawerOpen(true);
  };
  const loadOrgOptions = useCallback2(async () => {
    try {
      const orgs = await rawBackendSrv5.get("/api/orgs");
      if (Array.isArray(orgs) && orgs.length > 0) {
        const mapped = orgs.filter((o) => typeof o.id === "number").map((o) => ({ id: o.id, name: String(o.name || `Org ${o.id}`) }));
        setOrgOptions((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          mapped.forEach((m) => {
            if (!ids.has(m.id)) {
              merged.push(m);
            }
          });
          return merged;
        });
      }
    } catch (err) {
    }
  }, []);
  const fetchBridges = async () => {
    try {
      const response = await backendSrv5.get("/api/plugins/otel-collector-agent-fleet-management/resources/bridges");
      console.log("DEBUG: Fetched bridges response:", { bridges: response.bridges, count: response.bridges?.length || 0 });
      if (response.bridges && response.bridges.length > 0) {
        response.bridges.forEach((bridge, idx) => {
          console.log(`DEBUG: Bridge ${idx}:`, {
            agentUid: bridge.agentUid?.substring(0, 8),
            name: bridge.name,
            collectorsCount: bridge.collectors?.length || 0,
            collectors: bridge.collectors?.map((c) => ({ uid: c.agentUid?.substring(0, 8), name: c.name }))
          });
        });
      }
      setBridges(response.bridges || []);
    } catch (err) {
      console.error("Failed to fetch bridges:", err);
    }
  };
  const fetchAgents = async () => {
    try {
      setError("");
      const response = await backendSrv5.get("/api/plugins/otel-collector-agent-fleet-management/resources/agents");
      const incomingAgents = response.items || [];
      console.log("DEBUG: fetchAgents received", incomingAgents.length, "agents:", incomingAgents.map((a) => ({
        agentUid: a.agentUid?.substring(0, 8),
        name: a.name,
        status: a.status,
        labels: a.labels
      })));
      setAgents(incomingAgents);
      const directOnline = incomingAgents.filter((a) => a.status === "online").length;
      const totals = response.totals || {};
      const backendDirectOnline = totals.directOnline ?? totals.directOnlline ?? directOnline;
      const backendManagedOnline = totals.managedOnline ?? 0;
      const mergedTotals = {
        direct: totals.directAgents ?? incomingAgents.length,
        directOnline: backendDirectOnline,
        managed: totals.managedCollectors ?? 0,
        managedOnline: backendManagedOnline,
        total: totals.totalCollectors ?? (totals.directAgents ?? incomingAgents.length) + (totals.managedCollectors ?? 0),
        online: totals.onlineCollectors ?? backendDirectOnline + backendManagedOnline
      };
      setCollectorTotals(mergedTotals);
      if (response.userRole) {
        const rawRole = response.userRole.role;
        const normalizedRole = (() => {
          if (typeof rawRole === "string") {
            const lower = rawRole.toLowerCase();
            if (lower.includes("admin")) return "Admin";
            if (lower.includes("editor")) return "Editor";
            if (lower.includes("viewer")) return "Viewer";
            return rawRole;
          }
          if (typeof rawRole === "number") {
            if (rawRole === 2) return "Admin";
            if (rawRole === 1) return "Editor";
            return "Viewer";
          }
          return response.userRole.isAdmin ? "Admin" : "Viewer";
        })();
        const inferredIsAdmin = response.userRole.isAdmin === true || normalizedRole === "Admin";
        setIsAdmin(inferredIsAdmin);
        setUserContext((prev) => ({
          name: response.userRole.userDisplayName || response.userRole.userName || prev.name,
          role: normalizedRole || prev.role,
          isAdmin: inferredIsAdmin
        }));
      }
      const effectiveOrgId = typeof response.grafanaOrgId === "number" ? response.grafanaOrgId : typeof response.orgId === "number" ? response.orgId : void 0;
      if (typeof effectiveOrgId === "number") {
        setSelectedOrgId(effectiveOrgId);
      }
      if (response.grafanaOrgName || response.orgName) {
        setCurrentOrgName(response.grafanaOrgName || response.orgName);
      }
      await fetchBridges();
    } catch (err) {
      console.error("Failed to fetch agents:", err);
      setError(err.message || "Failed to fetch agents");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  const loadOpampSettings = useCallback2(async () => {
    try {
      const response = await backendSrv5.get("/settings");
      const derived = buildOpampConnectionUrl(response?.opampServerURL, response?.opampEndpoint);
      setOpampConnectionUrl(derived);
    } catch (err) {
      console.error("Failed to load OpAMP settings:", err);
    }
  }, []);
  const loadUserContext = useCallback2(async () => {
    try {
      const response = await backendSrv5.get("/user-role");
      if (response) {
        const displayName = response.userDisplayName || response.userName || "unknown";
        const rawRole = response.role;
        const normalizedRole = (() => {
          if (typeof rawRole === "string") {
            const lower = rawRole.toLowerCase();
            if (lower.includes("admin")) return "Admin";
            if (lower.includes("editor")) return "Editor";
            if (lower.includes("viewer")) return "Viewer";
            return rawRole;
          }
          if (typeof rawRole === "number") {
            if (rawRole === 2) return "Admin";
            if (rawRole === 1) return "Editor";
            return "Viewer";
          }
          return response.isAdmin ? "Admin" : "Viewer";
        })();
        setUserContext({
          name: displayName,
          role: normalizedRole,
          isAdmin: response.isAdmin === true || response.isAdmin === "true" || normalizedRole === "Admin"
        });
        if (typeof response.grafanaOrgId === "number") {
          setSelectedOrgId(response.grafanaOrgId);
        }
        if (response.grafanaOrgName) {
          setCurrentOrgName(response.grafanaOrgName);
        }
        setIsAdmin(response.isAdmin === true || normalizedRole === "Admin");
      }
    } catch (err) {
      console.error("Failed to load user context:", err);
    }
  }, []);
  const loadGrafanaOrgContext = useCallback2(async () => {
    try {
      const org = await rawBackendSrv5.get("/api/org");
      const orgName = org && org.name ? String(org.name) : "";
      setGrafanaOrgName(orgName);
      setTenantHeaderValue(orgName);
      if (org && typeof org.id === "number") {
        setOrgOptions([{ id: org.id, name: orgName }]);
      }
    } catch (err) {
      console.error("Failed to load Grafana org context:", err);
    }
  }, []);
  useEffect2(() => {
    const init = async () => {
      await loadGrafanaOrgContext();
      await loadOrgOptions();
      await loadUserContext();
      await fetchAgents();
      await loadTelemetrySettings();
    };
    init();
    loadOpampSettings();
    const interval = setInterval(fetchAgents, 1e4);
    return () => clearInterval(interval);
  }, [loadGrafanaOrgContext, loadUserContext, loadOpampSettings, loadTelemetrySettings]);
  useEffect2(() => {
    if (!currentOrgName && grafanaOrgName) {
      setCurrentOrgName(grafanaOrgName);
    }
  }, [grafanaOrgName, currentOrgName]);
  const handleRefresh = () => {
    setRefreshing(true);
    fetchAgents();
  };
  const [pushingConfig, setPushingConfig] = useState2(null);
  const handlePushConfig = async (agentUID, config, configId) => {
    setPushingConfig(agentUID);
    try {
      setError("");
      let configToPush = config;
      if (!configToPush || configToPush.trim() === "") {
        try {
          const configsResponse = await backendSrv5.get(`/api/plugins/otel-collector-agent-fleet-management/resources/configs?agent_uid=${agentUID}`);
          const approvedConfig = (configsResponse.items || []).find((c) => c.approvalStatus === "approved");
          if (approvedConfig) {
            const fullConfigResponse = await backendSrv5.get(`/api/plugins/otel-collector-agent-fleet-management/resources/configs/${approvedConfig.id}`);
            configToPush = fullConfigResponse.config || "";
            configId = fullConfigResponse.id;
          } else {
            alert("No approved configuration found for this agent. Please generate and approve a configuration first.");
            setPushingConfig(null);
            return;
          }
        } catch (err) {
          alert("Failed to fetch configuration: " + (err.message || "Unknown error"));
          setPushingConfig(null);
          return;
        }
      }
      if (!configToPush || configToPush.trim() === "") {
        alert("Please generate a configuration first in the Configurations tab");
        setPushingConfig(null);
        return;
      }
      const url = `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/operations${configId ? `?config_id=${configId}` : ""}`;
      await backendSrv5.post(url, { action: "push-config", config: configToPush });
      alert("Configuration pushed successfully!");
    } catch (err) {
      setError(err.message || "Failed to push config");
      alert("Failed to push config: " + (err.message || "Unknown error"));
    } finally {
      setPushingConfig(null);
    }
  };
  const [upgradingAgent, setUpgradingAgent] = useState2(null);
  const handleUpgrade = async (agentUID) => {
    const confirmUpgrade = window.confirm(
      "\u26A0\uFE0F Upgrading will restart this collector and update only the collector binary/image. Please review the release notes and ensure your operator/CRDs support the new version.\n\nContinue with the upgrade?"
    );
    if (!confirmUpgrade) {
      return;
    }
    setUpgradingAgent(agentUID);
    try {
      setError("");
      await backendSrv5.post(
        `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agentUID}/operations`,
        { action: "upgrade" }
      );
      alert("Upgrade command sent successfully! The agent will restart when ready.");
    } catch (err) {
      setError(err.message || "Failed to upgrade agent");
      alert("Failed to upgrade agent: " + (err.message || "Unknown error"));
    } finally {
      setUpgradingAgent(null);
    }
  };
  useEffect2(() => {
    if (showDetailsPanel && selectedAgent && (detailTab === "capabilities" || detailTab === "activity")) {
      setLoadingDetailMonitoring(true);
      const loadDetailMonitoring = async () => {
        try {
          const [telemetryResponse, healthResponse] = await Promise.all([
            backendSrv5.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${selectedAgent.agentUid}/telemetry?limit=50`).catch(() => ({ items: [] })),
            backendSrv5.get(`/api/plugins/otel-collector-agent-fleet-management/resources/agents/${selectedAgent.agentUid}/health?limit=20`).catch(() => ({ items: [], current: {} }))
          ]);
          setDetailPanelMonitoringData({
            telemetry: telemetryResponse.items || [],
            health: healthResponse
          });
        } catch (err) {
          console.error("Failed to load detail monitoring data:", err);
          setDetailPanelMonitoringData({ telemetry: [], health: { items: [], current: {} } });
        } finally {
          setLoadingDetailMonitoring(false);
        }
      };
      loadDetailMonitoring();
    } else {
      setDetailPanelMonitoringData(null);
    }
  }, [selectedAgent?.agentUid, detailTab, showDetailsPanel]);
  const allLabels = /* @__PURE__ */ new Map();
  agents.forEach((agent) => {
    if (agent.labels) {
      Object.entries(agent.labels).forEach(([key, value]) => {
        if (!allLabels.has(key)) {
          allLabels.set(key, /* @__PURE__ */ new Set());
        }
        allLabels.get(key).add(value);
      });
    }
  });
  const sortedAgents = [...agents].sort((a, b) => {
    const statusOrder = { online: 0, degraded: 1, offline: 2, unknown: 3 };
    const aOrder = statusOrder[a.status] ?? 3;
    const bOrder = statusOrder[b.status] ?? 3;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.lastSeen && b.lastSeen) {
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    }
    if (a.lastSeen) return -1;
    if (b.lastSeen) return 1;
    return 0;
  });
  const filteredAgents = sortedAgents.filter((a) => {
    if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase()) && !a.agentUid.toLowerCase().includes(searchQuery.toLowerCase()) && !Object.values(a.labels || {}).some((v) => v.toLowerCase().includes(searchQuery.toLowerCase()))) {
      return false;
    }
    if (selectedLabelFilter) {
      return a.labels && a.labels[selectedLabelFilter.key] === selectedLabelFilter.value;
    }
    return true;
  });
  const bridgeAgentUIDs = useMemo2(() => {
    const identifiers = /* @__PURE__ */ new Set();
    bridges.forEach((bridge) => {
      if (bridge.agentUid) {
        identifiers.add(bridge.agentUid);
      }
    });
    return identifiers;
  }, [bridges]);
  const bridgeCollectorUIDs = useMemo2(() => {
    const identifiers = /* @__PURE__ */ new Set();
    bridges.forEach((bridge) => {
      (bridge.collectors || []).forEach((collector) => {
        if (collector.agentUid) {
          identifiers.add(collector.agentUid);
        }
      });
    });
    return identifiers;
  }, [bridges]);
  const nonBridgeAgents = useMemo2(
    () => filteredAgents.filter((agent) => !bridgeAgentUIDs.has(agent.agentUid) && !bridgeCollectorUIDs.has(agent.agentUid)),
    [filteredAgents, bridgeAgentUIDs, bridgeCollectorUIDs]
  );
  const classifiedAgents = useMemo2(() => {
    const direct = [];
    const supervisors = [];
    const unclassified = [];
    nonBridgeAgents.forEach((agent) => {
      const classification = getAgentClassification(agent);
      if (classification === "supervisor") {
        supervisors.push(agent);
      } else if (classification === "unclassified") {
        unclassified.push(agent);
      } else {
        direct.push(agent);
      }
    });
    return { direct, supervisors, unclassified };
  }, [nonBridgeAgents]);
  const { direct: directAgents, supervisors: supervisorAgents, unclassified: unclassifiedAgents } = classifiedAgents;
  const classificationSummaryItems = useMemo2(
    () => [
      { key: "direct", label: "Direct agents", count: directAgents.length, bg: "#EEF2FF", border: "#C7D2FE", color: "#1E3A8A" },
      { key: "supervisor", label: "Supervisors", count: supervisorAgents.length, bg: "#F5F3FF", border: "#DDD6FE", color: "#6D28D9" },
      { key: "unclassified", label: "Unclassified", count: unclassifiedAgents.length, bg: "#FEF2F2", border: "#FECACA", color: "#B91C1C" }
    ].filter((item) => item.count > 0),
    [directAgents.length, supervisorAgents.length, unclassifiedAgents.length]
  );
  const groupedAgents = groupByDeploymentType ? (() => {
    const groups = {};
    nonBridgeAgents.forEach((agent) => {
      const deploymentType = agent.labels?.["deployment.type"] || agent.labels?.["deployment-type"] || agent.labels?.["deployment_type"] || "unknown";
      if (!groups[deploymentType]) {
        groups[deploymentType] = [];
      }
      groups[deploymentType].push(agent);
    });
    return groups;
  })() : null;
  const derivedBridgeCount = bridges.reduce((sum, b) => sum + (b.collectors?.length || 0), 0);
  const derivedBridgeOnline = bridges.reduce((sum, b) => sum + (b.collectors?.filter((c) => c.status === "online").length || 0), 0);
  const totalCollectorsDisplay = collectorTotals.total || agents.length + derivedBridgeCount;
  const totalOnlineDisplay = collectorTotals.online || (collectorTotals.directOnline || agents.filter((a) => a.status === "online").length) + (collectorTotals.managedOnline || derivedBridgeOnline);
  const totalOfflineDisplay = Math.max(totalCollectorsDisplay - totalOnlineDisplay, 0);
  const renderClassificationBadge = (classification) => {
    const meta = classificationStyles[classification];
    return /* @__PURE__ */ React2.createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 600,
          background: meta.bg,
          border: `1px solid ${meta.border}`,
          color: meta.color,
          width: "fit-content"
        }
      },
      meta.label
    );
  };
  const renderAgentRow = (agent) => {
    const classification = getAgentClassification(agent);
    const osLabel = agent.labels?.["os"] || agent.labels?.["os.type"] || agent.labels?.["k8s.node.os"] || null;
    const archLabel = agent.labels?.["arch"] || agent.labels?.["host.arch"] || agent.labels?.["k8s.node.arch"] || null;
    return /* @__PURE__ */ React2.createElement(
      "div",
      {
        key: agent.id,
        onClick: () => {
          setSelectedAgent(agent);
          setShowDetailsPanel(true);
        },
        style: {
          display: "grid",
          gridTemplateColumns: "200px 1fr 120px 100px 120px",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid #F3F4F6",
          cursor: "pointer",
          transition: "background 0.2s",
          alignItems: "center"
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.background = "#F9FAFB";
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.background = "white";
        }
      },
      /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React2.createElement(
        "span",
        {
          style: {
            fontFamily: "monospace",
            fontSize: 12,
            color: "#111827",
            fontWeight: 500,
            wordBreak: "break-all",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }
        },
        agent.agentUid
      ), renderClassificationBadge(classification)),
      /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } }, osLabel && /* @__PURE__ */ React2.createElement("span", { style: { background: "#EFF6FF", color: "#1E40AF", border: "1px solid #BFDBFE", padding: "3px 8px", borderRadius: 6, fontSize: 11 } }, "os: ", osLabel), archLabel && /* @__PURE__ */ React2.createElement("span", { style: { background: "#F0FDF4", color: "#166534", border: "1px solid #86EFAC", padding: "3px 8px", borderRadius: 6, fontSize: 11 } }, "arch: ", archLabel), agent.labels && Object.keys(agent.labels).length > 0 ? Object.entries(agent.labels).map(([key, value]) => /* @__PURE__ */ React2.createElement(
        "button",
        {
          key,
          onClick: (e) => {
            e.stopPropagation();
            setSelectedLabelFilter(
              selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? null : { key, value }
            );
          },
          style: {
            background: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "#3B82F6" : "#EFF6FF",
            color: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "white" : "#1E40AF",
            border: `1px solid ${selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "#3B82F6" : "#BFDBFE"}`,
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
            whiteSpace: "nowrap"
          },
          onMouseEnter: (e) => {
            if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
              e.currentTarget.style.background = "#DBEAFE";
              e.currentTarget.style.borderColor = "#93C5FD";
            }
          },
          onMouseLeave: (e) => {
            if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
              e.currentTarget.style.background = "#EFF6FF";
              e.currentTarget.style.borderColor = "#BFDBFE";
            }
          }
        },
        /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600 } }, key, ":"),
        " ",
        /* @__PURE__ */ React2.createElement("span", null, value)
      )) : /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 12, color: "#9CA3AF", fontStyle: "italic" } }, "No labels")),
      /* @__PURE__ */ React2.createElement("div", null, getStatusBadge2(agent.status)),
      /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, agent.version || "unknown"),
      /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } }, agent.status !== "online" && /* @__PURE__ */ React2.createElement(
        "button",
        {
          onClick: async (e) => {
            e.stopPropagation();
            if (confirm(`Remove agent "${agent.name || agent.agentUid}" from the system?`)) {
              try {
                await backendSrv5.request({
                  url: `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${agent.agentUid}`,
                  method: "DELETE"
                });
                await fetchAgents();
                alert("Agent removed successfully");
              } catch (err) {
                alert("Failed to remove agent: " + (err.message || "Unknown error"));
              }
            }
          },
          style: {
            padding: "4px 10px",
            background: "#EF4444",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500
          }
        },
        "Remove"
      ))
    );
  };
  const renderAgentSection = (title, agentsList) => {
    if (agentsList.length === 0) {
      return null;
    }
    return /* @__PURE__ */ React2.createElement("div", { key: title, style: { marginTop: 16 } }, /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          padding: "16px",
          background: "#F9FAFB",
          borderBottom: "2px solid #E5E7EB",
          fontWeight: 600,
          fontSize: 14,
          color: "#111827"
        }
      },
      title,
      " ",
      /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 12, color: "#6B7280" } }, "(", agentsList.length, ")")
    ), /* @__PURE__ */ React2.createElement(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "200px 1fr 120px 100px 120px",
          gap: 12,
          padding: "12px 16px",
          background: "#F9FAFB",
          borderBottom: "2px solid #E5E7EB",
          fontWeight: 600,
          fontSize: 12,
          color: "#6B7280",
          textTransform: "uppercase",
          letterSpacing: 0.5
        }
      },
      /* @__PURE__ */ React2.createElement("div", null, "Agent UID"),
      /* @__PURE__ */ React2.createElement("div", null, "Labels"),
      /* @__PURE__ */ React2.createElement("div", null, "Status"),
      /* @__PURE__ */ React2.createElement("div", null, "Version"),
      /* @__PURE__ */ React2.createElement("div", null, "Actions")
    ), agentsList.map(renderAgentRow));
  };
  return /* @__PURE__ */ React2.createElement("div", { style: {
    minHeight: "100vh",
    background: "#F9FAFB",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  } }, /* @__PURE__ */ React2.createElement("div", { style: {
    background: "white",
    borderBottom: "1px solid #E5E7EB",
    padding: "16px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("h1", { style: { margin: 0, fontSize: 24, fontWeight: 600, color: "#111827" } }, "OTel Collector Agent Fleet Management")), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginTop: 8 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 14, color: "#6B7280" } }, "Tenant:"), /* @__PURE__ */ React2.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    background: "#EFF6FF",
    borderRadius: 6,
    border: "1px solid #BFDBFE",
    minWidth: 200
  } }, /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 12, color: "#1E40AF", fontWeight: 600 } }, currentOrgName || `Organization ${selectedOrgId ?? ""}`)), /* @__PURE__ */ React2.createElement("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    background: "#F3F4F6",
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#4B5563" } }, /* @__PURE__ */ React2.createElement("strong", null, "User:"), " ", displayUserName), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: userContext.isAdmin ? "#059669" : "#B45309", fontWeight: 600 } }, userContext.role || (userContext.isAdmin ? "Admin" : "Viewer")), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#4B5563" } }, /* @__PURE__ */ React2.createElement("strong", null, "Org:"), " ", displayOrgBadge))), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, color: "#6B7280", marginTop: 4 } }, "Manage your OpenTelemetry Collector agents \u2022 Viewing agents for selected organization")), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: handleRefresh,
      disabled: refreshing,
      style: {
        padding: "8px 16px",
        background: refreshing ? "#D1D5DB" : "#3B82F6",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: refreshing ? "not-allowed" : "pointer",
        fontSize: 14,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 8
      }
    },
    /* @__PURE__ */ React2.createElement("span", null, refreshing ? "\u23F3" : "\u21BB"),
    refreshing ? "Refreshing..." : "Refresh"
  )), /* @__PURE__ */ React2.createElement("div", { style: {
    background: "white",
    borderBottom: "1px solid #E5E7EB",
    padding: "0 24px",
    display: "flex",
    gap: 32
  } }, [
    { id: "collectors", label: "Collectors", icon: "\u{1F4E6}" },
    { id: "configurations", label: "Configurations", icon: "\u2699\uFE0F" },
    { id: "monitoring", label: "Monitoring", icon: "\u{1F4CA}" }
  ].map((tab) => /* @__PURE__ */ React2.createElement(
    "button",
    {
      key: tab.id,
      onClick: () => setActiveTab(tab.id),
      style: {
        padding: "12px 0",
        background: "none",
        border: "none",
        borderBottom: activeTab === tab.id ? "2px solid #3B82F6" : "2px solid transparent",
        color: activeTab === tab.id ? "#3B82F6" : "#6B7280",
        fontSize: 14,
        fontWeight: activeTab === tab.id ? 600 : 500,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        transition: "all 0.2s"
      }
    },
    /* @__PURE__ */ React2.createElement("span", null, tab.icon),
    tab.label,
    tab.id === "collectors" && /* @__PURE__ */ React2.createElement("span", { style: {
      background: activeTab === tab.id ? "#3B82F6" : "#D1D5DB",
      color: "white",
      padding: "2px 6px",
      borderRadius: 10,
      fontSize: 11,
      fontWeight: 600,
      marginLeft: 4
    } }, totalCollectorsDisplay)
  ))), /* @__PURE__ */ React2.createElement("div", { style: { padding: 24, width: "100%", margin: "0", boxSizing: "border-box" } }, error && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 12,
    marginBottom: 16,
    background: "#FEE2E2",
    border: "1px solid #FECACA",
    borderRadius: 6,
    color: "#DC2626",
    fontSize: 14
  } }, error), activeTab === "collectors" && /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginBottom: 24
  } }, /* @__PURE__ */ React2.createElement("div", { style: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16
  } }, /* @__PURE__ */ React2.createElement("div", { style: { position: "relative", flex: 1, maxWidth: 400 } }, /* @__PURE__ */ React2.createElement(
    "input",
    {
      type: "text",
      placeholder: "Search collectors by name, UID, or label...",
      value: searchQuery,
      onChange: (e) => setSearchQuery(e.target.value),
      style: {
        width: "100%",
        padding: "10px 12px 10px 36px",
        border: "1px solid #D1D5DB",
        borderRadius: 6,
        fontSize: 14,
        background: "white"
      }
    }
  ), /* @__PURE__ */ React2.createElement("span", { style: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: "#9CA3AF"
  } }, "\u{1F50D}")), selectedLabelFilter && /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setSelectedLabelFilter(null),
      style: {
        padding: "8px 16px",
        background: "#EF4444",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    },
    "\u2717 Clear Label Filter: ",
    selectedLabelFilter.key,
    "=",
    selectedLabelFilter.value
  )), allLabels.size > 0 && /* @__PURE__ */ React2.createElement("div", { style: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#6B7280", marginRight: 8, alignSelf: "center" } }, "Filter by Labels:"), Array.from(allLabels.entries()).map(
    ([key, values]) => Array.from(values).map((value) => /* @__PURE__ */ React2.createElement(
      "button",
      {
        key: `${key}:${value}`,
        onClick: () => setSelectedLabelFilter(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? null : { key, value }),
        style: {
          padding: "6px 12px",
          background: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "#3B82F6" : "white",
          color: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "white" : "#111827",
          border: `1px solid ${selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "#3B82F6" : "#D1D5DB"}`,
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "all 0.2s"
        },
        onMouseEnter: (e) => {
          if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
            e.currentTarget.style.background = "#F3F4F6";
          }
        },
        onMouseLeave: (e) => {
          if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
            e.currentTarget.style.background = "white";
          }
        }
      },
      /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600 } }, key, ":"),
      /* @__PURE__ */ React2.createElement("span", null, value),
      selectedLabelFilter?.key === key && selectedLabelFilter?.value === value && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10 } }, "\u2713")
    ))
  )), /* @__PURE__ */ React2.createElement("div", { style: {
    display: "flex",
    gap: 16,
    fontSize: 14,
    color: "#6B7280",
    alignItems: "center",
    justifyContent: "space-between"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 16, alignItems: "center" } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, color: "#111827" } }, totalCollectorsDisplay), " Total"), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, color: "#10B981" } }, totalOnlineDisplay), " Online"), /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, color: "#EF4444" } }, totalOfflineDisplay), " Offline"), agents.length > 0 && (selectedOrgId || currentOrgName) && /* @__PURE__ */ React2.createElement("div", { style: {
    marginLeft: 16,
    paddingLeft: 16,
    borderLeft: "1px solid #E5E7EB",
    fontSize: 12
  } }, /* @__PURE__ */ React2.createElement("span", { style: { color: "#6B7280" } }, "Viewing:"), " ", /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, color: "#3B82F6" } }, currentOrgName || "Tenant"))), filteredAgents.length > 0 && /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setGroupByDeploymentType(!groupByDeploymentType),
      style: {
        padding: "6px 12px",
        background: groupByDeploymentType ? "#3B82F6" : "#F3F4F6",
        color: groupByDeploymentType ? "white" : "#6B7280",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 500
      }
    },
    groupByDeploymentType ? "\u{1F4C1} Grouped by Type" : "\u{1F4CB} Flat List"
  )), classificationSummaryItems.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 12 } }, classificationSummaryItems.map((item) => /* @__PURE__ */ React2.createElement(
    "div",
    {
      key: item.key,
      style: {
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${item.border}`,
        background: item.bg,
        minWidth: 140
      }
    },
    /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: item.color } }, item.label),
    /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 18, fontWeight: 700, color: "#111827" } }, item.count)
  )))), loading ? /* @__PURE__ */ React2.createElement("div", { style: { textAlign: "center", padding: 80, color: "#6B7280" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 18, marginBottom: 8 } }, "Loading collectors..."), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14 } }, "Connecting to OpAMP server...")) : bridges.length === 0 && filteredAgents.length === 0 ? /* @__PURE__ */ React2.createElement("div", { style: {
    background: "white",
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    padding: 60,
    textAlign: "center"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 48, marginBottom: 16 } }, "\u{1F4E6}"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "#111827", marginBottom: 8 } }, selectedOrgId || currentOrgName ? `No collectors found in ${currentOrgName || "the selected tenant"}` : "No collectors found"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, color: "#6B7280", maxWidth: 500, margin: "0 auto" } }, searchQuery ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, "No collectors match your search. Try a different query.") : selectedOrgId ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, "No agents are registered for this organization yet.", /* @__PURE__ */ React2.createElement("br", null), /* @__PURE__ */ React2.createElement("br", null), "Connect your OpenTelemetry Collector agents via OpAMP to see them here.", /* @__PURE__ */ React2.createElement("br", null), "Configure your agent to connect to:", " ", /* @__PURE__ */ React2.createElement("code", { style: {
    background: "#F3F4F6",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 13,
    fontFamily: "monospace"
  } }, opampConnectionUrl), /* @__PURE__ */ React2.createElement("br", null), /* @__PURE__ */ React2.createElement("br", null), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 12, color: "#9CA3AF" } }, "\u{1F4A1} Tip: Label your agents with ", /* @__PURE__ */ React2.createElement("code", { style: { background: "#F3F4F6", padding: "2px 6px", borderRadius: 3 } }, "tenant.name"), " or ", /* @__PURE__ */ React2.createElement("code", { style: { background: "#F3F4F6", padding: "2px 6px", borderRadius: 3 } }, "organization.name"), " so they automatically map to the right tenant, or fall back to numeric labels like ", /* @__PURE__ */ React2.createElement("code", { style: { background: "#F3F4F6", padding: "2px 6px", borderRadius: 3 } }, "org_id"), "/", /* @__PURE__ */ React2.createElement("code", { style: { background: "#F3F4F6", padding: "2px 6px", borderRadius: 3 } }, "tenant.id"), ".")) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, "Please select an organization from the dropdown above to view agents.", /* @__PURE__ */ React2.createElement("br", null), /* @__PURE__ */ React2.createElement("br", null), "Or connect your OpenTelemetry Collector agents via OpAMP to see them here.", /* @__PURE__ */ React2.createElement("br", null), "Configure your agent to connect to:", " ", /* @__PURE__ */ React2.createElement("code", { style: {
    background: "#F3F4F6",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 13,
    fontFamily: "monospace"
  } }, opampConnectionUrl)))) : /* @__PURE__ */ React2.createElement("div", { style: {
    background: "white",
    borderRadius: 8,
    border: "1px solid #E5E7EB",
    overflow: "hidden"
  } }, bridges.length > 0 && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: {
    padding: "16px",
    background: "#F9FAFB",
    borderBottom: "2px solid #E5E7EB",
    fontWeight: 600,
    fontSize: 14,
    color: "#111827"
  } }, "OpAMP Bridges (", bridges.length, ")"), /* @__PURE__ */ React2.createElement("div", { style: {
    display: "grid",
    gridTemplateColumns: "30px minmax(200px, 260px) minmax(0, 1fr) 120px 120px 110px",
    gap: 12,
    padding: "12px 16px",
    background: "#F9FAFB",
    borderBottom: "2px solid #E5E7EB",
    fontWeight: 600,
    fontSize: 11,
    color: "#6B7280",
    textTransform: "uppercase"
  } }, /* @__PURE__ */ React2.createElement("div", null), /* @__PURE__ */ React2.createElement("div", null, "Bridge"), /* @__PURE__ */ React2.createElement("div", null, "Labels"), /* @__PURE__ */ React2.createElement("div", null, "Health"), /* @__PURE__ */ React2.createElement("div", null, "Version"), /* @__PURE__ */ React2.createElement("div", null, "Actions")), bridges.map((bridge) => {
    const bridgeCollectors = bridge.collectors || [];
    const isExpanded = expandedGroups.has(bridge.agentUid);
    return /* @__PURE__ */ React2.createElement("div", { key: bridge.agentUid, style: { borderBottom: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement(
      "div",
      {
        onClick: () => {
          const newExpanded = new Set(expandedGroups);
          if (isExpanded) {
            newExpanded.delete(bridge.agentUid);
          } else {
            newExpanded.add(bridge.agentUid);
          }
          setExpandedGroups(newExpanded);
        },
        style: {
          display: "grid",
          gridTemplateColumns: "30px minmax(200px, 260px) minmax(0, 1fr) 120px 120px 110px",
          gap: 12,
          padding: "12px 16px",
          background: isExpanded ? "#F3F4F6" : "white",
          cursor: "pointer",
          transition: "background 0.2s",
          alignItems: "center",
          borderBottom: bridgeCollectors.length > 0 ? "1px solid #E5E7EB" : "none"
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.background = isExpanded ? "#E5E7EB" : "#F9FAFB";
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.background = isExpanded ? "#F3F4F6" : "white";
        }
      },
      /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, bridgeCollectors.length > 0 ? isExpanded ? "\u25BC" : "\u25B6" : ""),
      /* @__PURE__ */ React2.createElement("div", { style: {
        fontFamily: "monospace",
        fontSize: 12,
        color: "#111827",
        fontWeight: 600,
        wordBreak: "break-all",
        whiteSpace: "normal"
      } }, bridge.name),
      /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } }, bridge.namespace && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "#1E40AF", padding: "3px 8px", background: "#EFF6FF", borderRadius: 4, border: "1px solid #BFDBFE" } }, "ns: ", bridge.namespace), bridge.cluster && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "#166534", padding: "3px 8px", background: "#F0FDF4", borderRadius: 4, border: "1px solid #86EFAC" } }, "cluster: ", bridge.cluster), bridge.labels && Object.keys(bridge.labels).length > 0 ? Object.entries(bridge.labels).filter(([key]) => !["k8s.namespace", "k8s.cluster", "cluster", "namespace"].includes(key)).slice(0, 3).map(([key, value]) => /* @__PURE__ */ React2.createElement("span", { key: `${key}:${value}`, style: { fontSize: 10, color: "#374151", padding: "3px 8px", background: "#F3F4F6", borderRadius: 4 } }, key, ": ", value)) : /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, color: "#9CA3AF" } }, "no labels"), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280", fontWeight: 500 } }, bridgeCollectors.length, " collector", bridgeCollectors.length !== 1 ? "s" : ""), /* @__PURE__ */ React2.createElement(
        CapabilityBadges2,
        {
          capabilities: bridge.capabilities,
          limit: 3,
          compact: true,
          onOpenDetails: () => {
            setBridgeCapabilitySheet({
              bridge,
              open: true
            });
          }
        }
      )),
      /* @__PURE__ */ React2.createElement("div", null, getStatusBadge2(bridge.status)),
      /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, bridge.version || "unknown"),
      /* @__PURE__ */ React2.createElement("div", { onClick: (e) => e.stopPropagation() }, bridge.status === "offline" && /* @__PURE__ */ React2.createElement(
        "button",
        {
          onClick: () => handleDeleteBridge(bridge.agentUid, bridge.name),
          style: {
            padding: "4px 12px",
            background: "#FEE2E2",
            color: "#DC2626",
            border: "1px solid #FCA5A5",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500,
            transition: "all 0.2s"
          },
          onMouseEnter: (e) => {
            e.currentTarget.style.background = "#FECACA";
            e.currentTarget.style.borderColor = "#F87171";
          },
          onMouseLeave: (e) => {
            e.currentTarget.style.background = "#FEE2E2";
            e.currentTarget.style.borderColor = "#FCA5A5";
          }
        },
        "Delete"
      ))
    ), isExpanded && bridgeCollectors.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { background: "#FAFBFC", borderTop: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: {
      display: "grid",
      gridTemplateColumns: "30px 200px 1fr 120px 100px 120px",
      gap: 12,
      padding: "8px 16px 8px 46px",
      background: "#F9FAFB",
      borderBottom: "1px solid #E5E7EB",
      fontWeight: 600,
      fontSize: 11,
      color: "#6B7280",
      textTransform: "uppercase"
    } }, /* @__PURE__ */ React2.createElement("div", null), /* @__PURE__ */ React2.createElement("div", null, "Collector"), /* @__PURE__ */ React2.createElement("div", null, "Labels"), /* @__PURE__ */ React2.createElement("div", null, "Health"), /* @__PURE__ */ React2.createElement("div", null, "Version"), /* @__PURE__ */ React2.createElement("div", null, "Actions")), bridgeCollectors.map((collector) => /* @__PURE__ */ React2.createElement(
      "div",
      {
        key: collector.agentUid,
        onClick: (e) => {
          e.stopPropagation();
          setSelectedAgent(collector);
          setShowDetailsPanel(true);
        },
        style: {
          display: "grid",
          gridTemplateColumns: "30px 200px 1fr 120px 100px 120px",
          gap: 12,
          padding: "10px 16px 10px 46px",
          borderBottom: "1px solid #F3F4F6",
          cursor: "pointer",
          transition: "background 0.2s",
          alignItems: "center"
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.background = "#F9FAFB";
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.background = "#FAFBFC";
        }
      },
      /* @__PURE__ */ React2.createElement("div", null),
      /* @__PURE__ */ React2.createElement("div", { style: {
        fontFamily: "monospace",
        fontSize: 12,
        color: "#111827",
        fontWeight: 500
      } }, collector.name),
      /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } }, collector.labels && Object.keys(collector.labels).length > 0 ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, collector.labels["k8s.namespace"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "#1E40AF", padding: "3px 8px", background: "#EFF6FF", borderRadius: 4, border: "1px solid #BFDBFE" } }, "ns: ", collector.labels["k8s.namespace"]), collector.labels["k8s.cluster"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "#166534", padding: "3px 8px", background: "#F0FDF4", borderRadius: 4, border: "1px solid #86EFAC" } }, "cluster: ", collector.labels["k8s.cluster"]), collector.labels["k8s.crd_name"] && /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 10, fontWeight: 600, color: "#92400E", padding: "3px 8px", background: "#FEF3C7", borderRadius: 4, border: "1px solid #FDE68A" } }, "crd: ", collector.labels["k8s.crd_name"]), Object.entries(collector.labels).filter(([key]) => !["bridge.instance_uid", "k8s.namespace", "k8s.cluster", "k8s.crd_name"].includes(key)).slice(0, 2).map(([key, value]) => /* @__PURE__ */ React2.createElement(
        "span",
        {
          key,
          style: {
            background: "#F3F4F6",
            color: "#374151",
            border: "1px solid #E5E7EB",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 10,
            whiteSpace: "nowrap"
          }
        },
        key,
        ": ",
        value
      ))) : /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#9CA3AF", fontStyle: "italic" } }, "No labels")),
      /* @__PURE__ */ React2.createElement("div", null, getStatusBadge2(collector.status)),
      /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, collector.version || "unknown"),
      /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } }, collector.status !== "online" && /* @__PURE__ */ React2.createElement(
        "button",
        {
          onClick: async (e) => {
            e.stopPropagation();
            if (confirm(`Remove collector "${collector.name}"?`)) {
              try {
                await backendSrv5.request({
                  url: `/api/plugins/otel-collector-agent-fleet-management/resources/agents/${collector.agentUid}`,
                  method: "DELETE"
                });
                await fetchAgents();
                alert("Collector removed successfully");
              } catch (err) {
                alert("Failed to remove collector: " + (err.message || "Unknown error"));
              }
            }
          },
          style: {
            padding: "4px 10px",
            background: "#EF4444",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 500
          }
        },
        "Remove"
      ))
    ))));
  })), groupByDeploymentType && groupedAgents ? (
    // Grouped by deployment type
    Object.entries(groupedAgents).map(([deploymentType, agentsInGroup]) => {
      const directInGroup = agentsInGroup.filter((a) => {
        const classification = getAgentClassification(a);
        return classification === "direct";
      });
      const supervisorsInGroup = agentsInGroup.filter((a) => {
        const classification = getAgentClassification(a);
        return classification === "supervisor";
      });
      const unclassifiedInGroup = agentsInGroup.filter((a) => {
        const classification = getAgentClassification(a);
        return classification === "unclassified";
      });
      return /* @__PURE__ */ React2.createElement("div", { key: deploymentType, style: { marginTop: 16 } }, /* @__PURE__ */ React2.createElement("div", { style: {
        padding: "12px 16px",
        background: "#F3F4F6",
        borderBottom: "1px solid #E5E7EB",
        fontWeight: 600,
        fontSize: 13,
        color: "#374151"
      } }, "\u{1F4C1} ", deploymentType, " (", agentsInGroup.length, ")"), renderAgentSection("Direct agents", directInGroup), renderAgentSection("Supervisors", supervisorsInGroup), renderAgentSection("Unclassified agents", unclassifiedInGroup));
    })
  ) : (
    // Flat list by classification
    /* @__PURE__ */ React2.createElement(React2.Fragment, null, renderAgentSection("Direct agents", directAgents), renderAgentSection("Supervisors", supervisorAgents), renderAgentSection("Unclassified agents", unclassifiedAgents))
  ))), activeTab === "configurations" && /* @__PURE__ */ React2.createElement(
    ConfigGenerator,
    {
      agents,
      bridges,
      onPushConfig: handlePushConfig,
      backendSrv: backendSrv5
    }
  ), activeTab === "monitoring" && /* @__PURE__ */ React2.createElement(
    MonitoringSection,
    {
      agents,
      bridges,
      telemetrySettings,
      telemetryLoading,
      onToggleMetrics: handleToggleMetrics,
      onToggleLogs: handleToggleLogs,
      telemetryDatasourceHints,
      onConfigureTelemetry: handleOpenTelemetryDrawer
    }
  )), /* @__PURE__ */ React2.createElement(
    TelemetryConfigDrawer,
    {
      open: telemetryDrawerOpen,
      mode: telemetryDrawerMode,
      metricsConfig: telemetrySettings.metrics,
      logsConfig: telemetrySettings.logs,
      currentOrgId: selectedOrgId,
      orgOptions,
      onMetricsChange: (next) => setTelemetrySettings((prev) => ({
        ...prev,
        metrics: next
      })),
      onLogsChange: (next) => setTelemetrySettings((prev) => ({
        ...prev,
        logs: next
      })),
      onSave: async () => {
        await saveTelemetrySettings(telemetrySettings);
        setTelemetryDrawerOpen(false);
      },
      onClose: () => setTelemetryDrawerOpen(false),
      saving: telemetrySaving,
      canSave: isAdmin
    }
  ), showDetailsPanel && selectedAgent && /* @__PURE__ */ React2.createElement("div", { style: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "400px",
    background: "white",
    boxShadow: "-4px 0 12px rgba(0,0,0,0.15)",
    zIndex: 1e3,
    display: "flex",
    flexDirection: "column",
    animation: "slideIn 0.3s ease-out"
  } }, /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 20,
    borderBottom: "1px solid #E5E7EB",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  } }, /* @__PURE__ */ React2.createElement("h3", { style: { margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" } }, "Collector Details"), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => setShowDetailsPanel(false),
      style: {
        background: "none",
        border: "none",
        fontSize: 24,
        cursor: "pointer",
        color: "#6B7280",
        padding: 0,
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4
      }
    },
    "\xD7"
  )), /* @__PURE__ */ React2.createElement("div", { style: {
    display: "flex",
    borderBottom: "1px solid #E5E7EB",
    background: "#F9FAFB"
  } }, ["overview", "capabilities", "activity"].map((tab) => /* @__PURE__ */ React2.createElement(
    "button",
    {
      key: tab,
      onClick: () => setDetailTab(tab),
      style: {
        flex: 1,
        padding: "12px",
        background: "none",
        border: "none",
        borderBottom: detailTab === tab ? "2px solid #3B82F6" : "2px solid transparent",
        color: detailTab === tab ? "#3B82F6" : "#6B7280",
        fontWeight: detailTab === tab ? 600 : 500,
        fontSize: 13,
        cursor: "pointer"
      }
    },
    tab === "overview" ? "\u{1F4CA} Overview" : tab === "capabilities" ? "\u26A1 Capabilities" : "\u{1F4CB} Activity"
  ))), /* @__PURE__ */ React2.createElement("div", { style: { padding: 20, overflowY: "auto", flex: 1 } }, detailTab === "overview" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, selectedAgent.orgId && /* @__PURE__ */ React2.createElement("div", { style: {
    marginBottom: 20,
    padding: 12,
    background: "#EFF6FF",
    borderRadius: 6,
    border: "1px solid #BFDBFE"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#1E40AF", fontWeight: 600, marginBottom: 4 } }, "TENANT"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, color: "#111827", fontWeight: 600, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React2.createElement("span", null, selectedAgentTenantName || "Unknown tenant"), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 12, color: "#1D4ED8", fontFamily: "monospace" } }, "(ID: ", selectedAgent.orgId, ")"))), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 } }, "Name"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#111827" } }, selectedAgent.name || selectedAgent.agentUid)), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 } }, "Agent UID"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, fontFamily: "monospace", color: "#111827", background: "#F3F4F6", padding: 8, borderRadius: 4 } }, selectedAgent.agentUid)), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 } }, "Status"), /* @__PURE__ */ React2.createElement("div", null, getStatusBadge2(selectedAgent.status))), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 } }, "Version"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, color: "#111827" } }, selectedAgent.version || "unknown")), /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 4 } }, "Last Seen"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, color: "#111827" } }, selectedAgent.lastSeen ? new Date(selectedAgent.lastSeen).toLocaleString() : "Never")), selectedAgent.labels && Object.keys(selectedAgent.labels).length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280", marginBottom: 8, fontWeight: 600 } }, "Labels"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, Object.entries(selectedAgent.labels).map(([key, value]) => /* @__PURE__ */ React2.createElement(
    "button",
    {
      key,
      onClick: (e) => {
        e.stopPropagation();
        setSelectedLabelFilter(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? null : { key, value });
        setShowDetailsPanel(false);
      },
      style: {
        background: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "#3B82F6" : "#EFF6FF",
        color: selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "white" : "#1E40AF",
        border: `1px solid ${selectedLabelFilter?.key === key && selectedLabelFilter?.value === value ? "#3B82F6" : "#BFDBFE"}`,
        padding: "6px 12px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s"
      },
      onMouseEnter: (e) => {
        if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
          e.currentTarget.style.background = "#DBEAFE";
          e.currentTarget.style.borderColor = "#93C5FD";
        }
      },
      onMouseLeave: (e) => {
        if (!(selectedLabelFilter?.key === key && selectedLabelFilter?.value === value)) {
          e.currentTarget.style.background = "#EFF6FF";
          e.currentTarget.style.borderColor = "#BFDBFE";
        }
      }
    },
    /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600 } }, key, ":"),
    " ",
    /* @__PURE__ */ React2.createElement("span", null, value)
  ))))), detailTab === "capabilities" && /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 4 } }, "\u26A1 Agent Capabilities & Metrics"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "Features and capabilities supported by this agent according to OpAMP specification")), (() => {
    const telemetryItems = detailPanelMonitoringData?.telemetry || [];
    let avgCPU = 0, avgMemory = 0, avgBandwidth = 0, avgThroughput = 0;
    let metricsCount = 0;
    telemetryItems.forEach((item) => {
      if (item.type === "metrics" && item.data) {
        const data = item.data;
        if (data.cpu !== void 0) {
          avgCPU += data.cpu;
          metricsCount++;
        }
        if (data.memory !== void 0) {
          avgMemory += data.memory;
        }
        if (data.bandwidth !== void 0) {
          avgBandwidth += data.bandwidth;
        }
        if (data.throughput !== void 0) {
          avgThroughput += data.throughput;
        }
      }
    });
    if (metricsCount > 0) {
      avgCPU = avgCPU / metricsCount;
      avgMemory = avgMemory / metricsCount;
      avgBandwidth = avgBandwidth / metricsCount;
      avgThroughput = avgThroughput / metricsCount;
    }
    return /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24, padding: 16, background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 12 } }, "\u{1F4CA} Agent Performance Metrics"), metricsCount === 0 ? /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 4, padding: 10, background: "#FEF3C7", borderRadius: 4, border: "1px solid #FCD34D", fontSize: 11, color: "#92400E" } }, "No agent self-metrics reported yet. Enable the metrics overlay in the Monitoring tab and point it at your Prometheus/Mimir datasource to pull real usage gauges here.") : /* @__PURE__ */ React2.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 } }, /* @__PURE__ */ React2.createElement("div", { style: { padding: 12, background: "white", borderRadius: 4, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "CPU Usage"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "#111827" } }, avgCPU > 0 ? `${avgCPU.toFixed(1)}%` : "N/A")), /* @__PURE__ */ React2.createElement("div", { style: { padding: 12, background: "white", borderRadius: 4, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Memory Usage"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "#111827" } }, avgMemory > 0 ? `${avgMemory.toFixed(0)} MB` : "N/A")), /* @__PURE__ */ React2.createElement("div", { style: { padding: 12, background: "white", borderRadius: 4, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Bandwidth"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "#111827" } }, avgBandwidth > 0 ? `${avgBandwidth.toFixed(0)} KB/s` : "N/A")), /* @__PURE__ */ React2.createElement("div", { style: { padding: 12, background: "white", borderRadius: 4, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginBottom: 4 } }, "Throughput"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "#111827" } }, avgThroughput > 0 ? `${avgThroughput.toFixed(0)}/s` : "N/A"))));
  })(), detailPanelMonitoringData?.health && detailPanelMonitoringData.health.items && detailPanelMonitoringData.health.items.length > 0 && /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 24, padding: 16, background: "#F9FAFB", borderRadius: 6, border: "1px solid #E5E7EB" } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 12 } }, "\u{1F3E5} Health Check Reports"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, maxHeight: "300px", overflowY: "auto" } }, detailPanelMonitoringData.health.items.slice(0, 10).map((health, idx) => /* @__PURE__ */ React2.createElement("div", { key: idx, style: {
    padding: 12,
    background: health.healthy ? "#D1FAE5" : "#FEE2E2",
    borderRadius: 4,
    border: `1px solid ${health.healthy ? "#86EFAC" : "#FECACA"}`
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: health.healthy ? "#065F46" : "#991B1B" } }, health.healthy ? "\u2713 Healthy" : "\u2717 Unhealthy"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280" } }, health.recorded_at ? new Date(health.recorded_at).toLocaleString() : "N/A")), health.last_error && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#991B1B", fontFamily: "monospace", marginTop: 4 } }, "Error: ", health.last_error), health.status_message && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#6B7280", marginTop: 4 } }, health.status_message))))), loadingDetailMonitoring && /* @__PURE__ */ React2.createElement("div", { style: { padding: 20, textAlign: "center", color: "#6B7280" } }, "Loading metrics and health data..."), selectedAgent.capabilities && Object.keys(selectedAgent.capabilities).length > 0 ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 12,
    padding: 8,
    background: "#F3F4F6",
    borderRadius: 4
  } }, "According to ", /* @__PURE__ */ React2.createElement("a", { href: "https://opentelemetry.io/docs/specs/opamp/", target: "_blank", rel: "noopener noreferrer", style: { color: "#3B82F6" } }, "OpAMP Spec"), ", agents report their capabilities through AgentDescription."), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, Object.entries(selectedAgent.capabilities).map(([key, value]) => {
    if (typeof value === "boolean") {
      return /* @__PURE__ */ React2.createElement("div", { key, style: {
        background: value ? "#D1FAE5" : "#FEE2E2",
        padding: "8px 12px",
        borderRadius: 4,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 8
      } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600 } }, key.replace(/_/g, " "), ":"), /* @__PURE__ */ React2.createElement("span", { style: { color: value ? "#065F46" : "#991B1B", fontWeight: 500 } }, value ? "\u2713 Supported" : "\u2717 Not Supported"));
    }
    if (key === "available_components" && typeof value === "string") {
      const components = value.split(", ");
      return /* @__PURE__ */ React2.createElement("div", { key, style: {
        background: "#EFF6FF",
        padding: "12px",
        borderRadius: 4,
        fontSize: 13
      } }, /* @__PURE__ */ React2.createElement("div", { style: { fontWeight: 600, marginBottom: 8, color: "#1E40AF" } }, "Available Components:"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } }, components.map((comp, idx) => /* @__PURE__ */ React2.createElement("span", { key: idx, style: {
        background: "white",
        padding: "4px 8px",
        borderRadius: 4,
        fontSize: 12,
        border: "1px solid #BFDBFE"
      } }, comp))));
    }
    return /* @__PURE__ */ React2.createElement("div", { key, style: {
      background: "#F3F4F6",
      padding: "8px 12px",
      borderRadius: 4,
      fontSize: 13
    } }, /* @__PURE__ */ React2.createElement("strong", null, key.replace(/_/g, " "), ":"), " ", String(value));
  }), (() => {
    const allCapabilities = [
      "reports_status",
      "accepts_remote_config",
      "reports_effective_config",
      "accepts_packages",
      "reports_package_statuses",
      "reports_own_traces",
      "reports_own_metrics",
      "reports_own_logs",
      "accepts_opamp_connection_settings",
      "accepts_other_connection_settings",
      "accepts_restart_command",
      "reports_health",
      "reports_remote_config",
      "reports_heartbeat",
      "reports_available_components",
      "reports_connection_settings_status"
    ];
    const reportedCaps = new Set(Object.keys(selectedAgent.capabilities));
    const missingCaps = allCapabilities.filter((cap) => !reportedCaps.has(cap));
    const unsupportedCaps = allCapabilities.filter(
      (cap) => reportedCaps.has(cap) && selectedAgent.capabilities[cap] === false
    );
    if (missingCaps.length === 0 && unsupportedCaps.length === 0) {
      return null;
    }
    return /* @__PURE__ */ React2.createElement("div", { style: { marginTop: 12, padding: 12, background: "#FEF3C7", borderRadius: 4, border: "1px solid #FCD34D" } }, unsupportedCaps.length > 0 && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 8 } }, "Capabilities Not Supported:"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginBottom: missingCaps.length > 0 ? 12 : 0 } }, unsupportedCaps.map((cap) => /* @__PURE__ */ React2.createElement("div", { key: cap, style: {
      background: "#FEE2E2",
      padding: "6px 10px",
      borderRadius: 4,
      fontSize: 12,
      color: "#991B1B"
    } }, cap.replace(/_/g, " "), ": \u2717 Not Supported", cap === "accepts_packages" || cap === "reports_package_statuses" ? " (Requires PackagesStateProvider)" : "", cap === "reports_own_traces" || cap === "reports_own_metrics" || cap === "reports_own_logs" ? " (Not implemented in opamp-go v0.22.0)" : "")))), missingCaps.length > 0 && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 8 } }, "Capabilities Not Reported:"), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, missingCaps.map((cap) => /* @__PURE__ */ React2.createElement("div", { key: cap, style: {
      background: "#FEE2E2",
      padding: "6px 10px",
      borderRadius: 4,
      fontSize: 12,
      color: "#991B1B"
    } }, cap.replace(/_/g, " "), ": \u2717 Not Reported")))));
  })())) : /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 40,
    textAlign: "center",
    color: "#6B7280",
    background: "#F9FAFB",
    borderRadius: 6
  } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 48, marginBottom: 12 } }, "\u26A1"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 4 } }, "No Capabilities Reported"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12 } }, "This agent has not reported its OpAMP capabilities yet."))), detailTab === "activity" && /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { marginBottom: 16 } }, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 4 } }, "\u{1F4CB} Agent Activity Log"), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "Recent activity and events for this agent")), /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 12,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, fontSize: 13 } }, "Status Change"), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, selectedAgent.lastSeen ? new Date(selectedAgent.lastSeen).toLocaleString() : "Unknown")), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "Agent status: ", /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 500, color: selectedAgent.status === "online" ? "#10B981" : "#EF4444" } }, selectedAgent.status))), selectedAgent.lastSeen && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 12,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, fontSize: 13 } }, "Last Seen"), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, new Date(selectedAgent.lastSeen).toLocaleString())), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "Agent connected via OpAMP")), selectedAgent.version && selectedAgent.version !== "unknown" && /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 12,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, fontSize: 13 } }, "Version Reported"), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "On registration")), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "Agent version: ", /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 500, fontFamily: "monospace" } }, selectedAgent.version))), /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 12,
    background: "#F9FAFB",
    borderRadius: 6,
    border: "1px solid #E5E7EB"
  } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } }, /* @__PURE__ */ React2.createElement("span", { style: { fontWeight: 600, fontSize: 13 } }, "Agent Registration"), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 11, color: "#6B7280" } }, "Initial connection")), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "Agent registered with OpAMP server"))), /* @__PURE__ */ React2.createElement("div", { style: {
    marginTop: 20,
    padding: 12,
    background: "#EFF6FF",
    borderRadius: 6,
    fontSize: 12,
    color: "#1E40AF"
  } }, "\u{1F4A1} ", /* @__PURE__ */ React2.createElement("strong", null, "Tip:"), ' For detailed configuration activity, check the "Configuration History & Activity" section in the Configurations tab.'))), /* @__PURE__ */ React2.createElement("div", { style: {
    padding: 20,
    borderTop: "1px solid #E5E7EB",
    display: "flex",
    gap: 8
  } }, /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        if (selectedAgent.status === "online") {
          handlePushConfig(selectedAgent.agentUid);
        } else {
          alert("Agent must be online to push configuration");
        }
      },
      disabled: selectedAgent.status !== "online" || pushingConfig === selectedAgent.agentUid,
      style: {
        flex: 1,
        padding: "10px",
        background: selectedAgent.status === "online" && pushingConfig !== selectedAgent.agentUid ? "#3B82F6" : "#D1D5DB",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: selectedAgent.status === "online" && pushingConfig !== selectedAgent.agentUid ? "pointer" : "not-allowed",
        fontSize: 14,
        fontWeight: 500,
        minHeight: "40px",
        transition: "all 0.2s"
      },
      title: selectedAgent.status !== "online" ? "Agent must be online" : "Push latest approved configuration to agent"
    },
    pushingConfig === selectedAgent.agentUid ? "Pushing..." : "Push Latest Approved Config"
  ), /* @__PURE__ */ React2.createElement(
    "button",
    {
      onClick: () => {
        if (selectedAgent.status === "online") {
          handleUpgrade(selectedAgent.agentUid);
        } else {
          alert("Agent must be online to upgrade");
        }
      },
      disabled: selectedAgent.status !== "online" || upgradingAgent === selectedAgent.agentUid,
      style: {
        flex: 1,
        padding: "10px",
        background: selectedAgent.status === "online" && upgradingAgent !== selectedAgent.agentUid ? "#F59E0B" : "#D1D5DB",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: selectedAgent.status === "online" && upgradingAgent !== selectedAgent.agentUid ? "pointer" : "not-allowed",
        fontSize: 14,
        fontWeight: 500,
        minHeight: "40px",
        transition: "all 0.2s"
      },
      title: "Upgrades restart the collector process and may require compatible CRDs/operators."
    },
    upgradingAgent === selectedAgent.agentUid ? "Upgrading..." : "Upgrade"
  )), /* @__PURE__ */ React2.createElement("div", { style: { padding: "8px 20px 0", fontSize: 11, color: "#92400E", lineHeight: 1.4 } }, "\u26A0\uFE0F Upgrading only replaces the collector binary/image. It does not upgrade the OpenTelemetry Collector Operator or its CRDs. Review the", " ", /* @__PURE__ */ React2.createElement("a", { href: "https://github.com/open-telemetry/opentelemetry-collector-releases/releases", target: "_blank", rel: "noopener noreferrer", style: { color: "#B45309", textDecoration: "underline" } }, "upstream release notes"), " ", "before proceeding.")), bridgeCapabilitySheet.open && bridgeCapabilitySheet.bridge && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(
    "div",
    {
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1090
      },
      onClick: closeBridgeCapabilitySheet
    }
  ), /* @__PURE__ */ React2.createElement(
    "div",
    {
      style: {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: "white",
        boxShadow: "-6px 0 18px rgba(15,23,42,0.25)",
        zIndex: 1100,
        display: "flex",
        flexDirection: "column",
        animation: "slideIn 0.25s ease-out"
      }
    },
    /* @__PURE__ */ React2.createElement("div", { style: { padding: 20, borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "#111827" } }, bridgeCapabilitySheet.bridge.name), /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#6B7280" } }, "Bridge Capabilities")), /* @__PURE__ */ React2.createElement(
      "button",
      {
        onClick: closeBridgeCapabilitySheet,
        style: {
          background: "none",
          border: "none",
          fontSize: 24,
          cursor: "pointer",
          color: "#6B7280",
          width: 32,
          height: 32
        }
      },
      "\xD7"
    )),
    /* @__PURE__ */ React2.createElement("div", { style: { padding: 20, overflowY: "auto" } }, bridgeCapabilitySheet.bridge.capabilities ? /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } }, Object.entries(bridgeCapabilitySheet.bridge.capabilities).sort((a, b) => {
      const ai = capabilityOrder2.indexOf(a[0]);
      const bi = capabilityOrder2.indexOf(b[0]);
      return (ai === -1 ? capabilityOrder2.length : ai) - (bi === -1 ? capabilityOrder2.length : bi);
    }).map(([key, value]) => {
      const meta = capabilityMeta2[key] || {
        label: key.replace(/_/g, " "),
        description: "Reported capability",
        icon: "\u2728",
        tone: { bg: "#F3F4F6", border: "#E5E7EB", color: "#111827" }
      };
      const enabled = isCapabilityEnabled2(value);
      return /* @__PURE__ */ React2.createElement(
        "div",
        {
          key,
          style: {
            border: `1px solid ${meta.tone.border}`,
            borderRadius: 10,
            padding: 14,
            background: meta.tone.bg,
            display: "flex",
            flexDirection: "column",
            gap: 6
          }
        },
        /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React2.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", color: meta.tone.color, fontWeight: 600 } }, /* @__PURE__ */ React2.createElement("span", null, meta.icon), /* @__PURE__ */ React2.createElement("span", null, meta.label)), /* @__PURE__ */ React2.createElement("span", { style: { fontSize: 12, color: enabled ? "#059669" : "#B91C1C", fontWeight: 600 } }, enabled ? "Enabled" : "Disabled")),
        /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 12, color: "#4B5563" } }, meta.description),
        !enabled && /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 11, color: "#9CA3AF" } }, "Raw value: ", /* @__PURE__ */ React2.createElement("code", null, String(value)))
      );
    })) : /* @__PURE__ */ React2.createElement("div", { style: { fontSize: 13, color: "#6B7280" } }, "No capabilities reported by this bridge."))
  )), showDetailsPanel && /* @__PURE__ */ React2.createElement(
    "div",
    {
      onClick: () => setShowDetailsPanel(false),
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 999
      }
    }
  ), /* @__PURE__ */ React2.createElement("style", null, `
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `));
};

// module.ts
var plugin = new __GRAFANA_DATA__.AppPlugin().setRootPage(App);

/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.0 https://github.com/nodeca/js-yaml @license MIT *)
*/
//# sourceMappingURL=module.js.tmp.map

  return { plugin: plugin };
});