import { prisma } from "../src/prisma/client";
import { fetchHtmlWithPagination } from "../src/scraper/puppeteerClient";
import { parseSubjectsFromProgramHtml } from "../src/scraper/ucgScraper";
import { env } from "../src/config/env";

async function main() {
  const programId = Number(process.env.SCRAPER_TEST_PROGRAM_ID ?? "1");
  if (!Number.isFinite(programId) || programId <= 0) {
    throw new Error("Set SCRAPER_TEST_PROGRAM_ID to a valid program id.");
  }

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { id: true, name: true, url: true, facultyId: true },
  });
  if (!program) throw new Error(`Program not found: ${programId}`);

  console.log("Program:", program);

  const htmls = await fetchHtmlWithPagination(program.url, { maxPages: 50 });
  console.log(`Fetched snapshots: ${htmls.length}`);

  let overallMax: number | null = null;
  let overallSemesters = new Set<number>();

  for (let i = 0; i < htmls.length; i++) {
    const subjects = parseSubjectsFromProgramHtml(htmls[i]);
    const sems = subjects
      .map((s) => s.semester ?? null)
      .filter((s): s is number => typeof s === "number" && Number.isFinite(s));

    const maxSem = sems.length ? Math.max(...sems) : null;
    if (maxSem !== null) overallMax = overallMax === null ? maxSem : Math.max(overallMax, maxSem);
    for (const s of sems) overallSemesters.add(s);

    console.log(
      `Snapshot #${i + 1}: rows=${subjects.length} maxSem=${maxSem} semesters=${Array.from(new Set(sems)).sort((a,b)=>a-b).join(",")}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        programId,
        overallMaxSemester: overallMax,
        overallSemesters: Array.from(overallSemesters).sort((a, b) => a - b),
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
    // puppeteer client already handles closing page instances; nothing to do here
    // (we intentionally don't call shutdownPuppeteer because this is a one-shot script).
  });

