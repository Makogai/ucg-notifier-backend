import "../polyfills/webRuntime";
import { ScraperService } from "../services/ScraperService";
import { logInfo } from "../utils/logger";
import { shutdownPuppeteer } from "../scraper/puppeteerClient";

async function main() {
  const scraper = new ScraperService();
  logInfo(
    `Running scrapePosts only once (mode=${process.env.SCRAPER_POSTS_MODE ?? "PROGRAM_LEVEL"})`,
  );
  await scraper.scrapePosts();
  logInfo("scrapePosts only finished");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
  });

