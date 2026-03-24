import { prisma } from "../prisma/client";
import { ScraperService } from "../services/ScraperService";
import { logInfo } from "../utils/logger";
import { shutdownPuppeteer } from "../scraper/puppeteerClient";

async function main() {
  const scraper = new ScraperService();

  const testProfileUrl = process.env.SCRAPER_TEST_PROFILE_URL?.trim();
  const limit = Number(process.env.SCRAPER_PROFILE_DETAILS_LIMIT ?? "20");

  if (testProfileUrl) {
    logInfo(`Scraping professor details for profileUrl=${testProfileUrl}`);
    await scraper.scrapeProfessorDetailsForProfileUrl(testProfileUrl);
    logInfo("Professor details scrape finished");
    return;
  }

  const professors = await prisma.professor.findMany({
    where: {
      OR: [
        { biographyHtml: null },
        { biographyText: null },
        { teachings: { some: { subjectId: null } } },
        { selectedPublications: { some: { url: null } } },
      ],
    },
    take: Number.isFinite(limit) && limit > 0 ? limit : 20,
    select: { profileUrl: true },
  });

  logInfo(
    `Scraping professor details for missing biography professors=${professors.length} limit=${limit}`,
  );

  let processed = 0;
  let failed = 0;
  for (let i = 0; i < professors.length; i++) {
    const p = professors[i];
    logInfo(
      `Scraping professor ${i + 1}/${professors.length} profileUrl=${p.profileUrl}`,
    );
    try {
      await scraper.scrapeProfessorDetailsForProfileUrl(p.profileUrl);
      processed += 1;
    } catch (e) {
      failed += 1;
      console.error(
        `Professor scrape failed profileUrl=${p.profileUrl}: ${String(e)}`,
      );
    }
  }

  logInfo(
    `Professor details scrape finished processed=${processed} failed=${failed}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
  });

