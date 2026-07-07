# Handcrafted box units + Caddy config

These are the **handcrafted** artifacts on the bitbaum Hetzner box that
`sync-infra.sh` deliberately does **not** generate (it skips `fleetcrown-app`
and owns only the other apps' units/vhosts). They were previously live-on-box
only — unauditable and unrecoverable if the disk died. Captured here for
recoverability + review.

| File | Box path | Owner |
|------|----------|-------|
| `fleetcrown-app.service` | `/etc/systemd/system/fleetcrown-app.service` | prod Next server, port 4002 |
| `Caddyfile.snippet` | blocks inside `/etc/caddy/Caddyfile` | fleetcrown + bridge vhosts |

**These are reference copies, not auto-applied.** Changing a file here does not
change the box. To apply a change:

```bash
# systemd unit
scp scripts/hetzner/box-units/fleetcrown-app.service root@167.233.22.31:/etc/systemd/system/
ssh root@167.233.22.31 'systemctl daemon-reload && systemctl restart fleetcrown-app'

# Caddy: edit the live /etc/caddy/Caddyfile to match the snippet, then
ssh root@167.233.22.31 'caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy'
```

If you edit the live box config, update these files in the same commit so they
never drift. `verify.sh` asserts the load-bearing invariant (the bridge SSE
block stays `encode`-free).
