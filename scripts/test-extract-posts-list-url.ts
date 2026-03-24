import { prisma } from "../src/prisma/client";
import { env } from "../src/config/env";
import { fetchHtml, shutdownPuppeteer } from "../src/scraper/puppeteerClient";
import { extractPostsListUrlFromProgramHtml } from "../src/scraper/ucgScraper";
import { logInfo, logWarn } from "../src/utils/logger";

async function main() {
  const facultyShortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();
  if (!facultyShortCode) {
    throw new Error("Set SCRAPER_TEST_FACULTY_SHORTCODE (faculty short code) for the test.");
  }

  const program = await prisma.program.findFirst({
    where: { faculty: { shortCode: facultyShortCode } },
    select: { id: true, url: true, name: true },
  });
  if (!program) {
    logWarn(`No Program rows found for faculty shortCode=${facultyShortCode}`);
    return;
  }

  logInfo(
    `Testing extraction from Program page faculty=${facultyShortCode} programId=${program.id} name=${program.name}`,
  );

  const programHtml = await fetchHtml(program.url);
  const postsListUrl = extractPostsListUrlFromProgramHtml(programHtml, env.SCRAPER_BASE_URL);

  if (!postsListUrl) {
    logWarn("extractPostsListUrlFromProgramHtml returned null (selector href match not found).");
    return;
  }

  logInfo("extractPostsListUrlFromProgramHtml found:", postsListUrl);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
    // eslint-disable-next-line no-process-exit
    process.exit(0);
  });

