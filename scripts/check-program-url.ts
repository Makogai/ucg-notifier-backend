import { prisma } from "../src/prisma/client";

async function main() {
  const programId = Number(process.env.SCRAPER_TEST_PROGRAM_ID ?? "1");
  if (!Number.isFinite(programId) || programId <= 0) {
    throw new Error("Set SCRAPER_TEST_PROGRAM_ID to a valid program id.");
  }

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, name: true, url: true, facultyId: true },
  });

  console.log(JSON.stringify(program, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

