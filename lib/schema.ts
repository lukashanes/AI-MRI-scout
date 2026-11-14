import { z } from "zod";

/** Clamp a number to [0, 100] range for marker positions */
function clampPercent(val: unknown): number | undefined {
  if (typeof val !== "number" || isNaN(val)) return undefined;
  return Math.max(0, Math.min(100, val));
}

const ImageFindingSchema = z.object({
  index: z.number(),
  body_part: z.string().optional(),
  sequence: z.string().optional(),
  finding: z.string(),
  status: z.enum(["normal", "note", "abnormal"]).catch("normal"),
  severity: z.enum(["normal", "mild", "moderate", "severe", "complete_rupture"]).optional().catch(undefined),
  temporal: z.enum(["acute", "subacute", "chronic"]).nullable().optional().catch(null),
  detail: z.string().catch(""),
  deep_dive_recommended: z.boolean().optional().catch(false),
  deep_dive_reason: z.string().optional(),
  marker_x: z.number().optional().transform(clampPercent),
  marker_y: z.number().optional().transform(clampPercent),
  confidence: z.number().min(0).max(100).optional().catch(undefined),
});

const SeriesRequestSchema = z.object({
  series_prefix: z.string(),
  from_slice: z.number(),
  to_slice: z.number(),
  reason: z.string(),
});

const PeerReviewSchema = z.object({
  mode: z.enum(["single_provider", "cross_check"]).catch("single_provider"),
  primary_provider: z.string(),
  reviewer_provider: z.string().nullable().default(null).catch(null),
  consensus_summary: z.string(),
  agreement_level: z.enum(["high", "medium", "low"]).catch("medium"),
  agreements: z.array(z.string()).default([]).catch([]),
  disagreements: z.array(z.string()).default([]).catch([]),
});

export const AnalysisResponseSchema = z.object({
  summary: z.string(),
  recommendation: z.enum(["none", "routine", "advised", "urgent"]).catch("routine"),
  recommendation_text: z.string(),
  injury_pattern: z.string().nullable().default(null).catch(null),
  structures_affected: z.array(z.string()).default([]).catch([]),
  urgency_reason: z.string().nullable().default(null).catch(null),
  needs_more_slices: z.boolean().default(false).catch(false),
  series_requests: z.array(SeriesRequestSchema).default([]).catch([]),
  images: z.array(ImageFindingSchema).catch([]),
  peer_review: PeerReviewSchema.nullable().default(null).catch(null),
  disclaimer: z.string().catch("This is NOT a medical diagnosis. Always consult a qualified physician."),
});

export type ValidatedAnalysis = z.infer<typeof AnalysisResponseSchema>;
export type ValidatedImageFinding = z.infer<typeof ImageFindingSchema>;
export type ValidatedPeerReview = z.infer<typeof PeerReviewSchema>;
