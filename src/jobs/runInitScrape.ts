// Full initialization scrape: fetch all faculties/programs/subjects
// and scrape posts at FACULTY_LEVEL so `programId`/`subjectId` mapping is
// available for notifications/subscriptions.

import { ScraperService } from "../services/ScraperService";
import { logInfo } from "../utils/logger";
import { shutdownPuppeteer } from "../scraper/puppeteerClient";

async function main() {
  // Disable test filtering (if present in .env).
  process.env.SCRAPER_TEST_FACULTY_SHORTCODE = "";
  process.env.SCRAPER_POSTS_MODE = "FACULTY_LEVEL";

  const scraper = new ScraperService();
  logInfo("Init scrape: faculties -> programs -> subjects -> faculty posts");
  await scraper.scrapeFaculties();
  await scraper.scrapePrograms();
  await scraper.scrapeSubjects();
  await scraper.scrapePosts();
  logInfo("Init scrape: done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
  });

