import { prisma } from "../src/prisma/client";

async function main() {
  const programId = Number(process.env.SCRAPER_TEST_PROGRAM_ID ?? "1");
  if (!Number.isFinite(programId) || programId <= 0) {
    throw new Error("Set SCRAPER_TEST_PROGRAM_ID to a valid program id.");
  }

  const rows = await prisma.subject.findMany({
    where: { programId },
    select: { id: true, semester: true },
  });

  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = r.semester === null || r.semester === undefined ? "null" : String(r.semester);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const semestersNumeric = rows
    .map((r) => r.semester)
    .filter((s): s is number => typeof s === "number");

  const min = semestersNumeric.length ? Math.min(...semestersNumeric) : null;
  const max = semestersNumeric.length ? Math.max(...semestersNumeric) : null;

  console.log(
    JSON.stringify(
      {
        programId,
        total: rows.length,
        minSemester: min,
        maxSemester: max,
        bySemester: Array.from(counts.entries())
          .sort((a, b) => {
            if (a[0] === "null") return 1;
            if (b[0] === "null") return -1;
            return Number(a[0]) - Number(b[0]);
          })
          .map(([k, v]) => ({ semester: k, count: v })),
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

