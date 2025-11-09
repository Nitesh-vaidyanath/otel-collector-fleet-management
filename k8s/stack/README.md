# Kubernetes Stack Deployment

This stack deploys Grafana, MySQL, and the Fleet Management backend directly inside a Kubernetes cluster. Use it when you want the OpAMP bridge and collectors to talk to the backend over in-cluster DNS (no Docker host routing required).

## Components & Namespaces

| Namespace | Components |
|-----------|------------|
| `grafana-fleet` | MySQL, fleet-backend (loopback API), Grafana (with plugin preloaded) |
| `opentelemetry-operator-system` | cert-manager (optional), OpenTelemetry Operator, OpAMP bridge, sample collectors |

## Prerequisites

1. Build the plugin bundle: `make build-plugin`
2. Build and push the required images:
   ```bash
   # Grafana with the plugin baked in
   docker build -f k8s/stack/Dockerfile.grafana -t <registry>/grafana-fleet:latest .
   docker push <registry>/grafana-fleet:latest

   # Fleet backend loopback server (OpAMP HTTP API)
   docker build -f opamp-server/Dockerfile.loopback -t <registry>/fleet-backend-loopback:latest opamp-server
   docker push <registry>/fleet-backend-loopback:latest
   ```
3. Ensure your kube-context points to the target cluster and you have rights to create cluster-scoped resources.

## Deploy core stack

Replace `<registry>` placeholders in `grafana.yaml` and `fleet-backend.yaml` with the registry you pushed to, then apply the manifests in order:

```bash
kubectl apply -f k8s/stack/namespaces.yaml
kubectl apply -f k8s/stack/mysql.yaml
kubectl apply -f k8s/stack/fleet-backend.yaml
kubectl apply -f k8s/stack/grafana.yaml
```

Grafana will be exposed on `Service/grafana` (ClusterIP). Port-forward or attach an Ingress as needed:
```bash
kubectl -n grafana-fleet port-forward svc/grafana 3000:3000
```

## Deploy operator + bridge + collectors

The `test-agents/k8s/test_stack.sh` script now handles:

- Installing cert-manager
- Installing the OpenTelemetry Operator (namespace `opentelemetry-operator-system`)
- Creating an in-cluster `Service/Endpoints` that points the bridge at the `fleet-backend` Service
- Deploying the OpAMP bridge and sample collectors (daemonset + deployment)

Run:
```bash
./test-agents/k8s/test_stack.sh up
```

To tear everything down:
```bash
./test-agents/k8s/test_stack.sh down
kubectl delete -f k8s/stack/grafana.yaml
kubectl delete -f k8s/stack/fleet-backend.yaml
kubectl delete -f k8s/stack/mysql.yaml
kubectl delete -f k8s/stack/namespaces.yaml
```

## Configuration

- Database credentials live in `Secret/mysql-credentials` (namespace `grafana-fleet`). Adjust `mysql.yaml` if you need stronger secrets.
- Fleet-backend env vars mirror the docker-compose settings; update `k8s/stack/fleet-backend.yaml` if your DSN or TLS setup differs.
- Grafana deployment sets `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS` and the same env vars used in compose.

## Notes

- The Grafana image must contain the built plugin under `/var/lib/grafana/plugins/otel-collector-agent-fleet-management`. Build & push it before deploying.
- This stack uses `emptyDir` volumes for MySQL for simplicity. Switch to a proper PVC for persistent data in production.
- `test_stack.sh up` now creates a `fleet-backend-external` Service + Endpoints inside the operator namespace that points to the in-cluster backend. If you're also running Docker Compose, comment out `ensure_local_backend_service` in the script to avoid clashes.
