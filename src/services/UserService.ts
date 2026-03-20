import { prisma } from "../prisma/client";

export class UserService {
  async getOrCreateByDeviceId(deviceId: string, fcmToken?: string) {
    return prisma.user.upsert({
      where: { deviceId },
      update: {
        ...(fcmToken !== undefined ? { fcmToken } : {}),
      },
      create: { deviceId, fcmToken: fcmToken ?? null },
    });
  }
}

