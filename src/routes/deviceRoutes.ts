import { Router } from "express";
import { registerDevice } from "../controllers/deviceController";

export const deviceRoutes = Router();

deviceRoutes.post("/device", registerDevice);

