import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export type AgentName = "research" | "brand" | "narrative" | "code" | "pitch";

export interface UsageRecord {
  jobId: string;
  agent: AgentName;
  tokensInput: number;
  tokensOutput: number;
  tokensCachedInput: number;
  tokensReasoningOutput: number;
  durationMs: number;
}

export async function logUsage(record: UsageRecord): Promise<void> {
  try {
    const { error } = await getSupabase().from("codex_usage").insert({
      job_id: record.jobId,
      agent: record.agent,
      tokens_input: record.tokensInput,
      tokens_output: record.tokensOutput,
      tokens_cached_input: record.tokensCachedInput,
      tokens_reasoning_output: record.tokensReasoningOutput,
      duration_ms: record.durationMs,
    });
    if (error) {
      console.error("logUsage insert failed", { agent: record.agent, error: error.message });
    }
  } catch (err) {
    console.error("logUsage threw", err);
  }
}
