import { Router } from "express";
import { getProgramPosts, getProgramSubjects } from "../controllers/programController";

export const programRoutes = Router();

programRoutes.get("/programs/:id/subjects", getProgramSubjects);
programRoutes.get("/programs/:id/posts", getProgramPosts);

