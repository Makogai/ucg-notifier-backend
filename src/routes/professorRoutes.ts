import { Router } from "express";
import {
  getProfessorDetailsById,
  getProfessorDetailsByProfileUrl,
} from "../controllers/professorController";

export const professorRoutes = Router();

professorRoutes.get("/professors/:id", getProfessorDetailsById);
professorRoutes.get("/professors/by-profile", getProfessorDetailsByProfileUrl);

