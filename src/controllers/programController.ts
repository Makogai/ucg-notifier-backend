import type { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { ProgramService } from "../services/ProgramService";

const programService = new ProgramService();

export async function getProgramSubjects(req: Request, res: Response) {
  const programId = Number(req.params.id);
  if (!Number.isFinite(programId)) {
    return res.status(400).json({ error: "Invalid program id" });
  }
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, name: true, type: true },
  });
  if (!program) return res.status(404).json({ error: "Program not found" });

  const subjects = await programService.listProgramSubjects(programId);
  res.json({ program, items: subjects });
}

export async function getProgramPosts(req: Request, res: Response) {
  const programId = Number(req.params.id);
  if (!Number.isFinite(programId)) {
    return res.status(400).json({ error: "Invalid program id" });
  }

  const semesterRaw = req.query.semester;
  const semester =
    typeof semesterRaw === "string" && semesterRaw.trim().length > 0
      ? Number(semesterRaw)
      : undefined;
  const semesterParsed =
    semester != null && Number.isFinite(semester) ? semester : undefined;

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, name: true },
  });
  if (!program) return res.status(404).json({ error: "Program not found" });

  const posts = await programService.listProgramPosts(
    programId,
    semesterParsed,
  );
  res.json({ program, items: posts });
}

