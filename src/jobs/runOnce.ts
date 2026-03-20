import { ScraperService } from "../services/ScraperService";
import { logInfo } from "../utils/logger";
import { shutdownPuppeteer } from "../scraper/puppeteerClient";

async function main() {
  const scraper = new ScraperService();
  logInfo("Running scraper pipeline once");
  await scraper.scrapeFaculties();
  await scraper.scrapePrograms();
  await scraper.scrapeSubjects();
  await scraper.scrapePosts();
  logInfo("Scraper pipeline finished");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
  });

