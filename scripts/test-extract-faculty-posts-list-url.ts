import { prisma } from "../src/prisma/client";
import { env } from "../src/config/env";
import { fetchHtml, shutdownPuppeteer } from "../src/scraper/puppeteerClient";
import { extractFacultyPostsListUrlFromFacultyHtml } from "../src/scraper/ucgScraper";
import { logInfo, logWarn } from "../src/utils/logger";

async function main() {
  const facultyShortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();
  if (!facultyShortCode) throw new Error("Set SCRAPER_TEST_FACULTY_SHORTCODE for the test.");

  const faculty = await prisma.faculty.findFirst({
    where: { shortCode: facultyShortCode },
    select: { id: true, url: true, shortCode: true, name: true },
  });

  if (!faculty) {
    logWarn(`No Faculty row found for shortCode=${facultyShortCode}`);
    return;
  }

  logInfo(
    `Testing extraction from Faculty page faculty=${facultyShortCode} id=${faculty.id} name=${faculty.name}`,
  );

  const facultyHtml = await fetchHtml(faculty.url);
  const postsListUrl = extractFacultyPostsListUrlFromFacultyHtml(
    facultyHtml,
    env.SCRAPER_BASE_URL,
  );

  if (!postsListUrl) {
    logWarn(
      "extractFacultyPostsListUrlFromFacultyHtml returned null (selector href match not found).",
    );
    return;
  }

  logInfo("extractFacultyPostsListUrlFromFacultyHtml found:", postsListUrl);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
    process.exit(0);
  });

