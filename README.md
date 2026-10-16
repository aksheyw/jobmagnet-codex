<div align="center">

# 🧲 jobmagnet-codex: the engine room behind JobMagnet

**The Codex SDK "engine room" for [JobMagnet](https://github.com/aksheyw/jobmagnet-app): five specialized OpenAI Codex agents on a VPS that turn a profile + a job link into an on-brand portfolio site in ~96 seconds.**

[![Product UI](https://img.shields.io/badge/Product_UI-jobmagnet--app-4F46E5?style=for-the-badge)](https://github.com/aksheyw/jobmagnet-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Codex SDK](https://img.shields.io/badge/@openai%2Fcodex--sdk-0.133-black?style=for-the-badge)](https://www.npmjs.com/package/@openai/codex-sdk)

</div>

In plain words: jobmagnet-app is the website the candidate uses, and this repo is the server behind it. The website hands each job to this server. The server runs the agents, logs their tokens and time, and stores a signed download link when the zip is ready.

<p align="center">
  <img src="docs/one-request-inside-the-engine-room.svg" alt="What happens inside the engine room on one job. jobmagnet-app, the website, sends the job to jobmagnet-codex, this repo, a Docker server on a VPS. A gatekeeper checks the key and the job link. Research reads the job, using web search. Then three agents run at the same time: Brand finds the company's colors and fonts, Narrative retells the candidate's story, and Pitch, which is optional, writes a product critique. Then Code fills in the site and zips it, with no AI. The server stores a signed link to download the zip. Agent calls write their tokens and time to a log in Supabase." width="900" />
</p>

---

## What runs here

This is the companion runtime to **jobmagnet-app** (the Next.js UI + API on Vercel). It runs here: a **Fastify** server in a Docker container on a **Hostinger VPS**, reachable from Vercel over a **Cloudflare Tunnel** at `https://jobmagnet-codex.aksheywalia.in`.

<details>
<summary>📋 <b>The 5 Codex agents, and what each one does</b></summary>

<br>

| Agent | Does | Codex SDK features |
|---|---|---|
| **Research** | Reads the JD → structured `JobContext` | `web_search` + network access, `outputSchema` |
| **Brand** | The company's real colors + fonts (Brandfetch → Codex fallback) | `web_search`, `outputSchema` |
| **Narrative** | Tailored headline, "why I'm a fit", cover letter | `outputSchema` |
| **Pitch** | Optional, from the candidate's own observation: a PM-RFC product critique + an SVG wireframe or diagram (4 stances) | `web_search`, `outputSchema` |
| **Code** | Copies a Next.js template, rewrites Tailwind/fonts/content, assembles + zips | deterministic (0 LLM tokens) |

All four Codex agents run in Codex's **`workspace-write` sandbox**. Agent calls log input/output/cached/reasoning tokens + duration to Supabase `codex_usage`. For the MVP, generation runs via the Codex CLI's **ChatGPT Plus OAuth** (no per-token API cost during the hackathon); production would use an OpenAI API key.

</details>

<details>
<summary>🌉 <b>Routes: how the website talks to this server</b></summary>

<br>

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | none | liveness probe (`ok` / `service` / `timestamp`) |
| `POST` | `/orchestrate` | bearer | run the agent pipeline for a job (6/min) |
| `POST` | `/run-agent` | bearer | run a single named agent for dev/debug (10/min) |
| `GET` | `/download/:jobId` | HMAC-signed | stream the generated site zip (30/min) |

Bearer tokens are compared in constant time (`timingSafeEqual`). Per-route rate limits via `@fastify/rate-limit`.

</details>

<details>
<summary>🔍 <b>Security</b></summary>

<br>

- Bearer auth on `/orchestrate` and `/run-agent` (constant-time comparison).
- Per-route rate limits.
- **SSRF guard** (`lib/url-validator.ts`) on every user-supplied URL: blocks non-http(s) schemes, localhost, internal/link-local IPs.
- Downloads are **HMAC-signed** with an expiry.
- Runs in a Docker container; the OAuth tokens and the bearer secret are bind mounts, never baked into the image.

</details>

<details>
<summary>📦 <b>Tech stack, and deploying it to the VPS</b></summary>

<br>

**Node 22** · **Fastify 5** · **`@openai/codex-sdk` 0.133** · **archiver** · **@supabase/supabase-js** · **Zod 3** · **@fastify/rate-limit** · Docker · Cloudflare Tunnel · ChatGPT Plus OAuth.

```bash
ssh root@<your-vps-host>
cd /opt/jobmagnet-codex
git pull
docker compose build && docker compose up -d
docker compose logs -f --tail=50
```

**Bind mounts:**
- `/root/.codex` (rw): ChatGPT Plus OAuth tokens, shared with the host Codex CLI.
- `/root/.jobmagnet/secret` (ro): the bearer secret shared with the Vercel app.
- `/var/jobmagnet/jobs` (rw): per-job workspaces + generated zips.

</details>

## License

[MIT](LICENSE). © 2026 Akshey Walia

---

<div align="center">

The product this powers: **jobmagnet-app** · built by [Akshey Walia](https://www.linkedin.com/in/aksheywalia/)

</div>
