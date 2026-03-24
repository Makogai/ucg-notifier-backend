import { Router } from "express";
import { getPosts } from "../controllers/postController";

export const postRoutes = Router();

postRoutes.get("/posts", getPosts);
