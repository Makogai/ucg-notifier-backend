import { z } from "zod";

export const DeviceRegisterBodySchema = z.object({
  deviceId: z.string().min(1),
  fcmToken: z.string().min(10),
});

export type DeviceRegisterBody = z.infer<typeof DeviceRegisterBodySchema>;

