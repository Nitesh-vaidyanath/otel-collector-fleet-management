# Documentation Index

Complete documentation for OTel Collector Agent Fleet Management plugin.

## 📚 Core Documentation

### Configuration & Setup
- **[Plugin Configuration Guide](./PLUGIN_CONFIGURATION.md)** ⭐ **START HERE**
  - Complete guide to plugin settings
  - Understanding `backend: true` and how it works
  - `opampServerMode` and `opampServerURL` explained
  - OpAMP server modes (embedded vs external)
  - Configuration flow, caveats, and limitations
  - Best practices and examples

- **[Backend Configuration](./BACKEND_CONFIG.md)**
  - Database setup (MySQL and MySQL-compatible services)
  - Connection strings and authentication
  - Cloud SQL direct TCP connection

- **[Standalone OpAMP Setup](./STANDALONE_OPAMP_SETUP.md)**
  - Running OpAMP server as separate service
  - Docker Compose configuration
  - TLS/HTTPS setup
  - Switching between modes

- **[MySQL Schema and Relationship Graph](./MYSQL_SCHEMA.md)**
  - Single-database baseline, table keys and foreign-key diagram
- **[Agent Deployment Models](./AGENT_DEPLOYMENT_MODELS.md)**
  - Least-privilege sidecar, per-node agent, eBPF and operator alternatives
  - Grafana/Kubernetes permission boundaries, SBOM and AST/SAST pipeline

### API & Communication
- **[API Specification](./API_SPEC.md)**
  - Complete REST API reference
  - All endpoints with examples
  - Request/response formats
  - Authentication and authorization

- **[API Communication](./API_COMMUNICATION.md)**
  - How frontend communicates with backend
  - Request/response flow
  - Error handling
  - Authentication flow

### Architecture & Setup
- **[OpAMP Server Setup](./OPAMP_SERVER_SETUP.md)**
  - OpAMP server architecture
  - How it's embedded in the plugin
  - Configuration options
  - Protocol details
- **[Kubernetes Deployment Guide](./KUBERNETES_DEPLOYMENT.md)**
  - Deploying Grafana + fleet-backend in Kubernetes
  - Persistent storage, services, and TLS notes
- **[Kubernetes Demo Setup](../k8s/README.md)**
  - Install operator + bridge with a single `OpAMPBridge` CRD
  - Instructions for pointing the bridge at your OpAMP endpoint
- **[Pending Requests Fix](./KUBERNETES_PENDING_REQUESTS_FIX.md)**
  - Historical context on request throttling and how we mitigated it
- **[OpAMP Server Internals](./opamp-server/STRUCTURE.md)**
  - Detailed breakdown of packages inside `opamp-server/pkg`
- **[Plugin Developer Guide](./plugin/README.md)**
  - Frontend build/lint/test instructions
- **[OpAMP Server README](./opamp-server/README.md)**
  - Backend build + contribution guidance

### Troubleshooting
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)**
  - Common issues and solutions
  - Plugin loading problems
  - Database connection issues
  - OpAMP server problems

## 📖 Quick Reference

### For Users
1. Start with [Plugin Configuration Guide](./PLUGIN_CONFIGURATION.md)
2. Set up database: [Backend Configuration](./BACKEND_CONFIG.md)
3. Configure OpAMP: [Standalone OpAMP Setup](./STANDALONE_OPAMP_SETUP.md) (if needed)
4. Troubleshooting: [Troubleshooting Guide](./TROUBLESHOOTING.md)

### For Developers
1. API Integration: [API Specification](./API_SPEC.md)
2. Communication: [API Communication](./API_COMMUNICATION.md)
3. Architecture: [OpAMP Server Setup](./OPAMP_SERVER_SETUP.md)

## 🔍 Finding What You Need

**Want to configure the plugin?**
→ [Plugin Configuration Guide](./PLUGIN_CONFIGURATION.md)

**Setting up database?**
→ [Backend Configuration](./BACKEND_CONFIG.md)

**Running OpAMP separately?**
→ [Standalone OpAMP Setup](./STANDALONE_OPAMP_SETUP.md)

**Integrating with API?**
→ [API Specification](./API_SPEC.md)

**Something not working?**
→ [Troubleshooting Guide](./TROUBLESHOOTING.md)
