import { z } from "zod";

const WhyImAFitItemSchema = z.object({
  bullet: z.string().min(1),
  metric: z.string().min(1),
});

const ResumeRoleSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  dates: z.string().min(1),
  bullets: z.array(z.string().min(1)).min(1).max(8),
});

export const NarrativeSchema = z.object({
  candidate_name: z.string().min(1),
  candidate_contact: z.string(),
  headline: z.string().min(1),
  why_im_a_fit: z.array(WhyImAFitItemSchema).length(3),
  about: z.string().min(1),
  cover_letter: z.string().min(1),
  resume_bullets: z.array(ResumeRoleSchema).min(1),
});

export type Narrative = z.infer<typeof NarrativeSchema>;
export type WhyImAFitItem = z.infer<typeof WhyImAFitItemSchema>;
export type ResumeRole = z.infer<typeof ResumeRoleSchema>;

export const NarrativeJsonSchema = {
  type: "object",
  properties: {
    candidate_name: { type: "string" },
    candidate_contact: { type: "string" },
    headline: { type: "string" },
    why_im_a_fit: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bullet: { type: "string" },
          metric: { type: "string" },
        },
        required: ["bullet", "metric"],
        additionalProperties: false,
      },
    },
    about: { type: "string" },
    cover_letter: { type: "string" },
    resume_bullets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          dates: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title", "dates", "bullets"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "candidate_name",
    "candidate_contact",
    "headline",
    "why_im_a_fit",
    "about",
    "cover_letter",
    "resume_bullets",
  ],
  additionalProperties: false,
} as const;
