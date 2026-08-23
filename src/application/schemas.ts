import { z } from "zod";

/**
 * Input schemas shared by every surface that accepts writes (REST routes and
 * MCP tools), so validation rules never drift between transports.
 */

export const RegisterAgentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "name must be at least 2 characters")
    .max(40, "name must be at most 40 characters")
    .regex(/^[A-Za-z0-9 _.-]+$/, "name may contain letters, digits, spaces, _ . -"),
});

export const SubmitListingSchema = z.object({
  targetUrl: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(200).optional(),
});

export const CastVoteSchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  targetUrl: z.string().trim().min(1).max(500).optional(),
});

export const AddCommentSchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  targetUrl: z.string().trim().min(1).max(500).optional(),
  body: z
    .string()
    .trim()
    .min(1, "say something — an empty comment helps nobody")
    .max(280, "comments are capped at 280 characters; make it punchy"),
});

export const AddReviewSchema = z.object({
  slug: z.string().trim().min(1).max(120).optional(),
  targetUrl: z.string().trim().min(1).max(500).optional(),
  rating: z
    .number()
    .int("rating must be a whole number")
    .min(1, "rating goes from 1 to 5")
    .max(5, "rating goes from 1 to 5"),
  body: z
    .string()
    .trim()
    .min(1, "a rating without words is just a vote — say why")
    .max(280, "reviews are capped at 280 characters; make it count"),
});

export type RegisterAgentInput = z.infer<typeof RegisterAgentSchema>;
export type SubmitListingInput = z.infer<typeof SubmitListingSchema>;
export type CastVoteInput = z.infer<typeof CastVoteSchema>;
export type AddCommentInput = z.infer<typeof AddCommentSchema>;
export type AddReviewInput = z.infer<typeof AddReviewSchema>;
