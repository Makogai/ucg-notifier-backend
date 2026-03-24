import { prisma } from "../src/prisma/client";

async function main() {
  const profileUrl =
    process.env.SCRAPER_TEST_PROFILE_URL?.trim() ??
    "https://ucg.ac.me/radnik/130329-budimir-lutovac";

  const professor = await prisma.professor.findUnique({
    where: { profileUrl },
    select: { id: true, name: true },
  });

  if (!professor) {
    console.log(JSON.stringify({ professor: null }, null, 2));
    return;
  }

  const pubs = await prisma.professorSelectedPublication.findMany({
    where: { professorId: professor.id },
    take: 5,
    orderBy: [{ year: "desc" }, { title: "asc" }],
    select: { year: true, title: true, source: true, url: true, authors: true },
  });

  console.log(
    JSON.stringify(
      {
        professor: { id: professor.id, name: professor.name },
        pubs,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

