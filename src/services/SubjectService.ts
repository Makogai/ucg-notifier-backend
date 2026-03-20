import { prisma } from "../prisma/client";

export type UpsertSubjectInput = {
  programId: number;
  name: string;
  code: string;
  semester?: number | null;
  ects?: number | null;
};

export class SubjectService {
  async upsertSubject(input: UpsertSubjectInput) {
    return prisma.subject.upsert({
      where: {
        programId_code: { programId: input.programId, code: input.code },
      },
      update: {
        name: input.name,
        semester: input.semester ?? null,
        ects: input.ects ?? null,
      },
      create: {
        programId: input.programId,
        name: input.name,
        code: input.code,
        semester: input.semester ?? null,
        ects: input.ects ?? null,
      },
    });
  }
}

