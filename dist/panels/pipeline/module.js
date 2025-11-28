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
// panels/pipeline/module.tsx
var React2 = __REACT__.default || __REACT__;


// components/PipelineMetricsPanelView.tsx
var React = __REACT__.default || __REACT__;


// pages/utils/api.ts


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

// pages/constants.ts
var PLUGIN_ID = "otel-collector-agent-fleet-management";
var RESOURCE_ROOT = `/api/plugins/${PLUGIN_ID}/resources`;
var RESOURCE_PREFIX = `${RESOURCE_ROOT}/plugin-api`;
var PROXY_PREFIX = `/api/plugin-proxy/${PLUGIN_ID}/plugin-api`;
var STANDALONE_PREFIX = "/plugin-api";
var GRAFANA_CORE_ENDPOINTS = ["/api/datasources", "/api/frontend", "/api/search", "/api/ruler"];

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
var detectGrafanaTransport = (isRunningInGrafana2) => {
  if (!isRunningInGrafana2) {
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
var normalizeUrl = (rawUrl, isRunningInGrafana2, grafanaTransport2) => {
  if (!rawUrl) {
    if (!isRunningInGrafana2) {
      return STANDALONE_PREFIX;
    }
    return grafanaTransport2 === "proxy" ? PROXY_PREFIX : RESOURCE_PREFIX;
  }
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (GRAFANA_CORE_ENDPOINTS.some((prefix) => rawUrl.startsWith(prefix))) {
    return rawUrl;
  }
  const base = !isRunningInGrafana2 ? STANDALONE_PREFIX : grafanaTransport2 === "proxy" ? PROXY_PREFIX : RESOURCE_PREFIX;
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
var createBackendSrv = (isRunningInGrafana2, grafanaTransport2) => ({
  get: (url, options = {}) => fetchWithAuth({ ...options, url: normalizeUrl(url, isRunningInGrafana2, grafanaTransport2), method: "GET" }),
  post: (url, data, options = {}) => fetchWithAuth({ ...options, url: normalizeUrl(url, isRunningInGrafana2, grafanaTransport2), data, method: "POST" }),
  delete: (url, options = {}) => fetchWithAuth({ ...options, url: normalizeUrl(url, isRunningInGrafana2, grafanaTransport2), method: "DELETE" }),
  patch: (url, data, options = {}) => fetchWithAuth({ ...options, url: normalizeUrl(url, isRunningInGrafana2, grafanaTransport2), data, method: "PATCH" }),
  request: (options) => fetchWithAuth({
    ...options,
    url: normalizeUrl(options.url ?? "", isRunningInGrafana2, grafanaTransport2),
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
var buildDefaultMetricQueries = (pipelineType, agentUid) => {
  const safeUid = agentUid && agentUid.trim() !== "" ? agentUid : "$collector_uid";
  const safePod = "$collector_pod";
  const pipelineLabel = pipelineType && pipelineType.trim() !== "" ? pipelineType : "$pipeline";
  const prefix = "# Adjust selectors to match your collector metrics";
  return {
    cpu: `${prefix}
# CPU utilisation for ${pipelineLabel}
sum(rate(otelcol_process_cpu_seconds_total{service_instance_id="${safeUid}", pod=~"${safePod}"}[5m])) * 100`,
    memory: `${prefix}
# Resident memory for ${pipelineLabel}
avg_over_time(otelcol_process_memory_rss_bytes{service_instance_id="${safeUid}", pod=~"${safePod}"}[5m]) / 1024 / 1024`,
    inbound: `${prefix}
# Items accepted into ${pipelineLabel}
sum(rate(otelcol_processor_incoming_items_total{service_instance_id="${safeUid}", pod=~"${safePod}", pipeline="${pipelineLabel}"}[5m]))`,
    outbound: `${prefix}
# Items emitted from ${pipelineLabel}
sum(rate(otelcol_processor_outgoing_items_total{service_instance_id="${safeUid}", pod=~"${safePod}", pipeline="${pipelineLabel}"}[5m]))`
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
        if (!selectedDatasource) {
          if (defaultDatasourceUid) {
            const match = available.find((ds) => ds.uid === defaultDatasourceUid);
            if (match) {
              setSelectedDatasource(match);
              onDatasourceChange?.(match);
              return;
            }
          }
          if (available.length > 0 && !readOnly) {
            setSelectedDatasource(available[0]);
            onDatasourceChange?.(available[0]);
          }
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
  }, [defaultDatasourceUid, onDatasourceChange, readOnly, selectedDatasource, orgHeaders]);
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
      const results = { cpu: "\u2014", memory: "\u2014", inbound: "\u2014", outbound: "\u2014" };
      for (const { key } of METRIC_LABELS) {
        const query = queries[key];
        if (!query || query.trim() === "") {
          results[key] = "\u2014";
          continue;
        }
        const response = await rawBackendSrv2.datasourceRequest({
          method: "GET",
          url: `/api/datasources/proxy/${selectedDatasource.id}/api/v1/query`,
          params: { query, time: now },
          headers: orgHeaders
        });
        const value = extractPrometheusValue(response?.data);
        results[key] = formatValue(key, value);
      }
      setValues(results);
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
  )), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 } }, METRIC_LABELS.map(({ key, label }) => /* @__PURE__ */ React.createElement(
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

// panels/pipeline/module.tsx
var defaultOptions = {
  pipelineType: "metrics",
  agentUid: "",
  agentName: "",
  orgName: "",
  datasourceUid: null,
  queries: buildDefaultMetricQueries("metrics")
};
var PipelineMetricsPanel = ({ options, width, height, onOptionsChange }) => {
  const style = {
    width: width ? `${width}px` : "100%",
    height: height ? `${height}px` : "100%",
    overflowY: "auto"
  };
  const handleDatasourceChange = (datasource) => {
    onOptionsChange({
      ...options,
      datasourceUid: datasource?.uid ?? null
    });
  };
  const handleQueriesChange = (next) => {
    onOptionsChange({
      ...options,
      queries: next
    });
  };
  return /* @__PURE__ */ React2.createElement("div", { style }, /* @__PURE__ */ React2.createElement(
    PipelineMetricsPanelView,
    {
      pipelineType: options.pipelineType || "metrics",
      agentUid: options.agentUid,
      agentName: options.agentName,
      orgName: options.orgName,
      allowDisable: false,
      initialEnabled: true,
      defaultDatasourceUid: options.datasourceUid ?? null,
      defaultQueries: options.queries ?? buildDefaultMetricQueries(options.pipelineType || "metrics", options.agentUid),
      readOnly: false,
      onDatasourceChange: handleDatasourceChange,
      onQueriesChange: handleQueriesChange
    }
  ));
};
var plugin = new __GRAFANA_DATA__.PanelPlugin(PipelineMetricsPanel).setPanelOptions((builder) => {
  builder.addTextInput({
    path: "pipelineType",
    name: "Pipeline identifier",
    defaultValue: defaultOptions.pipelineType
  }).addTextInput({
    path: "agentUid",
    name: "Agent UID",
    description: "Optional UID to substitute in default queries.",
    defaultValue: defaultOptions.agentUid
  }).addTextInput({
    path: "agentName",
    name: "Agent name",
    description: "Display hint for users configuring queries.",
    defaultValue: defaultOptions.agentName
  }).addTextInput({
    path: "orgName",
    name: "Organization name",
    defaultValue: defaultOptions.orgName
  });
  return builder;
});

//# sourceMappingURL=module.js.tmp.map

  return { plugin: plugin };
});