import { prisma } from "../src/prisma/client";
import { fetchHtmlWithPagination } from "../src/scraper/puppeteerClient";
import { parseSubjectsFromProgramHtml } from "../src/scraper/ucgScraper";

async function main() {
  const programId = Number(process.env.SCRAPER_TEST_PROGRAM_ID ?? "1");
  if (!Number.isFinite(programId) || programId <= 0) {
    throw new Error("Set SCRAPER_TEST_PROGRAM_ID to a valid program id.");
  }

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, name: true, url: true, facultyId: true },
  });
  if (!program) throw new Error("Program not found");

  const htmlPages = await fetchHtmlWithPagination(program.url, { maxPages: 50 });
  const merged = htmlPages.flatMap((h) => parseSubjectsFromProgramHtml(h));

  const seen = new Set<string>();
  const subjects = merged.filter((s) => {
    const key = s.code ? `code:${s.code}` : `name:${s.name}|sem:${s.semester ?? "na"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sems = subjects
    .map((s) => s.semester)
    .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  const maxSem = sems.length ? Math.max(...sems) : null;

  const sem9to10 = subjects
    .filter((s) => typeof s.semester === "number" && (s.semester === 9 || s.semester === 10))
    .map((s) => ({ semester: s.semester as number, name: s.name, code: s.code }));

  const codes = sem9to10.map((x) => x.code).filter((c): c is string => typeof c === "string" && c.length > 0);

  const existing = codes.length
    ? await prisma.subject.findMany({
        where: { programId, code: { in: codes } },
        select: { id: true, code: true, semester: true },
      })
    : [];

  console.log(
    JSON.stringify(
      {
        program,
        htmlPages: htmlPages.length,
        mergedRows: merged.length,
        dedupedRows: subjects.length,
        maxSemInDedupe: maxSem,
        sem9to10Count: sem9to10.length,
        sem9to10Sample: sem9to10.slice(0, 15),
        existingSem9to10ByCodeCount: existing.length,
      },
      null,
      2,
    ),
  );

  const res = await prisma.subject.createMany({
    data: subjects.map((s) => ({
      programId: program.id,
      name: s.name,
      code: s.code ?? null,
      semester: s.semester ?? null,
      ects: s.ects ?? null,
    })),
    skipDuplicates: true,
  });

  console.log(JSON.stringify({ inserts: res.count }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

