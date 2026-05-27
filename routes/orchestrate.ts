import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { validatePublicUrl } from "../lib/url-validator.js";
import { orchestrate } from "../agents/orchestrator.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z
  .object({
    job_id: z.string().regex(UUID_REGEX),
    short_id: z.string().regex(/^[a-zA-Z0-9_-]{4,32}$/),
    jd_url: z.string().url().optional(),
    jd_paste_text: z.string().min(40).optional(),
    parsed_profile: z.record(z.unknown()),
    email: z.string().email().optional(),
    pitch: z
      .object({
        enabled: z.boolean(),
        stance: z.enum(["builder", "analyst", "customer", "strategist"]),
        seed: z.string().min(1).max(400),
      })
      .optional(),
  })
  .refine((v) => v.jd_url || v.jd_paste_text, {
    message: "jd_url or jd_paste_text required",
  });

/**
 * POST /orchestrate
 *
 * Fire-and-forget endpoint. Responds 202 immediately after validating the
 * request; the actual 60-120s generation pipeline runs in the request
 * handler's continuation. Status is reported via Supabase `generation_jobs`
 * — the Vercel UI polls `/api/jobs/<job_id>` to see progress.
 *
 * Auth: bearer token (same as /run-agent). Job_id MUST be the UUID of an
 * existing `generation_jobs` row (Vercel creates the row before calling).
 */
export async function orchestrateHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({
      ok: false,
      error: "invalid orchestrate body",
      details: parsed.error.flatten(),
    });
    return;
  }

  // SSRF guard: ResearchAgent's web_search will follow jd_url.
  if (parsed.data.jd_url) {
    const v = validatePublicUrl(parsed.data.jd_url);
    if (!v.ok) {
      reply.code(400).send({ ok: false, error: `invalid jd_url: ${v.error}` });
      return;
    }
  }

  // Respond 202 immediately, then run the pipeline asynchronously. The
  // unhandled-promise pattern here is intentional — Fastify keeps the
  // process alive; we don't await `orchestrate()` so the HTTP response
  // can return now and the client can start polling.
  reply.code(202).send({
    ok: true,
    job_id: parsed.data.job_id,
    short_id: parsed.data.short_id,
    status: "accepted",
  });

  // Detached background work. Errors are swallowed at the top level (the
  // orchestrator already writes failure state to Supabase) but logged via
  // the request logger.
  void orchestrate(parsed.data, req.log).catch((err) => {
    req.log.error({ err, job_id: parsed.data.job_id }, "orchestrate threw");
  });
}
