import { z } from "zod";

export const BrandStyleSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  headline_font: z.string().min(1),
  body_font: z.string().min(1),
  mood: z.enum(["minimal", "editorial", "systematic", "tech-dark", "warm-creative"]),
  source: z.enum(["brandfetch", "codex-fallback"]),
});

export type BrandStyle = z.infer<typeof BrandStyleSchema>;

export const BrandStyleJsonSchema = {
  type: "object",
  properties: {
    primary: { type: "string" },
    secondary: { type: "string" },
    background: { type: "string" },
    headline_font: { type: "string" },
    body_font: { type: "string" },
    mood: {
      type: "string",
      enum: ["minimal", "editorial", "systematic", "tech-dark", "warm-creative"],
    },
    source: { type: "string", enum: ["brandfetch", "codex-fallback"] },
  },
  required: [
    "primary",
    "secondary",
    "background",
    "headline_font",
    "body_font",
    "mood",
    "source",
  ],
  additionalProperties: false,
} as const;
