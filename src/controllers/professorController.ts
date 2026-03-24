import type { Request, Response } from "express";
import { prisma } from "../prisma/client";

function parsePositiveInt(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export async function getProfessorDetailsById(req: Request, res: Response) {
  const professorId = parsePositiveInt(req.params.id);
  if (!professorId) return res.status(400).json({ error: "Invalid professor id" });

  const professor = await prisma.professor.findUnique({
    where: { id: professorId },
  });
  if (!professor) return res.status(404).json({ error: "Professor not found" });

  const teachings = await prisma.professorTeaching.findMany({
    where: { professorId },
    orderBy: [{ semester: "asc" }, { subjectName: "asc" }],
  });

  const selectedPublications = await prisma.professorSelectedPublication.findMany({
    where: { professorId },
    orderBy: [{ year: "desc" }, { title: "asc" }],
  });

  const academicContributions = await prisma.professorAcademicContribution.findMany({
    where: { professorId },
    orderBy: [{ year: "desc" }, { contributionGroup: "asc" }],
  });

  return res.json({
    professor,
    teachings,
    selectedPublications,
    academicContributions,
  });
}

export async function getProfessorDetailsByProfileUrl(
  req: Request,
  res: Response,
) {
  const profileUrl = typeof req.query.profileUrl === "string" ? req.query.profileUrl : null;
  if (!profileUrl || profileUrl.trim().length < 5) {
    return res.status(400).json({ error: "Missing/invalid profileUrl" });
  }

  const professor = await prisma.professor.findUnique({
    where: { profileUrl: profileUrl.trim() },
  });
  if (!professor) return res.status(404).json({ error: "Professor not found" });

  const teachings = await prisma.professorTeaching.findMany({
    where: { professorId: professor.id },
    orderBy: [{ semester: "asc" }, { subjectName: "asc" }],
  });

  const selectedPublications = await prisma.professorSelectedPublication.findMany({
    where: { professorId: professor.id },
    orderBy: [{ year: "desc" }, { title: "asc" }],
  });

  const academicContributions = await prisma.professorAcademicContribution.findMany({
    where: { professorId: professor.id },
    orderBy: [{ year: "desc" }, { contributionGroup: "asc" }],
  });

  return res.json({
    professor,
    teachings,
    selectedPublications,
    academicContributions,
  });
}

