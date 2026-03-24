import { prisma } from "../src/prisma/client";

async function main() {
  const faculties = await prisma.faculty.findMany({
    select: { id: true, shortCode: true, name: true },
  });

  const programs = await prisma.program.findMany({
    select: { id: true, facultyId: true },
  });

  const programToFaculty = new Map<number, number>();
  for (const p of programs) programToFaculty.set(p.id, p.facultyId);

  const posts = await prisma.post.findMany({
    select: { id: true, programId: true, publishedAt: true, hash: true },
  });

  const counts = new Map<number, { total: number; published: number }>();
  for (const f of faculties) counts.set(f.id, { total: 0, published: 0 });

  for (const post of posts) {
    if (post.programId == null) continue;
    const facultyId = programToFaculty.get(post.programId);
    if (facultyId == null) continue;
    const row = counts.get(facultyId);
    if (!row) continue;
    row.total += 1;
    if (post.publishedAt) row.published += 1;
  }

  const rows = faculties
    .map((f) => ({
      faculty: f.shortCode || String(f.id),
      name: f.name,
      total: counts.get(f.id)?.total ?? 0,
      published: counts.get(f.id)?.published ?? 0,
    }))
    .sort((a, b) => a.total - b.total);

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

