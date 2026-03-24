import { Router } from "express";
import {
  getFacultyPrograms,
  getFaculties,
  getFacultyStaff,
} from "../controllers/facultyController";
import { getFacultyPosts } from "../controllers/postController";

export const facultyRoutes = Router();

facultyRoutes.get("/faculties", getFaculties);
facultyRoutes.get("/faculties/:id/programs", getFacultyPrograms);
facultyRoutes.get("/faculties/:id/staff", getFacultyStaff);
facultyRoutes.get("/faculties/:id/posts", getFacultyPosts);

