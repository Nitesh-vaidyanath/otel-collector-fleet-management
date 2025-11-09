#!/usr/bin/env bash
set -euo pipefail

NS_OPERATOR="opentelemetry-operator-system"
NS_APP_A="default"
NS_APP_B="telemetry-ns"
OPERATOR_VERSION="0.138.0"
BRIDGE_IMAGE="ghcr.io/open-telemetry/opentelemetry-operator/operator-opamp-bridge:${OPERATOR_VERSION}"
CERT_MANAGER_VERSION="v1.15.3"
# BRIDGE_ENDPOINT may be overridden to point at a remote backend

usage() {
  cat <<USAGE
Usage: $0 [up|down|status|pf-bridge]

  up        Install cert-manager + OTel Operator, deploy OpAMP Bridge, and create test collectors
  down      Remove all created resources (collectors, bridge, operator, cert-manager)
  status    Show quick status of bridge and collectors
  pf-bridge Port-forward the OpAMP Bridge service to localhost:8080 (ws/ws+tls handled by bridge)
USAGE
}

ensure_ns() {
  kubectl get ns "$1" >/dev/null 2>&1 || kubectl create ns "$1"
}

wait_for_namespace_gone() {
  local namespace="$1"
  local timeout="${2:-180}"
  local elapsed=0
  while kubectl get ns "${namespace}" >/dev/null 2>&1; do
    if [ "${elapsed}" -ge "${timeout}" ]; then
      echo "WARNING: namespace ${namespace} still exists after ${timeout}s"
      return
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
}

wait_for_cert_manager_ca() {
  echo "   Waiting for cert-manager webhook CA bundle..."
  local elapsed=0
  while true; do
    if kubectl get mutatingwebhookconfiguration cert-manager-webhook >/dev/null 2>&1; then
      ca=$(kubectl get mutatingwebhookconfiguration cert-manager-webhook -o jsonpath='{.webhooks[0].clientConfig.caBundle}' 2>/dev/null || echo "")
      if [ -n "${ca}" ]; then
        echo "   cert-manager webhook CA bundle injected"
        return
      fi
    fi
    if [ "${elapsed}" -ge 180 ]; then
      echo "WARNING: cert-manager webhook CA bundle still empty after 180s"
      return
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
}

install_cert_manager() {
  echo ">> Installing cert-manager (${CERT_MANAGER_VERSION})"
  if kubectl get ns cert-manager >/dev/null 2>&1; then
    phase=$(kubectl get ns cert-manager -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
    if [ "${phase}" = "Terminating" ]; then
      echo "   cert-manager namespace is terminating; cleaning up residual objects"
      kubectl delete ns cert-manager --wait=false || true
      wait_for_namespace_gone cert-manager 180
    fi
  fi
  kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml
  echo "   Waiting for cert-manager pods..."
  kubectl -n cert-manager rollout status deploy/cert-manager-webhook --timeout=180s
  wait_for_cert_manager_ca
}

install_operator() {
  echo ">> Installing OpenTelemetry Operator (${OPERATOR_VERSION}) into ${NS_OPERATOR}"
  ensure_ns "${NS_OPERATOR}"

  kubectl apply -n ${NS_OPERATOR} -f https://github.com/open-telemetry/opentelemetry-operator/releases/download/v${OPERATOR_VERSION}/opentelemetry-operator.yaml

  echo "   Waiting for operator..."
  kubectl -n ${NS_OPERATOR} rollout status deploy/opentelemetry-operator-controller-manager --timeout=180s
}

deploy_bridge() {
  echo ">> Deploying OpAMP Bridge (${BRIDGE_IMAGE}) in ${NS_OPERATOR}"
  cat <<EOF | kubectl apply -n ${NS_OPERATOR} -f -
apiVersion: v1
kind: Service
metadata:
  name: opamp-bridge
spec:
  selector: {app: opamp-bridge}
  ports:
  - name: http
    port: 8080
    targetPort: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: opamp-bridge
spec:
  replicas: 1
  selector: {matchLabels: {app: opamp-bridge}}
  template:
    metadata:
      labels: {app: opamp-bridge}
    spec:
      containers:
      - name: opamp-bridge
        image: ${BRIDGE_IMAGE}
        args:
          - "--zap-log-level=debug"
          - "--config-file=/conf/remoteconfiguration.yaml"
        ports:
          - name: http
            containerPort: 8080
        env:
          - name: OTELCOL_NAMESPACE
            valueFrom:
              fieldRef:
                fieldPath: metadata.namespace
        volumeMounts:
          - name: opamp-bridge-internal
            mountPath: /conf
      volumes:
        - name: opamp-bridge-internal
          configMap:
            name: opamp-bridge-config
EOF
  echo "   Waiting for bridge..."
  kubectl -n ${NS_OPERATOR} rollout status deploy/opamp-bridge --timeout=120s
}

ensure_bridge_config() {
  local bridge_endpoint
  bridge_endpoint="${BRIDGE_ENDPOINT:-ws://fleet-backend.grafana-fleet.svc.cluster.local:4321/v1/opamp}"

  echo "   Using bridge endpoint: ${bridge_endpoint}"

  cat <<EOF | kubectl apply -n ${NS_OPERATOR} -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: opamp-bridge-config
data:
  remoteconfiguration.yaml: |
    bridges:
      - manager:
          namespaces: ["default", "telemetry-ns"]
        opamp:
          endpoint: "${bridge_endpoint}"
        labels:
          tenant.name: "test"
EOF
}

create_test_collectors() {
  echo ">> Creating test collectors (one DaemonSet, one Deployment), each with label: opentelemetry.io/opamp-managed=true"

  ensure_ns "${NS_APP_B}"

  # 1) DaemonSet agent (remote mutations will be blocked by webhook; label added per your requirement)
  cat <<'EOF' | kubectl apply -n default -f -
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: test-collector
  labels:
    opentelemetry.io/opamp-managed: "true"  # requested label
    tenant: test
spec:
  mode: daemonset
  image: otel/opentelemetry-collector-contrib:latest
  config:
    receivers:
      otlp:
        protocols:
          http: {}
          grpc: {}
    processors:
      batch: {}
    exporters:
      debug: {}
    service:
      pipelines:
        logs:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
        metrics:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
        traces:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
EOF

  # 2) Deployment gateway (fully remote-manageable; label added)
  cat <<'EOF' | kubectl apply -n telemetry-ns -f -
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: test-collector
  labels:
    opentelemetry.io/opamp-managed: "true"  # requested label
    tenant: test1
spec:
  mode: deployment
  replicas: 1
  image: otel/opentelemetry-collector-contrib:latest
  config:
    receivers:
      otlp:
        protocols:
          http: {}
          grpc: {}
    processors:
      batch: {}
    exporters:
      debug: {}
    service:
      pipelines:
        logs:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
        metrics:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
        traces:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
EOF


  # 2) Deployment gateway (fully remote-manageable; label added)
  cat <<'EOF' | kubectl apply -n telemetry-ns -f -
apiVersion: opentelemetry.io/v1beta1
kind: OpenTelemetryCollector
metadata:
  name: test-collector-1
  labels:
    opentelemetry.io/opamp-managed: "true"  # requested label
    tenant: test1
spec:
  mode: deployment
  replicas: 1
  image: otel/opentelemetry-collector-contrib:latest
  config:
    receivers:
      otlp:
        protocols:
          http: {}
          grpc: {}
    processors:
      batch: {}
    exporters:
      debug: {}
    service:
      pipelines:
        logs:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
        metrics:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
        traces:
          receivers: [otlp]
          processors: [batch]
          exporters: [debug]
EOF


  echo "   Waiting for DS in ${NS_APP_A} and Deploy in ${NS_APP_B}..."
  kubectl -n ${NS_APP_A} rollout status ds/test-collector-collector --timeout=180s || true
  kubectl -n ${NS_APP_B} rollout status deploy/test-collector-collector --timeout=180s || true
}

status() {
  echo ">> Operator / Bridge"
  kubectl -n ${NS_OPERATOR} get pods -l app=opentelemetry-operator -o wide || true
  kubectl -n ${NS_OPERATOR} get pods -l app=opamp-bridge -o wide || true
  echo ">> Collectors"
  kubectl -n ${NS_APP_A} get otelcol || true
  kubectl -n ${NS_APP_B} get otelcol || true
  echo ">> DS/Deploy"
  kubectl -n ${NS_APP_A} get ds -l app.kubernetes.io/name=test-collector-collector || true
  kubectl -n ${NS_APP_B} get deploy -l app.kubernetes.io/name=test-collector-collector || true
}

pf_bridge() {
  echo ">> Port-forwarding OpAMP Bridge on http://localhost:8080"
  kubectl -n ${NS_OPERATOR} port-forward svc/opamp-bridge 8080:8080
}

cleanup() {
  echo ">> Cleaning up collectors"
  kubectl -n ${NS_APP_A} delete opentelemetrycollector test-collector --ignore-not-found --wait=false
  kubectl -n ${NS_APP_B} delete opentelemetrycollector test-collector --ignore-not-found --wait=false
  kubectl -n ${NS_APP_B} delete ns ${NS_APP_B} --ignore-not-found --wait=false

  echo ">> Cleaning up bridge"
  kubectl -n ${NS_OPERATOR} delete deploy/opamp-bridge svc/opamp-bridge configmap/opamp-bridge-config --ignore-not-found --wait=false

  echo ">> Cleaning up operator"
  kubectl delete -n ${NS_OPERATOR} -f https://github.com/open-telemetry/opentelemetry-operator/releases/download/v${OPERATOR_VERSION}/opentelemetry-operator.yaml --ignore-not-found --wait=false
  kubectl -n ${NS_OPERATOR} delete ns ${NS_OPERATOR} --ignore-not-found --wait=false

  echo ">> Removing cert-manager"
  kubectl delete -f https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml --ignore-not-found --wait=false
}

case "${1:-}" in
  up)       install_cert_manager; install_operator; ensure_bridge_config; deploy_bridge; create_test_collectors; status ;;
  down)     cleanup ;;
  status)   status ;;
  pf-bridge) pf_bridge ;;
  *)        usage; exit 1 ;;
esac
