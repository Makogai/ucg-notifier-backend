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

/**
 * Fetches HTML snapshots for multiple pagination pages.
 *
 * Used for "Predmeti" tables where semesters can be spread across pages
 * controlled by pagination links (often client-side).
 *
 * The function detects numeric pagination buttons and clicks them sequentially.
 */
export async function fetchHtmlWithPagination(
  url: string,
  opts?: { maxPages?: number },
): Promise<string[]> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(env.SCRAPER_PUPPETEER_TIMEOUT_MS);

  const maxPages = opts?.maxPages ?? 50;

  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: env.SCRAPER_PUPPETEER_TIMEOUT_MS,
    });

    const htmls: string[] = [];
    const signatureSet = new Set<string>();

    const getTableSignature = async (): Promise<string> => {
      try {
        return await page.evaluate(() => {
          const doc = (globalThis as any).document as any;
          const rows = doc.querySelectorAll("#spisak_predmeta tbody tr");
          const rowCount = rows ? rows.length : 0;
          if (!rowCount) return `rows:0`;

          const semesters: string[] = [];
          const firstRowTds = rows[0]?.querySelectorAll("td");
          const lastRowTds = rows[rowCount - 1]?.querySelectorAll("td");

          const firstName =
            firstRowTds && firstRowTds.length >= 2
              ? (firstRowTds[1].textContent ?? "").trim()
              : "";
          const lastName =
            lastRowTds && lastRowTds.length >= 2
              ? (lastRowTds[1].textContent ?? "").trim()
              : "";

          // Collect up to first/last 30 semester values (fast, enough to distinguish pages).
          const limit = Math.min(30, rowCount);
          for (let i = 0; i < limit; i++) {
            const tds = rows[i]?.querySelectorAll("td");
            if (!tds || !tds.length) continue;
            const sem = (tds[0].textContent ?? "").trim();
            if (sem) semesters.push(sem);
          }

          const firstSem = semesters[0] ?? "";
          const lastSem = semesters[semesters.length - 1] ?? "";

          return `rows:${rowCount}|firstSem:${firstSem}|lastSem:${lastSem}|firstName:${firstName}|lastName:${lastName}`;
        });
      } catch {
        return "";
      }
    };

    const pushCurrent = async () => {
      const html = await page.content();
      const sig = await getTableSignature();
      const key = sig ? sig : `len:${html.length}`;
      if (signatureSet.has(key)) return;
      signatureSet.add(key);
      htmls.push(html);
    };

    await pushCurrent();

    const pageNumbers = await page.evaluate((max) => {
      const doc = (globalThis as any).document as any;
      const links = Array.from(
        doc.querySelectorAll("ul.pagination a, div.pagination a, nav a"),
      ) as any[];
      const nums = links
        .map((a) => (a.textContent ?? "").trim())
        .filter((t) => /^\d+$/.test(t))
        .map((t) => Number(t))
        .filter((n) => n >= 2 && Number.isFinite(n))
        .sort((a, b) => a - b);
      // Limit unique pages
      return Array.from(new Set(nums)).slice(0, max);
    }, maxPages);

    for (const pageNumber of pageNumbers) {
      const beforeSig = await getTableSignature();

      const clicked = await page.evaluate((n) => {
        const doc = (globalThis as any).document as any;
        const links = Array.from(
          doc.querySelectorAll("ul.pagination a, div.pagination a, nav a"),
        ) as any[];
        const target = links.find(
          (a) => (a.textContent ?? "").trim() === String(n),
        ) as any | undefined;
        if (!target) return false;
        target.click();
        return true;
      }, pageNumber);

      if (!clicked) continue;

      // Wait for client-side re-render.
      await new Promise((r) => setTimeout(r, 1200));

      // If signature changed, capture.
      const afterSig = await getTableSignature();
      if (afterSig && afterSig !== beforeSig) {
        await pushCurrent();
      } else {
        // Fallback: still capture if table row count changed (best-effort).
        await pushCurrent();
      }
    }

    return htmls;
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

