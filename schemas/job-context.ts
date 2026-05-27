import { z } from "zod";

export const JobContextSchema = z.object({
  job_title: z.string(),
  company_name: z.string(),
  company_domain: z.string(),
  jd_summary: z.string(),
  must_have_skills: z.array(z.string()),
  nice_to_have_skills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  team_context: z.string(),
  location: z.string(),
  career_level: z.enum([
    "junior",
    "mid",
    "senior",
    "staff",
    "principal",
    "manager",
    "director",
    "vp",
  ]),
  pitch_suggested_stance: z.enum(["builder", "analyst", "customer", "strategist"]),
  degraded: z.boolean(),
});

export type JobContext = z.infer<typeof JobContextSchema>;

export const JobContextJsonSchema = {
  type: "object",
  properties: {
    job_title: { type: "string" },
    company_name: { type: "string" },
    company_domain: { type: "string" },
    jd_summary: { type: "string" },
    must_have_skills: { type: "array", items: { type: "string" } },
    nice_to_have_skills: { type: "array", items: { type: "string" } },
    responsibilities: { type: "array", items: { type: "string" } },
    team_context: { type: "string" },
    location: { type: "string" },
    career_level: {
      type: "string",
      enum: ["junior", "mid", "senior", "staff", "principal", "manager", "director", "vp"],
    },
    pitch_suggested_stance: {
      type: "string",
      enum: ["builder", "analyst", "customer", "strategist"],
    },
    degraded: { type: "boolean" },
  },
  required: [
    "job_title",
    "company_name",
    "company_domain",
    "jd_summary",
    "must_have_skills",
    "nice_to_have_skills",
    "responsibilities",
    "team_context",
    "location",
    "career_level",
    "pitch_suggested_stance",
    "degraded",
  ],
  additionalProperties: false,
} as const;
