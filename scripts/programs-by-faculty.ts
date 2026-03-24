import { prisma } from "../src/prisma/client";

async function main() {
  const faculties = await prisma.faculty.findMany({
    select: { id: true, shortCode: true, name: true },
  });

  const programs = await prisma.program.findMany({
    select: { id: true, facultyId: true },
  });

  const programCounts = new Map<number, number>();
  for (const p of programs) {
    programCounts.set(p.facultyId, (programCounts.get(p.facultyId) ?? 0) + 1);
  }

  const rows = faculties
    .map((f) => ({
      faculty: f.shortCode || String(f.id),
      name: f.name,
      programs: programCounts.get(f.id) ?? 0,
    }))
    .sort((a, b) => a.programs - b.programs);

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

