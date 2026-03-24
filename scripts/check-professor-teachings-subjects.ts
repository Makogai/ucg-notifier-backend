import { prisma } from "../src/prisma/client";

async function main() {
  const profileUrl =
    process.env.SCRAPER_TEST_PROFILE_URL?.trim() ??
    "https://ucg.ac.me/radnik/130329-budimir-lutovac";

  const professor = await prisma.professor.findUnique({
    where: { profileUrl },
    select: { id: true, profileUrl: true },
  });

  if (!professor) {
    console.log(JSON.stringify({ professor: null }, null, 2));
    return;
  }

  const teachings = await prisma.professorTeaching.findMany({
    where: { professorId: professor.id },
    select: {
      id: true,
      unit: true,
      programName: true,
      semester: true,
      subjectName: true,
      subjectId: true,
      subject: { select: { id: true, name: true, code: true, semester: true } },
    },
    orderBy: [{ semester: "asc" }, { subjectName: "asc" }],
  });

  console.log(
    JSON.stringify(
      {
        professor,
        teachings,
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

