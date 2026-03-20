import puppeteer, { type Browser } from "puppeteer";
import { env } from "../config/env";
import { logInfo, logWarn } from "../utils/logger";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: env.SCRAPER_PUPPETEER_HEADLESS,
      // Some CI environments require no-sandbox.
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1280, height: 720 },
    });
    logInfo("Puppeteer browser launching");
  }
  return browserPromise;
}

export async function fetchHtml(url: string): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(env.SCRAPER_PUPPETEER_TIMEOUT_MS);

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: env.SCRAPER_PUPPETEER_TIMEOUT_MS });
    // If the site uses client-side rendering, `content()` grabs the final DOM.
    return await page.content();
  } catch (e) {
    logWarn(`Failed to fetch ${url}`);
    throw e;
  } finally {
    await page.close().catch(() => undefined);
  }
}

/**
 * Some UCG pages (program subjects) have pagination where page "2" is controlled by
 * client-side JS and the pagination anchor has href="#".
 * This helper loads the page and, if possible, clicks the "2" pagination link and
 * returns both HTML snapshots.
 */
export async function fetchHtmlWithPage2(url: string): Promise<string[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(env.SCRAPER_PUPPETEER_TIMEOUT_MS);

  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: env.SCRAPER_PUPPETEER_TIMEOUT_MS,
    });

    const html1 = await page.content();

    // Capture current row count to detect DOM change after click.
    const beforeCount = await page
      .$$eval("#spisak_predmeta tbody tr", (els) => els.length)
      .catch(() => 0);

    const clicked = await page.evaluate((pageNumber) => {
      const doc = (globalThis as any).document as any;
      const links = Array.from(
        doc.querySelectorAll("ul.pagination a, div.pagination a, nav a"),
      ) as any[];
      const target = links.find(
        (a: any) => (a.textContent ?? "").trim() === String(pageNumber),
      ) as any;
      if (!target) return false;
      target.click();
      return true;
    }, 2);

    if (!clicked) return [html1];

    // Wait a bit for client-side rendering.
    await new Promise((r) => setTimeout(r, 1200));

    const selector = "#spisak_predmeta tbody tr";
    await page
      .waitForFunction(
        `document.querySelectorAll('${selector}').length !== ${beforeCount}`,
        { timeout: 5000 },
      )
      .catch(() => undefined);

    const html2 = await page.content();
    return html1 === html2 ? [html1] : [html1, html2];
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function shutdownPuppeteer() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close().catch(() => undefined);
    browserPromise = null;
  }
}

