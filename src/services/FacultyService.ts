import { prisma } from "../prisma/client";

export type UpsertFacultyInput = {
  shortCode: string;
  name: string;
  url: string;
  logoUrl?: string | null;
};

export class FacultyService {
  async upsertFaculty(input: UpsertFacultyInput) {
    return prisma.faculty.upsert({
      where: { shortCode: input.shortCode },
      update: {
        name: input.name,
        url: input.url,
        logoUrl: input.logoUrl ?? null,
      },
      create: {
        shortCode: input.shortCode,
        name: input.name,
        url: input.url,
        logoUrl: input.logoUrl ?? null,
      },
    });
  }

  async listFaculties() {
    return prisma.faculty.findMany({
      orderBy: { name: "asc" },
    });
  }

  async listFacultyPrograms(facultyId: number) {
    return prisma.program.findMany({
      where: { facultyId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  }
}

