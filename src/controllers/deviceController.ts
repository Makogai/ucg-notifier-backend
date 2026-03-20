import type { Request, Response } from "express";
import { DeviceRegisterBodySchema } from "../dtos/device.dto";
import { UserService } from "../services/UserService";

const userService = new UserService();

export async function registerDevice(req: Request, res: Response) {
  const parse = DeviceRegisterBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const user = await userService.getOrCreateByDeviceId(
    parse.data.deviceId,
    parse.data.fcmToken,
  );

  res.status(201).json({ item: user });
}

