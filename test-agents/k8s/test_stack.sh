#!/usr/bin/env bash
set -euo pipefail

NS_OPERATOR="opentelemetry-operator-system"
NS_APP_A="default"
NS_APP_B="telemetry-ns"
OPERATOR_VERSION="0.138.0"
BRIDGE_IMAGE="ghcr.io/open-telemetry/opentelemetry-operator/operator-opamp-bridge:${OPERATOR_VERSION}"
CERT_MANAGER_VERSION="v1.15.3"

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

install_cert_manager() {
  echo ">> Installing cert-manager (${CERT_MANAGER_VERSION})"
  kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml
  echo "   Waiting for cert-manager pods..."
  kubectl -n cert-manager rollout status deploy/cert-manager-webhook --timeout=120s
}

install_operator() {
  echo ">> Installing OpenTelemetry Operator (${OPERATOR_VERSION}) into ${NS_OPERATOR}"
  ensure_ns "${NS_OPERATOR}"

  # CRDs first (operator chart normally installs these; we do it explicitly to be deterministic)
  kubectl apply -f https://raw.githubusercontent.com/open-telemetry/opentelemetry-operator/v${OPERATOR_VERSION}/config/crd/bases/opentelemetry.io_opentelemetrycollectors.yaml

  # Operator deployment (minimal manifest that mirrors the release bundle)
  cat <<EOF | kubectl apply -n ${NS_OPERATOR} -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: opentelemetry-operator
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: opentelemetry-operator
rules:
- apiGroups: [""]
  resources: ["pods","services","endpoints","events","configmaps","secrets","serviceaccounts","namespaces"]
  verbs: ["*"]
- apiGroups: ["apps"]
  resources: ["deployments","daemonsets","statefulsets","replicasets"]
  verbs: ["*"]
- apiGroups: ["policy"]
  resources: ["poddisruptionbudgets"]
  verbs: ["*"]
- apiGroups: ["opentelemetry.io"]
  resources: ["opentelemetrycollectors","opentelemetrycollectors/status","opentelemetrycollectors/finalizers"]
  verbs: ["*"]
- apiGroups: ["networking.k8s.io"]
  resources: ["networkpolicies"]
  verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: opentelemetry-operator
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: opentelemetry-operator
subjects:
- kind: ServiceAccount
  name: opentelemetry-operator
  namespace: ${NS_OPERATOR}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: opentelemetry-operator
spec:
  replicas: 1
  selector:
    matchLabels: {app: opentelemetry-operator}
  template:
    metadata:
      labels: {app: opentelemetry-operator}
    spec:
      serviceAccountName: opentelemetry-operator
      containers:
      - name: manager
        image: ghcr.io/open-telemetry/opentelemetry-operator/opentelemetry-operator:${OPERATOR_VERSION}
        args:
          - "--zap-log-level=info"
        env:
          - name: WATCH_NAMESPACE
            valueFrom:
              fieldRef: {fieldPath: metadata.namespace}
EOF
  echo "   Waiting for operator..."
  kubectl -n ${NS_OPERATOR} rollout status deploy/opentelemetry-operator --timeout=180s
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

detect_local_backend_gateway() {
  if [ -n "${LOCAL_BACKEND_GATEWAY:-}" ]; then
    echo "${LOCAL_BACKEND_GATEWAY}"
    return
  fi

  if gateway=$(docker network inspect otel-collector-fleet-management_default --format '{{ (index .IPAM.Config 0).Gateway }}' 2>/dev/null); then
    if [ -n "${gateway}" ] && [ "${gateway}" != "<no value>" ]; then
      echo "${gateway}"
      return
    fi
  fi

  # Fallback for historical compose setups
  echo "192.168.0.1"
}

ensure_bridge_config() {
  local backend_gateway
  backend_gateway=$(detect_local_backend_gateway)

  echo "   Using local backend gateway: ${backend_gateway}"

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
          endpoint: "ws://${backend_gateway}:4321/v1/opamp" # auto-detected Docker network gateway
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
  config: |
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
        logs:    { receivers: [otlp], processors: [batch], exporters: [debug] }
        metrics: { receivers: [otlp], processors: [batch], exporters: [debug] }
        traces:  { receivers: [otlp], processors: [batch], exporters: [debug] }
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
  config: |
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
        logs:    { receivers: [otlp], processors: [batch], exporters: [debug] }
        metrics: { receivers: [otlp], processors: [batch], exporters: [debug] }
        traces:  { receivers: [otlp], processors: [batch], exporters: [debug] }
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
  config: |
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
        logs:    { receivers: [otlp], processors: [batch], exporters: [debug] }
        metrics: { receivers: [otlp], processors: [batch], exporters: [debug] }
        traces:  { receivers: [otlp], processors: [batch], exporters: [debug] }
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
  kubectl -n ${NS_APP_A} delete opentelemetrycollector test-collector --ignore-not-found
  kubectl -n ${NS_APP_B} delete opentelemetrycollector test-collector --ignore-not-found
  kubectl -n ${NS_APP_B} delete ns ${NS_APP_B} --ignore-not-found

  echo ">> Cleaning up bridge"
  kubectl -n ${NS_OPERATOR} delete deploy/opamp-bridge svc/opamp-bridge --ignore-not-found

  echo ">> Cleaning up operator"
  kubectl -n ${NS_OPERATOR} delete deploy/opentelemetry-operator --ignore-not-found
  kubectl delete clusterrolebinding opentelemetry-operator --ignore-not-found
  kubectl delete clusterrole opentelemetry-operator --ignore-not-found
  kubectl -n ${NS_OPERATOR} delete sa opentelemetry-operator --ignore-not-found
  kubectl -n ${NS_OPERATOR} delete ns ${NS_OPERATOR} --ignore-not-found

  echo ">> Removing cert-manager"
  kubectl delete -f https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml --ignore-not-found
}

case "${1:-}" in
  up)       install_cert_manager; install_operator; ensure_bridge_config; deploy_bridge; create_test_collectors; status ;;
  down)     cleanup ;;
  status)   status ;;
  pf-bridge) pf_bridge ;;
  *)        usage; exit 1 ;;
esac
