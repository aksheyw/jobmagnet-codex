import { z } from "zod";

const EvidenceItemSchema = z.object({
  type: z.enum(["screenshot", "wireframe-svg", "diagram-svg"]),
  url: z.string().min(1),
  caption: z.string().min(1),
});

export const PitchSectionSchema = z.object({
  stance: z.enum(["builder", "analyst", "customer", "strategist"]),
  seed: z.string(),
  title: z.string().min(1),
  problem: z.string().min(1),
  hypothesis: z.string(),
  proposed_solution: z.string().min(1),
  metrics_to_track: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  guardrails: z.array(z.string()),
  evidence: z.array(EvidenceItemSchema),
  confidence: z.number().min(0).max(1),
});

export type PitchSection = z.infer<typeof PitchSectionSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const PitchSectionJsonSchema = {
  type: "object",
  properties: {
    stance: {
      type: "string",
      enum: ["builder", "analyst", "customer", "strategist"],
    },
    seed: { type: "string" },
    title: { type: "string" },
    problem: { type: "string" },
    hypothesis: { type: "string" },
    proposed_solution: { type: "string" },
    metrics_to_track: { type: "array", items: { type: "string" } },
    tradeoffs: { type: "array", items: { type: "string" } },
    guardrails: { type: "array", items: { type: "string" } },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["screenshot", "wireframe-svg", "diagram-svg"],
          },
          url: { type: "string" },
          caption: { type: "string" },
        },
        required: ["type", "url", "caption"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number" },
  },
  required: [
    "stance",
    "seed",
    "title",
    "problem",
    "hypothesis",
    "proposed_solution",
    "metrics_to_track",
    "tradeoffs",
    "guardrails",
    "evidence",
    "confidence",
  ],
  additionalProperties: false,
} as const;
