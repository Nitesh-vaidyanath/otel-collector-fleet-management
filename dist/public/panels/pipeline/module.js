define(["@grafana/data","@grafana/runtime","@grafana/ui","react","react-dom"], function(__GRAFANA_DATA__, __GRAFANA_RUNTIME__, __GRAFANA_UI__, __REACT__, __REACT_DOM__) {
// panels/pipeline/module.tsx
var React2 = __REACT__.default || __REACT__;


// panels/pipeline/PanelView.tsx
var React = __REACT__.default || __REACT__; var { useCallback, useEffect, useMemo, useState } = __REACT__;

var EMPTY_VALUES = { cpu: null, memory: null, inbound: null, outbound: null };
var EMPTY_FORMATS = { cpu: "\u2014", memory: "\u2014", inbound: "\u2014", outbound: "\u2014" };
var SUPPORTED_PROM_DATASOURCES = /* @__PURE__ */ new Set(["prometheus", "mimir", "grafana-mimir-datasource", "thanos"]);
var METRIC_DEFINITIONS = [
  { key: "cpu", label: "CPU Usage", helper: "Expected to return utilisation in percentage (0-100)." },
  { key: "memory", label: "Memory Usage", helper: "Expected to return memory in megabytes." },
  { key: "inbound", label: "Inbound Bandwidth", helper: "Expected to return inbound throughput in kilobytes per second." },
  { key: "outbound", label: "Outbound Bandwidth", helper: "Expected to return outbound throughput in kilobytes per second." }
];
var createDefaultQueries = (pipelineType, agentUid) => {
  const safeUid = agentUid && agentUid.trim() !== "" ? agentUid : "$collector_uid";
  const pipelineLabel = pipelineType || "$pipeline";
  const comment = "# Replace selectors so they match your Prometheus/Mimir metrics";
  return {
    cpu: `${comment}
# Average CPU utilisation for ${pipelineLabel}
sum(rate(otelcol_process_cpu_seconds_total{service_instance_id="${safeUid}"}[5m])) * 100`,
    memory: `${comment}
# Resident memory for ${pipelineLabel}
avg_over_time(otelcol_process_resident_memory_bytes{service_instance_id="${safeUid}"}[5m]) / 1024 / 1024`,
    inbound: `${comment}
# Inbound KB/s for ${pipelineLabel}
sum(rate(otelcol_processor_batch_batch_send_size_sum{service_instance_id="${safeUid}", pipeline="${pipelineLabel}"}[5m])) / 1024`,
    outbound: `${comment}
# Outbound KB/s for ${pipelineLabel}
sum(rate(otelcol_exporter_sent_bytes{service_instance_id="${safeUid}", pipeline="${pipelineLabel}"}[5m])) / 1024`
  };
};
var formatMetricValue = (key, value) => {
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
var extractPrometheusValue = (response) => {
  if (!response || response.status !== "success" || !response.data) {
    return null;
  }
  const { data } = response;
  if (data.resultType === "scalar" && Array.isArray(data.result) && data.result.length >= 2) {
    const value = parseFloat(data.result[1]);
    return Number.isFinite(value) ? value : null;
  }
  if (data.resultType === "vector" && Array.isArray(data.result)) {
    if (data.result.length === 0) {
      return null;
    }
    const summed = data.result.reduce((acc, sample) => {
      if (!sample || !Array.isArray(sample.value) || sample.value.length < 2) {
        return acc;
      }
      const parsed = parseFloat(sample.value[1]);
      if (!Number.isFinite(parsed)) {
        return acc;
      }
      return acc + parsed;
    }, 0);
    return Number.isFinite(summed) ? summed : null;
  }
  return null;
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
  title = "Custom Metrics Panel",
  onQueriesChange,
  onDatasourceChange
}) => {
  const [datasources, setDatasources] = useState([]);
  const [datasourceError, setDatasourceError] = useState(null);
  const [selectedDatasource, setSelectedDatasource] = useState(null);
  const [queries, setQueries] = useState(() => defaultQueries ?? createDefaultQueries(pipelineType, agentUid));
  const [enabled, setEnabled] = useState(allowDisable ? initialEnabled : true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRunAt, setLastRunAt] = useState(null);
  const [values, setValues] = useState({ ...EMPTY_VALUES });
  const [formattedValues, setFormattedValues] = useState({ ...EMPTY_FORMATS });
  useEffect(() => {
    if (defaultQueries) {
      setQueries(defaultQueries);
    }
  }, [defaultQueries]);
  const resolveDatasourceByUid = useCallback(async (uid) => {
    try {
      const dsSrv = getDataSourceSrv();
      const dsSettings = await dsSrv.get(uid);
      if (dsSettings && typeof dsSettings === "object") {
        const summary = {
          id: dsSettings.id,
          uid: dsSettings.uid,
          name: dsSettings.name,
          type: dsSettings.type
        };
        setSelectedDatasource(summary);
        onDatasourceChange?.(summary);
      }
    } catch (err) {
      console.error("Failed to resolve datasource by UID", err);
    }
  }, [onDatasourceChange]);
  useEffect(() => {
    let mounted = true;
    const loadDatasources = async () => {
      try {
        const response = await __GRAFANA_RUNTIME__.getBackendSrv().get("/api/datasources");
        if (!mounted) {
          return;
        }
        const available = Array.isArray(response) ? response.filter((item) => SUPPORTED_PROM_DATASOURCES.has(item.type)).map((item) => ({ id: item.id, uid: item.uid, name: item.name, type: item.type })) : [];
        setDatasources(available);
        setDatasourceError(available.length === 0 ? "No Prometheus-compatible data sources were found." : null);
        if (!selectedDatasource && available.length > 0) {
          setSelectedDatasource(available[0]);
          onDatasourceChange?.(available[0]);
        }
      } catch (err) {
        if (!mounted) {
          return;
        }
        console.error("Failed to load Grafana data sources", err);
        setDatasourceError(err?.message || "Failed to load data sources. Ensure Prometheus or Mimir is available.");
      }
    };
    loadDatasources();
    return () => {
      mounted = false;
    };
  }, [selectedDatasource, onDatasourceChange]);
  useEffect(() => {
    if (defaultDatasourceUid) {
      resolveDatasourceByUid(defaultDatasourceUid);
    }
  }, [defaultDatasourceUid, resolveDatasourceByUid]);
  const handleDatasourceChangeInternal = useCallback(
    (event) => {
      const id = Number(event.target.value);
      const summary = datasources.find((ds) => ds.id === id) || null;
      setSelectedDatasource(summary);
      onDatasourceChange?.(summary);
    },
    [datasources, onDatasourceChange]
  );
  const handleQueryChange = useCallback(
    (key, value) => {
      setQueries((prev) => {
        const next = { ...prev, [key]: value };
        onQueriesChange?.(next);
        return next;
      });
    },
    [onQueriesChange]
  );
  const runQueries = useCallback(async () => {
    if (!selectedDatasource) {
      setError("Select a Prometheus-compatible data source before running queries.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const metricPromises = Object.keys(queries).map(async (key) => {
        const query = queries[key];
        if (!query || query.trim() === "") {
          return { key, value: null };
        }
        const response = await __GRAFANA_RUNTIME__.getBackendSrv().datasourceRequest({
          method: "GET",
          url: `/api/datasources/proxy/${selectedDatasource.id}/api/v1/query`,
          params: {
            query,
            time: Math.floor(Date.now() / 1e3)
          }
        });
        const parsedValue = extractPrometheusValue(response?.data);
        return { key, value: parsedValue };
      });
      const resolved = await Promise.all(metricPromises);
      const nextValues = { ...EMPTY_VALUES };
      const nextFormats = { ...EMPTY_FORMATS };
      resolved.forEach(({ key, value }) => {
        nextValues[key] = value;
        nextFormats[key] = formatMetricValue(key, value);
      });
      setValues(nextValues);
      setFormattedValues(nextFormats);
      setLastRunAt(Date.now());
    } catch (err) {
      console.error("Failed to execute Prometheus query", err);
      setError(err?.data?.message || err?.message || "Query failed. Check your selectors and try again.");
    } finally {
      setLoading(false);
    }
  }, [queries, selectedDatasource]);
  const pipelineTitle = useMemo(() => {
    return `${pipelineType} pipeline`;
  }, [pipelineType]);
  return /* @__PURE__ */ React.createElement("div", { style: { width: "100%" } }, /* @__PURE__ */ React.createElement(
    "div",
    {
      style: {
        padding: 16,
        borderRadius: 8,
        border: "1px solid #E5E7EB",
        background: "#F8FAFC"
      }
    },
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#0F172A" } }, title, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: "#6B7280", marginLeft: 8 } }, pipelineTitle)), allowDisable && /* @__PURE__ */ React.createElement("label", { style: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "#1F2937" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: enabled, onChange: () => setEnabled((prev) => !prev) }), "Enable query panel")),
    allowDisable && !enabled && /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          marginTop: 12,
          padding: 12,
          background: "#FFFFFF",
          borderRadius: 6,
          border: "1px dashed #CBD5F5",
          color: "#475569",
          fontSize: 12,
          lineHeight: 1.5
        }
      },
      "Toggle this panel and pick a Prometheus-compatible datasource to replace synthetic gauges for the ",
      pipelineType,
      " pipeline. Until the OpAMP bridge emits real usage metrics, this is the recommended workaround.",
      datasourceError && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, color: "#B45309" } }, datasourceError)
    ),
    (!allowDisable || enabled) && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 14, display: "flex", flexDirection: "column", gap: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: "#1F2937" } }, "Data source"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: selectedDatasource?.id ?? "",
        onChange: handleDatasourceChangeInternal,
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
        disabled: loading || !selectedDatasource,
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
    )), /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12
        }
      },
      Object.keys(queries).map((key) => /* @__PURE__ */ React.createElement("div", { key, style: { display: "flex", flexDirection: "column", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "#1F2937" } }, METRIC_DEFINITIONS.find((def) => def.key === key)?.label), /* @__PURE__ */ React.createElement(
        "textarea",
        {
          value: queries[key],
          onChange: (event) => handleQueryChange(key, event.target.value),
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
      ), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#64748B" } }, METRIC_DEFINITIONS.find((def) => def.key === key)?.helper))),
      /* @__PURE__ */ React.createElement(
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
        " Collector ",
        /* @__PURE__ */ React.createElement("code", null, agentName || agentUid || "unknown"),
        ", pipeline ",
        /* @__PURE__ */ React.createElement("code", null, pipelineType),
        ", org ",
        /* @__PURE__ */ React.createElement("code", null, orgName || "default"),
        ". Use labels such as ",
        /* @__PURE__ */ React.createElement("code", null, "service_instance_id"),
        ", ",
        /* @__PURE__ */ React.createElement("code", null, "namespace"),
        ", or ",
        /* @__PURE__ */ React.createElement("code", null, "cluster"),
        " to scope the query."
      )
    ), /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12
        }
      },
      Object.keys(formattedValues).map((key) => /* @__PURE__ */ React.createElement(
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
        /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#64748B" } }, METRIC_DEFINITIONS.find((def) => def.key === key)?.label),
        /* @__PURE__ */ React.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "#0F172A" } }, formattedValues[key])
      ))
    ), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#64748B", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 } }, /* @__PURE__ */ React.createElement("span", null, "Last updated: ", lastRunAt ? new Date(lastRunAt).toLocaleString() : "Not run yet"), /* @__PURE__ */ React.createElement("span", null, "Queries execute via Grafana's data-source proxy. Ensure the selected data source can reach your metrics backend.")), error && /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          padding: 10,
          borderRadius: 6,
          border: "1px solid #FECACA",
          background: "#FEF2F2",
          fontSize: 12,
          color: "#B91C1C"
        }
      },
      error
    ), datasourceError && !selectedDatasource && /* @__PURE__ */ React.createElement(
      "div",
      {
        style: {
          padding: 10,
          borderRadius: 6,
          border: "1px solid #FBBF24",
          background: "#FFFBEB",
          fontSize: 12,
          color: "#92400E"
        }
      },
      datasourceError
    ))
  ));
};

// panels/pipeline/module.tsx
var defaultOptions = {
  pipelineType: "metrics",
  agentUid: "",
  agentName: "",
  orgName: "",
  datasourceUid: void 0,
  queries: createDefaultQueries("metrics")
};
var PipelineMetricsPanel = ({ options, width, height, onOptionsChange }) => {
  const style = {
    width: width ? `${width}px` : "100%",
    height: height ? `${height}px` : "100%",
    overflowY: "auto"
  };
  return /* @__PURE__ */ React2.createElement("div", { style }, /* @__PURE__ */ React2.createElement(
    PipelineMetricsPanelView,
    {
      pipelineType: options.pipelineType,
      agentUid: options.agentUid,
      agentName: options.agentName,
      orgName: options.orgName,
      defaultDatasourceUid: options.datasourceUid ?? null,
      defaultQueries: options.queries ?? createDefaultQueries(options.pipelineType, options.agentUid),
      allowDisable: false,
      initialEnabled: true,
      onQueriesChange: (next) => onOptionsChange({ ...options, queries: next }),
      onDatasourceChange: (ds) => onOptionsChange({ ...options, datasourceUid: ds?.uid })
    }
  ));
};
var plugin = new __GRAFANA_DATA__.PanelPlugin(PipelineMetricsPanel).setPanelOptions((builder) => {
  builder.addTextInput({
    path: "pipelineType",
    name: "Pipeline name",
    description: "Used to generate default queries and labels.",
    defaultValue: defaultOptions.pipelineType
  }).addTextInput({
    path: "agentUid",
    name: "Agent UID",
    description: "Optional: used in default query templates.",
    defaultValue: defaultOptions.agentUid
  }).addTextInput({
    path: "agentName",
    name: "Agent name",
    description: "Optional: display hint for query authors.",
    defaultValue: defaultOptions.agentName
  }).addTextInput({
    path: "orgName",
    name: "Organization name",
    description: "Optional: display hint for query authors.",
    defaultValue: defaultOptions.orgName
  }).addTextInput({
    path: "datasourceUid",
    name: "Default datasource UID",
    description: "Optional: pre-select a Prometheus-compatible datasource by UID.",
    defaultValue: defaultOptions.datasourceUid
  });
  return builder;
});

//# sourceMappingURL=module.js.tmp.map

  return { plugin: plugin };
});