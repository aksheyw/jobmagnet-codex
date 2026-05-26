import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_EXP_SECONDS = 7 * 24 * 3600; // 7 days

function getKey(): string {
  const key = process.env.HMAC_SIGNING_KEY;
  if (!key) throw new Error("HMAC_SIGNING_KEY env var must be set");
  return key;
}

/**
 * Sign a download link for a given job. Returns the full URL safe to email
 * to the user. The download endpoint on the VPS verifies the token.
 *
 * Format: <baseUrl>/download/<jobId>?exp=<unix>&sig=<hex32>
 *   where sig = HMAC-SHA256(jobId + ':' + exp, HMAC_SIGNING_KEY).slice(0,32)
 */
export function signDownloadUrl(
  baseUrl: string,
  jobId: string,
  expiresInSeconds: number = DEFAULT_EXP_SECONDS,
): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = createHmac("sha256", getKey())
    .update(`${jobId}:${exp}`)
    .digest("hex")
    .slice(0, 32);
  const cleanBase = baseUrl.replace(/\/$/, "");
  return `${cleanBase}/download/${encodeURIComponent(jobId)}?exp=${exp}&sig=${sig}`;
}

/**
 * Verify a download token. Constant-time signature compare.
 */
export function verifyDownloadToken(
  jobId: string,
  exp: number | string,
  sig: string,
): boolean {
  const expNum = typeof exp === "string" ? Number(exp) : exp;
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = createHmac("sha256", getKey())
    .update(`${jobId}:${expNum}`)
    .digest("hex")
    .slice(0, 32);
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
