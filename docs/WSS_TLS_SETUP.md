# WSS (WebSocket Secure) / TLS Setup Guide

This guide explains how to enable TLS/SSL support for the OpAMP server, allowing secure WebSocket (WSS) connections.

## Overview

The OpAMP server supports both:
- **WS** (WebSocket) - `ws://` - Plain, unencrypted connections (default)
- **WSS** (WebSocket Secure) - `wss://` - TLS-encrypted connections

## When to Use WSS

✅ **Use WSS (TLS enabled) when:**
- Running in production environments
- Agents connect over the internet
- Security/compliance requires encrypted communications
- Using HTTPS for the Grafana dashboard

❌ **You can skip TLS when:**
- Testing locally (development)
- All components run in a private network
- Using a reverse proxy that handles TLS termination (nginx, traefik, etc.)

---

## Standalone OpAMP Server

### 1. Generate TLS Certificates

For **testing/development**, generate self-signed certificates:

```bash
# Generate private key and certificate
openssl req -x509 -newkey rsa:4096 -keyout opamp-key.pem -out opamp-cert.pem -days 365 -nodes \
  -subj "/CN=localhost"
```

For **production**, use certificates from a trusted Certificate Authority (Let's Encrypt, etc.).

### 2. Start Server with TLS

```bash
./opamp-server \
  -endpoint="0.0.0.0:4321" \
  -tls \
  -cert="opamp-cert.pem" \
  -key="opamp-key.pem" \
  -db-type="mysql" \
  -db-dsn="root:root@tcp(localhost:3306)/grafana_agents"
```

### 3. Configure Agents

Update agent configuration to use `wss://`:

```yaml
extensions:
  opamp:
    server:
      ws:
        endpoint: wss://your-server.com:4321/v1/opamp
        # For self-signed certificates in testing:
        tls:
          insecure_skip_verify: true  # ⚠️ Only for development!
```

---

## Embedded OpAMP Server (Grafana Plugin)

### Using Environment Variables

Add TLS configuration to `docker-compose.yml`:

```yaml
services:
  grafana:
    environment:
      # OpAMP endpoint
      OPAMP_ENDPOINT: "0.0.0.0:4321"
      
      # TLS configuration
      OPAMP_TLS_CERT: "/etc/ssl/opamp-cert.pem"
      OPAMP_TLS_KEY: "/etc/ssl/opamp-key.pem"
    
    volumes:
      # Mount TLS certificates
      - ./certs/opamp-cert.pem:/etc/ssl/opamp-cert.pem:ro
      - ./certs/opamp-key.pem:/etc/ssl/opamp-key.pem:ro
```

### Generate Certificates for Docker

```bash
# Create certs directory
mkdir -p certs

# Generate certificates
openssl req -x509 -newkey rsa:4096 \
  -keyout certs/opamp-key.pem \
  -out certs/opamp-cert.pem \
  -days 365 -nodes \
  -subj "/CN=grafana"

# Set permissions
chmod 600 certs/opamp-key.pem
chmod 644 certs/opamp-cert.pem
```

### Start with TLS

```bash
docker-compose up -d
docker-compose logs grafana | grep TLS
# Should show: "✓ TLS enabled - OpAMP server will use WSS (WebSocket Secure)"
```

---

## Verify TLS is Working

### Check Server Logs

**WSS enabled:**
```
✓ TLS enabled - certificate: opamp-cert.pem, key: opamp-key.pem
Starting OPAMP server on wss://0.0.0.0:4321/v1/opamp
```

**WSS disabled:**
```
⚠️  TLS not enabled - WebSocket connections will use ws:// (insecure)
Starting OPAMP server on ws://0.0.0.0:4321/v1/opamp
```

### Test Connection

```bash
# Test with openssl (for WSS)
openssl s_client -connect localhost:4321 -showcerts

# Test WebSocket upgrade
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  https://localhost:4321/v1/opamp
```

---

## Agent Configuration Examples

### OpenTelemetry Collector Agent (Direct Connection)

```yaml
extensions:
  opamp:
    server:
      ws:
        endpoint: wss://opamp-server.example.com:4321/v1/opamp
        headers:
          Authorization: Bearer your-token-here
        tls:
          ca_file: /etc/ssl/ca-cert.pem
          # For self-signed certs in dev:
          # insecure_skip_verify: true

service:
  extensions: [opamp]
```

### OpAMP Bridge (Kubernetes)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: opamp-bridge-config
data:
  config.yaml: |
    endpoint: wss://grafana.example.com:4321/v1/opamp
    tls:
      ca_file: /etc/ssl/ca-cert.pem
      insecure: false
    
    # Bridge reports discovered collectors to OpAMP server
    components_allowed:
      - receivers.otlp
      - processors.batch
      - exporters.otlp
```

---

## Troubleshooting

### Error: "certificate signed by unknown authority"

**Cause:** Agent doesn't trust the server's certificate.

**Solution:**
1. Production: Use certificates from a trusted CA (Let's Encrypt)
2. Development: Use `insecure_skip_verify: true` in agent config
3. Custom CA: Distribute CA certificate to agents via `ca_file`

### Error: "failed to load TLS certificate"

**Cause:** Certificate or key file not found/readable.

**Solution:**
```bash
# Check files exist
ls -la opamp-cert.pem opamp-key.pem

# Check permissions
chmod 600 opamp-key.pem
chmod 644 opamp-cert.pem

# Verify certificate is valid
openssl x509 -in opamp-cert.pem -text -noout
```

### Error: "TLS handshake timeout"

**Cause:** Firewall blocking port, or agent using `ws://` instead of `wss://`.

**Solution:**
1. Verify port 4321 is open: `telnet opamp-server.com 4321`
2. Check agent uses `wss://` (not `ws://`)
3. Check server logs for connection attempts

---

## Security Best Practices

### Production Checklist

- ✅ Use certificates from trusted CA (Let's Encrypt, commercial CA)
- ✅ Use TLS 1.2+ (automatically enforced)
- ✅ Rotate certificates before expiration
- ✅ Use strong private key (4096-bit RSA or ECC)
- ✅ Store private keys securely (chmod 600, secrets management)
- ❌ Never use `insecure_skip_verify` in production
- ❌ Never commit certificates/keys to git

### Certificate Management

**Let's Encrypt (recommended for production):**
```bash
# Using certbot
certbot certonly --standalone -d opamp.example.com

# Certificates will be at:
# /etc/letsencrypt/live/opamp.example.com/fullchain.pem
# /etc/letsencrypt/live/opamp.example.com/privkey.pem
```

**Auto-renewal with certbot:**
```bash
# Add to crontab
0 0 * * * certbot renew --quiet --post-hook "systemctl restart opamp-server"
```

---

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPAMP_ENDPOINT` | Server listen address | No | `0.0.0.0:4321` |
| `OPAMP_TLS_CERT` | Path to TLS certificate | No | (empty - TLS disabled) |
| `OPAMP_TLS_KEY` | Path to TLS private key | No | (empty - TLS disabled) |

Both `OPAMP_TLS_CERT` and `OPAMP_TLS_KEY` must be set to enable WSS.

---

## Command-Line Flags (Standalone Server)

| Flag | Description | Required | Default |
|------|-------------|----------|---------|
| `-endpoint` | Server listen address | No | `0.0.0.0:4321` |
| `-tls` | Enable TLS/WSS | No | `false` |
| `-cert` | Path to TLS certificate | If `-tls` | (empty) |
| `-key` | Path to TLS private key | If `-tls` | (empty) |

---

## Next Steps

- **Production deployment:** See [STANDALONE_OPAMP_SETUP.md](./STANDALONE_OPAMP_SETUP.md)
- **Kubernetes setup:** See [k8s/README.md](../k8s/README.md)
- **Troubleshooting:** See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

