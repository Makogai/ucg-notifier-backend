import { Router } from "express";
import {
  listSubscriptions,
  subscribe,
  unsubscribe,
} from "../controllers/subscriptionController";
import { deleteSubscriptionById } from "../controllers/subscriptionController";

export const subscriptionRoutes = Router();

subscriptionRoutes.post("/subscriptions", subscribe);
subscriptionRoutes.get("/subscriptions", listSubscriptions);
subscriptionRoutes.post("/subscriptions/unsubscribe", unsubscribe);
subscriptionRoutes.delete("/subscriptions/:id", deleteSubscriptionById);

