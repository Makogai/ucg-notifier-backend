import type { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { SubscriptionService } from "../services/SubscriptionService";
import {
  SubscribeBodySchema,
  UnsubscribeBodySchema,
  SubscriptionsQuerySchema,
} from "../dtos/subscription.dto";

const subscriptionService = new SubscriptionService();

export async function subscribe(req: Request, res: Response) {
  const parse = SubscribeBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const sub = await subscriptionService.subscribe(parse.data);
  res.status(201).json({ item: sub });
}

export async function listSubscriptions(req: Request, res: Response) {
  const parse = SubscriptionsQuerySchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const items = await subscriptionService.listByDeviceId(parse.data.deviceId);
  res.json({ items });
}

export async function unsubscribe(req: Request, res: Response) {
  const parse = UnsubscribeBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const result = await subscriptionService.unsubscribe(parse.data);
  res.json(result);
}

export async function deleteSubscriptionById(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid subscription id" });
  }

  const result = await subscriptionService.deleteById(id);
  return res.json(result);
}

