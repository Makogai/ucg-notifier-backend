import { Router } from "express";
import {
  adminPage,
  adminTestNewPostNotify,
  adminTestNewPostBroadcastNotify,
  adminTestNotify,
} from "../controllers/adminController";
import { requireAdminAuth } from "../middleware/adminAuth";

export const adminRoutes = Router();

adminRoutes.get("/admin", requireAdminAuth, adminPage);
adminRoutes.post("/admin/test-notify", requireAdminAuth, adminTestNotify);
adminRoutes.post(
  "/admin/test-new-post-notify",
  requireAdminAuth,
  adminTestNewPostNotify,
);

adminRoutes.post(
  "/admin/test-new-post-broadcast-notify",
  requireAdminAuth,
  adminTestNewPostBroadcastNotify,
);

