/**
 * SSRF guard for user-supplied URLs.
 *
 * Blocks loopback/private/link-local IPs (incl. decimal-encoded form),
 * non-http(s) schemes, and well-known dangerous hostnames. Returns an
 * Either-like result so callers don't have to try/catch.
 *
 * This is defense at the route boundary BEFORE the URL ever reaches Codex.
 * The agent prompt's "only fetch same-domain" sentence is best-effort
 * cooperation, not a constraint — this function is the actual constraint.
 */
export type UrlValidation =
  | { ok: true; url: URL }
  | { ok: false; error: string };

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "broadcasthost", "0"]);

export function validatePublicUrl(input: string): UrlValidation {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: "invalid URL" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: `disallowed protocol: ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, error: "blocked hostname" };
  }

  // IPv6 loopback / link-local / unique-local
  if (host === "[::1]" || host === "::1") {
    return { ok: false, error: "IPv6 loopback not allowed" };
  }
  if (host.startsWith("[fe80:") || host.startsWith("[fc") || host.startsWith("[fd")) {
    return { ok: false, error: "private IPv6 not allowed" };
  }

  // IPv4 dotted-decimal: block private + loopback ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (
      a === 0 ||
      a === 127 ||
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      return { ok: false, error: "private/loopback IPv4 not allowed" };
    }
  }

  // Decimal-encoded IPv4 (e.g. http://2130706433/ = http://127.0.0.1/)
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    if (Number.isFinite(n) && n >= 0 && n < 2 ** 32) {
      const a = (n >>> 24) & 0xff;
      const b = (n >>> 16) & 0xff;
      if (
        a === 0 ||
        a === 127 ||
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
      ) {
        return { ok: false, error: "encoded private IPv4 not allowed" };
      }
    }
  }

  return { ok: true, url };
}
