import { env } from "../src/config/env";
import { fetchHtml, shutdownPuppeteer } from "../src/scraper/puppeteerClient";
import { parseFacultyStaffFromStaffPageHtml } from "../src/scraper/ucgScraper";
import { logInfo, logWarn } from "../src/utils/logger";

async function main() {
  const shortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();
  if (!shortCode) throw new Error("Set SCRAPER_TEST_FACULTY_SHORTCODE for the test.");

  const url = `${env.SCRAPER_BASE_URL}/osoblje/${shortCode}`;
  logInfo(`Fetching staff page: ${url}`);
  const html = await fetchHtml(url);

  // Debug: confirm selectors exist on the real HTML.
  const debug = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cheerio = require("cheerio");
    const $ = cheerio.load(html);
    const h3Count = $(".postcontent h3").length;
    const cardCount = $(".postcontent div.card.h-100").length;
    const radnikCount = $(`a[href*='/radnik/']`).length;
    const fancyH3 = $(".postcontent .fancy-title h3").length;
    const headingsText = $(".postcontent h3")
      .toArray()
      .map((el: any) => (el?.children?.[0]?.data ? String(el.children[0].data).trim() : null))
      .filter(Boolean)
      .slice(0, 10);
    console.log(
      "DEBUG counts:",
      JSON.stringify(
        { h3Count, fancyH3, cardCount, radnikCount, headingsText },
        null,
        2,
      ),
    );
  };
  debug();

  const items = parseFacultyStaffFromStaffPageHtml(html, env.SCRAPER_BASE_URL);
  logInfo(`Parsed staff items=${items.length} for faculty=${shortCode}`);

  const budimirProfile = "https://ucg.ac.me/radnik/130329-budimir-lutovac";
  const budimirs = items.filter((x) => x.profileUrl === budimirProfile);
  if (budimirs.length > 0) {
    logInfo(
      `Budimir Lutovac matches=${budimirs.length}: ${budimirs
        .map((x) => `${x.category} (${x.position ?? "n/a"})`)
        .join(", ")}`,
    );
  } else {
    logWarn(`Budimir Lutovac not found in parsed items`);
  }

  if (!items.length) {
    logWarn("No staff items parsed. If this happens, the staff HTML layout/selector changed.");
    return;
  }

  console.log(
    "Sample:",
    items.slice(0, 5).map((i) => ({
      name: i.name,
      profileUrl: i.profileUrl,
      email: i.email,
      position: i.position,
      category: i.category,
      avatarUrl: i.avatarUrl,
    })),
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

