# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do not open a public issue.

- **Email:** aksheyw1@gmail.com — subject `SECURITY — jobmagnet-codex`

Include the impact, steps to reproduce (or a proof of concept), and any suggested fix. This is a solo-maintained project; reports are acknowledged on a best-effort basis, with a remediation timeline shared after triage.

## Scope

`jobmagnet-codex` is the Codex-agent runtime for [JobMagnet](https://github.com/aksheyw/jobmagnet-app). In scope: the Fastify service (`server.ts`, `routes/`, `lib/`), agent orchestration and sandboxing, and the downloadable portfolio **template** under `template/`.

Out of scope: third-party services (OpenAI, Supabase, Brandfetch, Cloudflare) and the separate [`jobmagnet-app`](https://github.com/aksheyw/jobmagnet-app) repository (it carries its own policy).

## Practices

- Secrets are injected at runtime and are never committed to the repository.
- User-supplied URLs pass an SSRF guard; downloads are HMAC-signed with an expiry; service routes are bearer-authed and rate-limited.
- Dependencies are monitored with Dependabot; the downloadable template is kept on patched releases.
