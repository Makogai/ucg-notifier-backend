import { z } from "zod";

export const SubscribeBodySchema = z.object({
  // Pseudo-identity: generated on the device; no backend registration flow.
  deviceId: z.string().min(1),
  fcmToken: z.string().min(10),
  type: z.enum(["FACULTY", "PROGRAM", "SUBJECT"]),
  referenceId: z.number().int().positive(),
  // PROGRAM scope only: omit for whole-program; provide for per-semester subscription.
  semester: z.number().int().positive().optional(),
});

export const SubscriptionsQuerySchema = z.object({
  deviceId: z.string().min(1),
});

export const UnsubscribeBodySchema = z.object({
  deviceId: z.string().min(1),
  type: z.enum(["FACULTY", "PROGRAM", "SUBJECT"]),
  referenceId: z.number().int().positive(),
  // For PROGRAM only:
  // - omit or 0 => whole program
  // - >0 => per-semester subscription
  semester: z.number().int().nonnegative().optional(),
});

export type SubscribeBody = z.infer<typeof SubscribeBodySchema>;

