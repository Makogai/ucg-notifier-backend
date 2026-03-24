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
    select: { id: true, name: true, url: true },
  });
  if (!program) throw new Error("Program not found");

  const htmls = await fetchHtmlWithPagination(program.url, { maxPages: 50 });

  const sem9plus: Array<{ semester: number; name: string; code: string | null }> = [];
  for (let i = 0; i < htmls.length; i++) {
    const subjects = parseSubjectsFromProgramHtml(htmls[i]);
    for (const s of subjects) {
      if (typeof s.semester === "number" && s.semester >= 9) {
        sem9plus.push({ semester: s.semester, name: s.name, code: s.code ?? null });
      }
    }
  }

  // Dedup by (code, semester, name)
  const seen = new Set<string>();
  const unique = sem9plus.filter((x) => {
    const key = `${x.code ?? "null"}|${x.semester}|${x.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => a.semester - b.semester || a.name.localeCompare(b.name));

  const codes = unique.map((x) => x.code).filter((c): c is string => typeof c === "string");
  const distinctCodes = Array.from(new Set(codes));

  const dbRows = distinctCodes.length
    ? await prisma.subject.findMany({
        where: {
          programId,
          code: { in: distinctCodes },
        },
        select: { id: true, name: true, code: true, semester: true },
      })
    : [];

  const dbByCode = new Map<string, Array<{ id: number; semester: number | null; name: string }>>();
  for (const r of dbRows) {
    const k = r.code ?? "";
    const arr = dbByCode.get(k) ?? [];
    arr.push({ id: r.id, semester: r.semester, name: r.name });
    dbByCode.set(k, arr);
  }

  console.log(
    JSON.stringify(
      {
        program: { id: program.id, name: program.name },
        snapshots: htmls.length,
        sem9plusCount: unique.length,
        distinctCodesCount: distinctCodes.length,
        sem9plus: unique,
        dbByCodeSample: Array.from(dbByCode.entries()).slice(0, 10),
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

