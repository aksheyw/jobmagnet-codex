import { existsSync, mkdirSync } from "node:fs";

export function ensureWorkspace(jobId: string): string {
  const root = process.env.WORKSPACE_ROOT ?? "/var/jobmagnet/jobs";
  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    throw new Error(`invalid job_id: ${jobId}`);
  }
  const dir = `${root}/${jobId}`;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
  return dir;
}
