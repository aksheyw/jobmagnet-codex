import type { FastifyReply, FastifyRequest } from "fastify";
import { execSync } from "node:child_process";

export async function healthHandler(_req: FastifyRequest, reply: FastifyReply) {
  const codexVersion = (() => {
    const out = safeExec("codex --version 2>&1", "");
    const match = out.match(/codex-cli\s+\S+/);
    return match ? match[0] : "missing";
  })();
  const authStatus = (() => {
    const status = safeExec("codex login status 2>&1", "");
    if (/Logged in using ChatGPT/.test(status)) return "chatgpt";
    if (/Logged in using API/.test(status)) return "api_key";
    return "none";
  })();
  const workspaceFreeMb = (() => {
    const out = safeExec("df -m /var/jobmagnet | tail -1 | awk '{print $4}'", "");
    const n = Number(out.trim());
    return Number.isFinite(n) ? n : -1;
  })();

  return reply.send({
    ok: true,
    service: "jobmagnet-codex",
    codex_cli_version: codexVersion,
    auth_status: authStatus,
    workspace_free_mb: workspaceFreeMb,
    timestamp: new Date().toISOString(),
  });
}

function safeExec(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return fallback;
  }
}
