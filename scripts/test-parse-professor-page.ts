import { env } from "../src/config/env";
import { fetchHtml, shutdownPuppeteer } from "../src/scraper/puppeteerClient";
import {
  parseProfessorAcademicContributionsFromAcademicContributionsPageHtml,
  parseProfessorDetailsFromProfessorPageHtml,
  parseProfessorBiographyFromCompleteBiographyPageHtml,
} from "../src/scraper/ucgScraper";
import { logInfo, logWarn } from "../src/utils/logger";

async function main() {
  const profileUrl =
    process.env.SCRAPER_TEST_PROFILE_URL?.trim() ??
    "https://ucg.ac.me/radnik/130329-budimir-lutovac";

  logInfo(`Fetching professor page: ${profileUrl}`);
  const html = await fetchHtml(profileUrl);

  // Quick selector diagnostics to adjust scraper selectors.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cheerio = require("cheerio");
  const $ = cheerio.load(html);
  logInfo(`DEBUG: contains Biografija? ${html.includes("Biografija")}`);
  logInfo(
    `DEBUG: document title=${JSON.stringify(
      $("title").first().text().trim(),
    )}`,
  );
  logInfo(
    `DEBUG: og:title=${JSON.stringify(
      $("meta[property='og:title']").attr("content") ?? null,
    )}`,
  );
  logInfo(
    `DEBUG: canonical=${JSON.stringify(
      $("link[rel='canonical']").attr("href") ?? null,
    )}`,
  );
  logInfo(
    `DEBUG: og:url=${JSON.stringify(
      $("meta[property='og:url']").attr("content") ?? null,
    )}`,
  );
  logInfo(
    `DEBUG: contains radnik/130329=${html.includes("radnik/130329")}`,
  );
  const entryTitleText = $("div.entry-title").first().text();
  logInfo(
    `DEBUG: first .entry-title text=${JSON.stringify(entryTitleText.trim().slice(0, 120))}`,
  );
  const h1Text = $("div.entry-title h1").first().text();
  logInfo(
    `DEBUG: entry-title h1 text=${JSON.stringify(h1Text.trim().slice(0, 80))}`,
  );
  logInfo(`DEBUG: .entry-title count=${$(".entry-title").length}`);
  logInfo(`DEBUG: h1 count=${$("h1").length}`);
  logInfo(`DEBUG: h2 count=${$("h2").length}`);
  logInfo(`DEBUG: h3 count=${$("h3").length}`);
  logInfo(`DEBUG: h4 count=${$("h4").length}`);
  logInfo(
    `DEBUG: html contains "Biograf"? ${html.includes("Biograf")}`,
  );
  logInfo(
    `DEBUG: h1 texts=${JSON.stringify(
      $("h1")
        .toArray()
        .map((el: any) => (el?.children?.[0]?.data ? String(el.children[0].data).trim() : $(el).text().trim()))
        .filter(Boolean)
        .slice(0, 6),
    )}`,
  );
  logInfo(`DEBUG: .postcontent count=${$(".postcontent").length}`);
  const predmetiEl = $("table#predmeti").first();
  const radoviEl = $("table#radovi").first();
  logInfo(`DEBUG: table#predmeti count=${predmetiEl.length}`);
  logInfo(
    `DEBUG: predmeti parent tag=${predmetiEl.parent()[0]?.tagName ?? "n/a"} class=${JSON.stringify(
      predmetiEl.parent().attr("class") ?? null,
    )}`,
  );
  logInfo(`DEBUG: table#radovi count=${radoviEl.length}`);
  logInfo(
    `DEBUG: radovi parent tag=${radoviEl.parent()[0]?.tagName ?? "n/a"} class=${JSON.stringify(
      radoviEl.parent().attr("class") ?? null,
    )}`,
  );
  logInfo(
    `DEBUG: akademski_radovi_radnik links=${$("a[href*='akademski_radovi_radnik.php']").length}`,
  );

  logInfo(`DEBUG: mailto links=${$("a[href^='mailto:']").length}`);
  logInfo(
    `DEBUG: first mailto=${JSON.stringify(
      $("a[href^='mailto:']").first().attr("href") ?? null,
    )}`,
  );
  logInfo(
    `DEBUG: contains "Kompletna biografija"? ${html.includes("Kompletna biografija")}`,
  );
  const kompletna = $("a")
    .filter((_, el) => $(el).text().includes("Kompletna biografija"))
    .first();
  logInfo(
    `DEBUG: Kompletna biografija href=${JSON.stringify(
      kompletna.attr("href") ?? null,
    )}`,
  );
  if (kompletna.length) {
    const parent = kompletna.parent();
    logInfo(
      `DEBUG: Kompletna biografija parent tag=${parent[0]?.tagName ?? "n/a"} class=${JSON.stringify(parent.attr("class") ?? null)}`,
    );

    const href = kompletna.attr("href");
    const abs =
      href && href.startsWith("/")
        ? `${env.SCRAPER_BASE_URL}${href}`
        : href ?? null;
    if (abs) {
      logInfo(`DEBUG: fetching complete biography page: ${abs}`);
      const bioHtml = await fetchHtml(abs);
      logInfo(
        `DEBUG: complete bio length=${bioHtml.length} postcontentCount=${cheerio.load(bioHtml)(".postcontent").length} entry-contentCount=${cheerio.load(bioHtml)(".entry-content").length}`,
      );
      const $bio = cheerio.load(bioHtml);
      logInfo(
        `DEBUG: complete bio styleCount=${$bio("style").length} imgCount=${$bio("img").length}`,
      );
      logInfo(
        `DEBUG: complete bio sample text=${JSON.stringify(
          $bio("body").text().trim().slice(0, 160),
        )}`,
      );
    }
  }
  logInfo(`DEBUG: contains "Akademski doprinosi"? ${html.includes("Akademski doprinosi")}`);
  logInfo(`DEBUG: contains "Biografija -"? ${html.includes("Biografija -")}`);
  logInfo(`DEBUG: style tag count=${$("style").length}`);
  logInfo(
    `DEBUG: .entry-content count=${$(".entry-content").length}`,
  );
  logInfo(
    `DEBUG: .entry-content text sample=${JSON.stringify(
      $(".entry-content").first().text().trim().slice(0, 120),
    )}`,
  );

  const parsed = parseProfessorDetailsFromProfessorPageHtml(
    html,
    env.SCRAPER_BASE_URL,
  );

  logInfo(
    `Parsed professor name=${parsed.name} email=${parsed.email} biographyHtmlLen=${parsed.biographyHtml?.length ?? 0}`,
  );
  logInfo(
    `Teachings=${parsed.teachings.length} selectedPublications=${parsed.selectedPublications.length}`,
  );
  if (parsed.teachings.length > 0) {
    logInfo(
      `Sample teachings=${JSON.stringify(parsed.teachings.slice(0, 5), null, 2)}`,
    );
  }
  logInfo(`Academic contributions URL=${parsed.academicContributionsPageUrl ?? "none"}`);
  logInfo(`Biography complete page URL=${parsed.biographyCompletePageUrl ?? "none"}`);

  if (parsed.biographyCompletePageUrl) {
    logInfo(`Fetching complete biography page...`);
    const bioHtml = await fetchHtml(parsed.biographyCompletePageUrl);
    const bioParsed = parseProfessorBiographyFromCompleteBiographyPageHtml(
      bioHtml,
      env.SCRAPER_BASE_URL,
    );
    logInfo(
      `Parsed biography name=${bioParsed.name} biographyHtmlLen=${bioParsed.biographyHtml?.length ?? 0}`,
    );
  }

  if (parsed.academicContributionsPageUrl) {
    logInfo(`Fetching academic contributions page...`);
    const academicHtml = await fetchHtml(parsed.academicContributionsPageUrl);
    const contributions =
      parseProfessorAcademicContributionsFromAcademicContributionsPageHtml(
        academicHtml,
        env.SCRAPER_BASE_URL,
      );
    logInfo(`Parsed academic contributions rows=${contributions.length}`);

    if (contributions.length > 0) {
      logInfo(
        `Sample contribution: ${JSON.stringify(contributions[0], null, 2)}`,
      );
    }
  } else {
    logWarn("No academic contributions URL found on professor page");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await shutdownPuppeteer().catch(() => undefined);
  });

