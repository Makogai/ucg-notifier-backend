process.env.SCRAPER_TEST_FACULTY_SHORTCODE = "ETF";

import { ScraperService } from "../services/ScraperService";
import { logInfo } from "../utils/logger";
import { shutdownPuppeteer } from "../scraper/puppeteerClient";

async function main() {
  const scraper = new ScraperService();
  logInfo("ETF test: scraping faculties + programs");
  await scraper.scrapeFaculties();
  await scraper.scrapePrograms();
  logInfo("ETF test: done faculties + programs");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
  });

