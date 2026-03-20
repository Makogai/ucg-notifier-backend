import { Router } from "express";
import { getFacultyPrograms, getFaculties } from "../controllers/facultyController";

export const facultyRoutes = Router();

facultyRoutes.get("/faculties", getFaculties);
facultyRoutes.get("/faculties/:id/programs", getFacultyPrograms);

