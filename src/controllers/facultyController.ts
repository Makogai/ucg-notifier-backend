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

export async function getFacultyStaff(req: Request, res: Response) {
  const facultyId = Number(req.params.id);
  if (!Number.isFinite(facultyId)) {
    return res.status(400).json({ error: "Invalid faculty id" });
  }

  const categoryRaw = req.query.category;
  const category =
    typeof categoryRaw === "string" && categoryRaw.trim().length > 0
      ? categoryRaw.trim()
      : undefined;

  const faculty = await prisma.faculty.findUnique({
    where: { id: facultyId },
    select: { id: true, name: true, shortCode: true },
  });
  if (!faculty) return res.status(404).json({ error: "Faculty not found" });

  const items = await prisma.facultyStaff.findMany({
    where: {
      facultyId,
      ...(category ? { category } : {}),
    },
    select: {
      id: true,
      position: true,
      category: true,
      professorId: true,
      professor: {
        select: {
          profileUrl: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: [
      { category: "asc" },
      { position: "asc" },
      { professor: { name: "asc" } },
    ],
  });

  res.json({
    faculty,
    items: items.map((it) => ({
      id: it.id,
      professorId: it.professorId,
      profileUrl: it.professor.profileUrl,
      name: it.professor.name,
      email: it.professor.email,
      position: it.position,
      category: it.category,
      avatarUrl: it.professor.avatarUrl,
    })),
  });
}

