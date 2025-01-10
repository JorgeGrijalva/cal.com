import { z } from "zod";

import slugify from "@calcom/lib/slugify";

export enum BillingPeriod {
  MONTHLY = "MONTHLY",
  ANNUALLY = "ANNUALLY",
}

// Base user schema - fields that any user can set
export const ZCreateUserInputSchema = z.object({
  name: z.string(),
  slug: z.string().transform((val) => slugify(val.trim())),
  orgOwnerEmail: z.string().email(),
  language: z.string().optional(),
});

// Admin-only schema - fields that only admins can set
export const ZCreateAdminInputSchema = z.object({
  seats: z.number(),
  pricePerSeat: z.number(),
  billingPeriod: z.nativeEnum(BillingPeriod).default(BillingPeriod.MONTHLY),
});

// Combined schema for creating with payment intent
export const ZCreateWithPaymentIntentInputSchema = ZCreateUserInputSchema.merge(
  ZCreateAdminInputSchema.partial()
);

export type TCreateUserInputSchema = z.infer<typeof ZCreateUserInputSchema>;
export type TCreateAdminInputSchema = z.infer<typeof ZCreateAdminInputSchema>;
export type TCreateWithPaymentIntentInputSchema = z.infer<typeof ZCreateWithPaymentIntentInputSchema>;
