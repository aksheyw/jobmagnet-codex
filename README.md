# jobmagnet-codex

VPS bridge for JobMagnet — runs the Codex SDK agent runtime on Hostinger.
Sibling-of-hermes container. Exposes `/health` + `/run-agent` over Cloudflare Tunnel
at `https://jobmagnet-codex.aksheywalia.in`.

## Routes

- `GET /health` — no auth; returns codex CLI version, login status, workspace free.
- `POST /run-agent` — bearer-auth via `/root/.jobmagnet/secret`. Dispatches to a named agent.
  Day 1: `research` only.

## Local deploy on VPS

```bash
ssh root@n8n.srv1134430.hstgr.cloud
cd /opt/jobmagnet-codex
git pull
docker compose build
docker compose up -d
docker compose logs -f --tail=50
```

## Bind mounts

- `/root/.codex` (ro) — ChatGPT Plus OAuth tokens, shared with host codex CLI.
- `/root/.jobmagnet/secret` (ro) — shared bearer secret with Vercel.
- `/var/jobmagnet/jobs` (rw) — per-job workspaces.
