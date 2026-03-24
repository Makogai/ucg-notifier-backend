import { prisma } from "../src/prisma/client";

async function main() {
  const rows = await prisma.facultyStaff.findMany({
    take: 5,
    select: {
      id: true,
      facultyId: true,
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
  });

  const budimirProfessor = await prisma.professor.findUnique({
    where: { profileUrl: "https://ucg.ac.me/radnik/130329-budimir-lutovac" },
    select: {
      id: true,
    },
  });

  const budimir = budimirProfessor
    ? await prisma.facultyStaff.findMany({
        where: { professorId: budimirProfessor.id },
        select: {
          id: true,
          facultyId: true,
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
      })
    : null;

  const byFaculty = await prisma.facultyStaff.groupBy({
    by: ["facultyId"],
    _count: true,
  });

  console.log(
    JSON.stringify(
      {
        total: await prisma.facultyStaff.count(),
        budimir,
        sample: rows,
        byFaculty: byFaculty.sort((a, b) => b._count - a._count).slice(0, 10),
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

