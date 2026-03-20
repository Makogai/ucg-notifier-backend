import type { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { FacultyService } from "../services/FacultyService";

const facultyService = new FacultyService();

export async function getFaculties(_req: Request, res: Response) {
  const faculties = await prisma.faculty.findMany({
    select: { id: true, name: true, shortCode: true, url: true, logoUrl: true },
    orderBy: { name: "asc" },
  });
  res.json({ items: faculties });
}

export async function getFacultyPrograms(req: Request, res: Response) {
  const facultyId = Number(req.params.id);
  if (!Number.isFinite(facultyId)) {
    return res.status(400).json({ error: "Invalid faculty id" });
  }
  const faculty = await prisma.faculty.findUnique({
    where: { id: facultyId },
    select: { id: true, name: true },
  });

  if (!faculty) {
    return res.status(404).json({ error: "Faculty not found" });
  }

  const programs = await facultyService.listFacultyPrograms(facultyId);
  res.json({
    faculty: { id: faculty.id, name: faculty.name },
    items: programs,
  });
}

