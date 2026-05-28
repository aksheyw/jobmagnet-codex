/**
 * Regression test for normalizeDomain (F87). Run: `npx tsx scripts/regression-normalize-domain.ts`
 *
 * normalizeDomain is AI-written + AI-reviewed logic with a non-trivial regex
 * (job-board subdomain strip with a lookahead guard) — exactly the kind of
 * function that needs a mechanical test rather than self-review. See the
 * ai-regression-testing skill: "test where bugs could hide; don't trust AI
 * self-review as a substitute for automated tests."
 */
import { normalizeDomain } from "../agents/research-agent.js";

const cases: Array<[input: string, expected: string]> = [
  // already-clean employer domains pass through
  ["stripe.com", "stripe.com"],
  ["notion.so", "notion.so"],
  ["sarvam.ai", "sarvam.ai"],
  // protocol + path + www stripping
  ["https://stripe.com", "stripe.com"],
  ["https://www.stripe.com/careers", "stripe.com"],
  ["  HTTPS://WWW.Sarvam.AI/about?x=1  ", "sarvam.ai"],
  ["http://notion.so/jobs", "notion.so"],
  // job-board subdomain stripping (>=2 labels remain)
  ["jobs.stripe.com", "stripe.com"],
  ["careers.google.com", "google.com"],
  ["careers.google.co.uk", "google.co.uk"],
  ["hire.lever.co", "lever.co"],
  ["https://jobs.lever.co/acme/123", "lever.co"],
  ["boards.greenhouse.io", "greenhouse.io"],
  // guard: never collapse a 2-label domain to a single label
  ["jobs.com", "jobs.com"],
  ["careers.io", "careers.io"],
  // ATS hosts normalize to their registrable domain (denylist handled in prompt)
  ["jobs.ashbyhq.com", "ashbyhq.com"],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = normalizeDomain(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  normalizeDomain(${JSON.stringify(input)}) = ${JSON.stringify(got)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`);
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed > 0) {
  console.error(`REGRESSION: ${failed} normalizeDomain case(s) failed`);
  process.exit(1);
}
