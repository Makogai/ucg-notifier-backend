import { ScraperService } from "../services/ScraperService";
import { logInfo } from "../utils/logger";
import { shutdownPuppeteer } from "../scraper/puppeteerClient";

async function main() {
  const scraper = new ScraperService();
  logInfo(
    `Running faculty staff scrape once (testShortCode=${process.env.SCRAPER_TEST_FACULTY_SHORTCODE ?? "ALL"})`,
  );
  await scraper.scrapeFacultyStaff();
  logInfo("Faculty staff scrape finished");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
  });

