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
  - Database setup (MySQL, Cloud SQL, AWS RDS, Spanner)
  - Connection strings and authentication
  - Cloud SQL direct TCP connection
  - Spanner configuration

- **[Standalone OpAMP Setup](./STANDALONE_OPAMP_SETUP.md)**
  - Running OpAMP server as separate service
  - Docker Compose configuration
  - TLS/HTTPS setup
  - Switching between modes

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

