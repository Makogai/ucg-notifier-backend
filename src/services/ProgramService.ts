import { ProgramType } from "@prisma/client";
import { prisma } from "../prisma/client";

export type UpsertProgramInput = {
  facultyId: number;
  name: string;
  type: ProgramType;
  url: string;
};

export class ProgramService {
  async upsertProgram(input: UpsertProgramInput) {
    return prisma.program.upsert({
      where: { url: input.url },
      update: {
        name: input.name,
        type: input.type,
        facultyId: input.facultyId,
      },
      create: input,
    });
  }

  async listProgramSubjects(programId: number) {
    return prisma.subject.findMany({
      where: { programId },
      orderBy: [{ semester: "asc" }, { name: "asc" }],
    });
  }

  async listProgramPosts(programId: number, semester?: number) {
    return prisma.post.findMany({
      where: {
        programId,
        ...(semester != null ? { subject: { semester } } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: 200,
    });
  }
}

