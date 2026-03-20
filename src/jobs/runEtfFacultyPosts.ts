// ETF-only faculty-level posts test (approx first N posts).

import { ScraperService } from "../services/ScraperService";
import { logInfo } from "../utils/logger";
import { shutdownPuppeteer } from "../scraper/puppeteerClient";

async function main() {
  process.env.SCRAPER_TEST_FACULTY_SHORTCODE = "ETF";
  process.env.SCRAPER_POSTS_MODE = "FACULTY_LEVEL";
  process.env.SCRAPER_TEST_POSTS_LIMIT = process.env.SCRAPER_TEST_POSTS_LIMIT || "20";

  const scraper = new ScraperService();
  logInfo("ETF test: scraping faculties+programs+subjects, then faculty-level posts (limited)");
  await scraper.scrapeFaculties();
  await scraper.scrapePrograms();
  await scraper.scrapeSubjects();
  await scraper.scrapePosts();
  logInfo("ETF test: done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
  });

