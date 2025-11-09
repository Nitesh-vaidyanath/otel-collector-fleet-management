# Kubernetes Demo Setup

This directory provides the minimal manifests you need to exercise the Grafana OpAMP bridge workflow in a Kubernetes cluster.

## 1. Install dependencies

```bash
# cert-manager (required by the OpenTelemetry operator)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.3/cert-manager.yaml
kubectl -n cert-manager rollout status deploy/cert-manager-webhook --timeout=180s

# OpenTelemetry operator
kubectl create namespace opentelemetry-operator-system
kubectl apply -n opentelemetry-operator-system \
  -f https://github.com/open-telemetry/opentelemetry-operator/releases/download/v0.104.0/opentelemetry-operator.yaml
kubectl -n opentelemetry-operator-system rollout status deploy/opentelemetry-operator-controller-manager --timeout=180s
```

## 2. Configure the OpAMP bridge

Edit `opamp-bridge.yaml` and change the `spec.endpoint` value to the reachable WebSocket address of your OpAMP server (it must be accessible from the cluster). Examples:

- Docker Desktop host backend: `ws://host.docker.internal:4321/v1/opamp`
- In-cluster service: `ws://fleet-backend.grafana-fleet.svc.cluster.local:4321/v1/opamp`

Then apply the manifest:

```bash
kubectl apply -f opamp-bridge.yaml
```

The operator will reconcile the `OpAMPBridge` custom resource and create the bridge deployment/service automatically.

## 3. Add collectors (optional)

Once the bridge is running you can create `OpenTelemetryCollector` resources in your namespaces. Label them with the desired tenant/org labels (`tenant.name`, `organization.id`, etc.) so the backend routes them correctly.

## 4. Tear down

```bash
kubectl delete -f opamp-bridge.yaml
kubectl delete namespace opentelemetry-operator-system
kubectl delete -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.3/cert-manager.yaml
```

