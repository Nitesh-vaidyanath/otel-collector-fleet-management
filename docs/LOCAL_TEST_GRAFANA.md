# Isolated manual Grafana

This is a disposable, local-only manual-test stack. It is separate from the
existing Grafana at `localhost:3000`; it binds only `127.0.0.1:3001` and uses
its own project-scoped networks and persistent named volumes. MySQL is isolated
on the internal network and has no host port.
It does not mount Docker sockets, kubeconfig, host binaries, or home directories.

The stack uses the official `grafana/grafana:11.2.0` and `mysql:8.0` images,
the already-built plugin from `dist/` mounted read-only, and test-only
provisioning. The disposable login is `admin` / `admin`; do not reuse it or the
synthetic database password anywhere else. Anonymous access is disabled.

## Start and check

From the repository root, with Docker pointed at the `colima-driftwatch`
context and the plugin's local Node dependencies already installed:

```sh
make manual-test-build
make manual-test-up
make manual-test-check
make manual-test-status
```

If the stack was already running before `manual-test-build`, run
`make manual-test-reload` before checking so Grafana loads the rebuilt backend.
The app is at
`http://127.0.0.1:3001/a/otel-collector-agent-fleet-management` with the
disposable `admin` / `admin` login. The backend's embedded OpAMP listener is
internal to the Grafana container/network. The agents endpoint returns an
empty collection until a synthetic or real OpAMP client connects; an empty
collection is different from an HTTP fetch failure.

Colima's automatic port forward can fail even while Docker reports the
`127.0.0.1:3001 -> 3000/tcp` binding. Its host-agent log showed SSH exit 255
for that forward on this machine. If `manual-test-check` reports a refused
connection, a temporary **localhost-only** tunnel can restore access without
restarting Colima or altering Grafana on port 3000:

```sh
ssh -F "$HOME/.colima/ssh_config" -o BatchMode=yes -o ExitOnForwardFailure=yes \
  -N -L 127.0.0.1:3001:127.0.0.1:3001 colima-driftwatch
```

This uses Colima's existing SSH configuration; it does not print private key
contents. Stop that SSH session when finished. Re-run `make manual-test-check`
in another terminal. Do not change Colima-wide forwarding or publish port
3001 on all interfaces as a workaround. Container-local health can also be
checked with `docker exec fleet-manual-test-grafana-1 sh -c 'wget -qO- -T 5 http://127.0.0.1:3000/api/health'`.

## Stop and preserve data

```sh
make manual-test-down
```

This stops only this Compose project and intentionally preserves its named
volumes for repeatable manual testing. Do not use `down -v`; removing the
volumes is a separate destructive action. To recreate the schema from scratch,
obtain explicit authorization before deleting `fleet_manual_test_mysql_data`.

## Schema generation

`tests/manual/generate-init.cjs` reads the single fresh-install schema at
`opamp-server/pkg/migrations/0001_initial_schema.sql` and writes only
`tests/manual/generated/init.sql`, adding the fixture-only mapping of synthetic
Grafana org 1 to the default organization. The generated SQL is ignored by Git.
It is not an in-place migration and must not be applied to an existing DB.

The init script is applied by MySQL only when its named data volume is first
initialized. Later `up` runs preserve DB contents and do not reapply migrations.
The root local initializer is not used for this separate test stack.

The user reviews the UI in their own browser. The base stack does not exercise
a real collector or remote OpAMP agent; the separate synthetic OpAMP test does.
