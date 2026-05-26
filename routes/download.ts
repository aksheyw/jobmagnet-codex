import type { FastifyReply, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { verifyDownloadToken } from "../lib/download-link.js";

const JOBS_ROOT = process.env.JOBMAGNET_JOBS_DIR ?? "/var/jobmagnet/jobs";

const ParamsSchema = z.object({
  jobId: z.string().regex(/^[a-zA-Z0-9_-]+$/, "invalid job id"),
});

const QuerySchema = z.object({
  exp: z.string().regex(/^\d+$/),
  sig: z.string().regex(/^[0-9a-f]{32}$/i),
});

/**
 * GET /download/:jobId?exp=<unix>&sig=<hex32>
 *
 * Public endpoint (NO bearer auth) — token is the auth. HMAC-signed by
 * lib/download-link.ts at CodeSage finish time. Streams the .zip with a
 * Content-Disposition that gives the user a sensible filename.
 */
export async function downloadHandler(req: FastifyRequest, reply: FastifyReply) {
  const params = ParamsSchema.safeParse(req.params);
  if (!params.success) {
    return reply.code(400).send({ ok: false, error: "invalid job id" });
  }
  const query = QuerySchema.safeParse(req.query);
  if (!query.success) {
    return reply.code(400).send({ ok: false, error: "invalid download token" });
  }

  const { jobId } = params.data;
  const { exp, sig } = query.data;

  if (!verifyDownloadToken(jobId, exp, sig)) {
    return reply.code(403).send({ ok: false, error: "expired or invalid token" });
  }

  const zipPath = join(JOBS_ROOT, jobId, `${jobId}.zip`);
  try {
    const st = await stat(zipPath);
    if (!st.isFile()) {
      return reply.code(404).send({ ok: false, error: "portfolio not found" });
    }
    reply
      .header("Content-Type", "application/zip")
      .header(
        "Content-Disposition",
        `attachment; filename="jobmagnet-portfolio-${jobId}.zip"`,
      )
      .header("Content-Length", String(st.size))
      .header("Cache-Control", "private, no-store");
    return reply.send(createReadStream(zipPath));
  } catch (err) {
    req.log.warn({ err, jobId }, "download: zip not found");
    return reply.code(404).send({ ok: false, error: "portfolio not found" });
  }
}
