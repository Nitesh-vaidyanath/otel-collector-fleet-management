# MySQL TLS/SSL Configuration

This document explains how to configure secure TLS/SSL connections to MySQL.

## Environment Variables

### Basic TLS Configuration

| Variable | Description | Values | Default |
|----------|-------------|--------|---------|
| `DB_TLS_MODE` | TLS connection mode | `preferred`, `required`, `skip-verify`, `verify-ca`, `verify-full` | None (no TLS) |
| `DB_TLS_CA_FILE` | Path to CA certificate file | File path | None |
| `DB_TLS_CERT_FILE` | Path to client certificate file | File path | None |
| `DB_TLS_KEY_FILE` | Path to client private key file | File path | None |

### TLS Modes

- **`preferred`**: Use TLS if available, but don't require it (default for most connections)
- **`required`**: Require TLS connection (fails if server doesn't support TLS)
- **`skip-verify`**: Use TLS but skip certificate verification (useful for self-signed certs)
- **`verify-ca`**: Verify server certificate against CA (requires `DB_TLS_CA_FILE`)
- **`verify-full`**: Verify server certificate and hostname (requires `DB_TLS_CA_FILE`)

### Custom TLS Configuration

If you provide `DB_TLS_CERT_FILE` and `DB_TLS_KEY_FILE`, a custom TLS configuration named `custom` will be automatically registered. This allows:
- Client certificate authentication
- Custom CA certificate verification (if `DB_TLS_CA_FILE` is provided)
- Full control over TLS settings

## Usage Examples

### Example 1: Basic TLS (Preferred Mode)

```bash
export DB_TLS_MODE=preferred
export DB_HOST=mysql.example.com
export DB_USER=grafana
export DB_PASSWORD=secure_password
export DB_NAME=grafana_agents
```

### Example 2: Required TLS with Certificate Verification

```bash
export DB_TLS_MODE=verify-ca
export DB_TLS_CA_FILE=/path/to/ca-cert.pem
export DB_HOST=mysql.example.com
export DB_USER=grafana
export DB_PASSWORD=secure_password
export DB_NAME=grafana_agents
```

### Example 3: Client Certificate Authentication

```bash
export DB_TLS_MODE=custom
export DB_TLS_CA_FILE=/path/to/ca-cert.pem
export DB_TLS_CERT_FILE=/path/to/client-cert.pem
export DB_TLS_KEY_FILE=/path/to/client-key.pem
export DB_HOST=mysql.example.com
export DB_USER=grafana
export DB_PASSWORD=secure_password
export DB_NAME=grafana_agents
```

### Example 4: Using DSN with TLS

You can also specify TLS directly in the DSN:

```bash
export AGENTS_MYSQL_DSN="user:password@tcp(host:3306)/database?parseTime=true&tls=required"
```

Or with custom configuration:

```bash
export AGENTS_MYSQL_DSN="user:password@tcp(host:3306)/database?parseTime=true&tls=custom"
# Make sure to set DB_TLS_CERT_FILE and DB_TLS_KEY_FILE
```

## Docker Compose Example

```yaml
services:
  opamp-server:
    environment:
      DB_HOST: mysql.example.com
      DB_USER: grafana
      DB_PASSWORD: secure_password
      DB_NAME: grafana_agents
      DB_TLS_MODE: verify-ca
      DB_TLS_CA_FILE: /app/tls/ca-cert.pem
      DB_TLS_CERT_FILE: /app/tls/client-cert.pem
      DB_TLS_KEY_FILE: /app/tls/client-key.pem
    volumes:
      - ./tls:/app/tls:ro
```

## Security Best Practices

1. **Always use TLS in production**: Set `DB_TLS_MODE=required` or `verify-full`
2. **Use CA certificates**: Always provide `DB_TLS_CA_FILE` for certificate verification
3. **Client certificates**: Use client certificate authentication for additional security
4. **Protect private keys**: Ensure `DB_TLS_KEY_FILE` has restricted permissions (600)
5. **Never use `skip-verify` in production**: Only use for development/testing

## Troubleshooting

### Connection fails with TLS error

- Check that MySQL server has TLS enabled: `SHOW VARIABLES LIKE 'have_ssl';`
- Verify certificate files are readable
- Check certificate expiration dates
- Ensure CA certificate matches server certificate

### Certificate verification fails

- Verify `DB_TLS_CA_FILE` contains the correct CA certificate
- Check that server certificate is signed by the CA
- For self-signed certificates, use `skip-verify` mode (development only)

### Client certificate authentication fails

- Verify client certificate is valid and not expired
- Check that MySQL user is configured to require client certificate
- Ensure certificate CN matches MySQL user or is in allowed list

## Testing TLS Connection

You can test the TLS connection using MySQL client:

```bash
mysql --ssl-mode=REQUIRED \
      --ssl-ca=/path/to/ca-cert.pem \
      --ssl-cert=/path/to/client-cert.pem \
      --ssl-key=/path/to/client-key.pem \
      -h mysql.example.com \
      -u grafana \
      -p grafana_agents
```

