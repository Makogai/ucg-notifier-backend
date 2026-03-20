import { Router } from "express";
import { getSubjectPosts } from "../controllers/subjectController";

export const subjectRoutes = Router();

subjectRoutes.get("/subjects/:id/posts", getSubjectPosts);

