import * as cheerio from "cheerio";
import { extractFirstGroup, normalizeText, parseMaybeDate, toAbsoluteUrl } from "../utils/normalize";
import { ProgramType } from "@prisma/client";
import { scraperConfig } from "../config/scraper";

export type FacultyScrapeItem = {
  shortCode: string;
  name: string;
  url: string;
};

export type ProgramScrapeItem = {
  name: string;
  type: ProgramType;
  url: string;
};

export type SubjectScrapeItem = {
  name: string;
  code?: string | null;
  semester?: number | null;
  ects?: number | null;
};

export type PostScrapeItem = {
  title: string;
  subjectName?: string | null;
  subjectCode?: string | null;
  programName?: string | null;
  url: string;
  publishedAt?: Date | null;
};

function looksLikeFacultyShortCode(pathname: string): boolean {
  // e.g. /etf/, /pmf, /fakultet/ (we only accept short codes used in this site)
  const m = pathname.match(/^\/([^/]{2,6})(?:\/|$)/);
  if (!m) return false;
  return /^[a-z]{2,6}$/i.test(m[1]);
}

export function parseFacultiesFromHomeHtml(html: string, baseUrl: string): FacultyScrapeItem[] {
  const $ = cheerio.load(html);

  const menu = $(scraperConfig.home.facultyMenuItemSelector).filter((_, el) => {
    const t = normalizeText($(el).text()).toLowerCase();
    return scraperConfig.home.facultyMenuLabels.some((l) => t.includes(l));
  });

  const menuRoot = menu.first();
  const items: FacultyScrapeItem[] = [];

  if (menuRoot.length) {
    menuRoot.find("a[href]").each((_, a) => {
      const href = $(a).attr("href");
      if (!href) return;

      const abs = toAbsoluteUrl(baseUrl, href);
      let shortCode: string | null = null;
      try {
        const u = new URL(abs);
        if (looksLikeFacultyShortCode(u.pathname)) {
          shortCode = u.pathname.split("/").filter(Boolean)[0] ?? null;
        }
      } catch {
        shortCode = null;
      }

      if (!shortCode) return;
      const name = normalizeText($(a).text());
      if (!name) return;

      items.push({ shortCode, name, url: abs });
    });
  }

  // Dedup by shortCode
  const seen = new Set<string>();
  return items.filter((x) => {
    if (seen.has(x.shortCode)) return false;
    seen.add(x.shortCode);
    return true;
  });
}

function inferProgramTypeFromContext(text: string): ProgramType {
  const t = normalizeText(text).toLowerCase();
  if (t.includes("doktors")) return "DOKTORSKE";
  if (t.includes("osnovne")) return "OSNOVNE";
  if (t.includes("specijal")) return "SPECIJALISTICKE";
  if (t.includes("magist")) return "MAGISTARSKE";
  if (t.includes("master")) return "MASTER";
  return "MASTER";
}

function inferProgramTypeFromUrl(absUrl: string): ProgramType | null {
  // UCG program links have a stable structure:
  //   /studprog/{faculty}/{group}/{level}/{year-slug}
  // Example:
  //   /studprog/2/1/1/... -> OSNOVNE
  //   /studprog/2/1/2/... -> Specijalističke -> MASTER
  //   /studprog/2/1/4/... -> Master -> MASTER
  //   /studprog/2/5/1/... -> Doktorske
  try {
    const pathname = new URL(absUrl).pathname;
    const segs = pathname.split("/").filter(Boolean);
    if (segs.length < 4) return null;
    if (segs[0] !== "studprog") return null;

    const group = segs[2];
    const level = segs[3];

    if (group === "5") return "DOKTORSKE";
    if (level === "1") return "OSNOVNE";
    if (level === "2") return "SPECIJALISTICKE";
    if (level === "3") return "MAGISTARSKE";
    if (level === "4") return "MASTER";
    return "MASTER";
  } catch {
    return null;
  }
}

export function parseProgramsFromFacultyHtml(html: string, baseUrl: string): ProgramScrapeItem[] {
  const $ = cheerio.load(html);

  const items: ProgramScrapeItem[] = [];
  const dedup = new Set<string>(); // by url

  $(`a[href*='${scraperConfig.programs.programLinkHrefContains}']`).each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const abs = toAbsoluteUrl(baseUrl, href);
    if (dedup.has(abs)) return;

    const name = normalizeText($(a).text());
    // Prefer URL-based inference because the mega-menu HTML contains multiple
    // type blocks inside a single UL (e.g. Master + Magistarske after <HR>),
    // and nesting/closing tags are not fully consistent.
    const typeFromUrl = inferProgramTypeFromUrl(abs);
    if (typeFromUrl) {
      if (!name) return;
      dedup.add(abs);
      items.push({ name, type: typeFromUrl, url: abs });
      return;
    }

    // Fallback: infer type from the closest column title.
    const column = $(a).closest("ul.sub-menu-container");
    const typeTitle = column
      .find("li.menu-item.mega-menu-title div")
      .first()
      .text();
    const type = inferProgramTypeFromContext(typeTitle || column.text() || "");

    if (!name) return;

    dedup.add(abs);
    items.push({ name, type, url: abs });
  });

  return items;
}

export function extractLogoUrlFromFacultyHtml(
  html: string,
  baseUrl: string,
): string | null {
  const $ = cheerio.load(html);
  const img = $("#logo img[src]").first();
  const src = img.attr("src");
  if (!src) return null;
  return toAbsoluteUrl(baseUrl, src);
}

export function parseSubjectsFromProgramHtml(html: string): SubjectScrapeItem[] {
  const $ = cheerio.load(html);

  const emptyStatePhrases = ["nije pronađen nijedan rezultat", "nema pronađenih rezultata"];

  const heading = $("h3")
    .filter((_, el) => {
      const t = normalizeText($(el).text()).toLowerCase();
      return t === scraperConfig.subjects.headingText || t.includes(scraperConfig.subjects.headingText);
    })
    .first();

  if (!heading.length) return [];

  // The "Predmeti" heading is near a table (often inside the same `section` container),
  // but not necessarily as a descendant of the `h3` itself.
  let table = heading.parent().find("table").first();
  if (!table.length) table = heading.nextAll().find("table").first();

  // Compound selectors in `closest()` are unreliable in cheerio; do it stepwise.
  let container = heading.closest("section");
  if (!container.length) container = heading.closest("div");
  if (!container.length) container = heading.closest("article");
  if (!table.length) table = container.find("table").first();

  // Preferred table for program subjects.
  const tableById = container.find("table#spisak_predmeta").first();
  if (tableById.length) table = tableById;

  // The page can contain multiple subject tables (pagination / "page 1 + page 2").
  // Instead of picking only one table, parse all non-empty candidate tables
  // and merge/dedupe results.
  if (!table.length) return [];

  const tablesToParse: cheerio.Cheerio<any>[] = [];

  if (tableById.length) {
    // Prefer explicit subject table id.
    container
      .find("table#spisak_predmeta")
      .each((_, tbl) => {
        tablesToParse.push($(tbl));
      });
  } else if (container.length) {
    // Fallback: include any table with meaningful rows (not an empty-state table).
    container.find("table").each((_, tbl) => {
      const candidate = $(tbl);
      const dataRows = candidate.find("tr").filter((_, tr) => {
        const tds = $(tr).find("td");
        if (!tds.length) return false;
        // The first column usually contains semester number (or text for empty state).
        const name = normalizeText($(tds.get(0)).text()).toLowerCase();
        if (!name) return false;
        if (emptyStatePhrases.some((p) => name.includes(p))) return false;
        return true;
      }).length;

      if (dataRows > 0) tablesToParse.push(candidate);
    });
  }

  if (tablesToParse.length === 0) return [];

  // UCG "Predmeti" table structure (for most pages):
  //   Sem | Naziv | Plan | Fond | ECTS | Status
  // So:
  //   name = td[1]
  //   semester = td[0]
  //   ects = td[4]
  //   code = extract from <a href="/predmet/.../<code>-...">
  const items: SubjectScrapeItem[] = [];

  for (const t of tablesToParse) {
    t.find("tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 1) return;

      const semRaw = normalizeText($(tds.get(0)).text());
      const name = normalizeText($(tds.get(1)).text());
      const nameLower = name.toLowerCase();
      if (!name || emptyStatePhrases.some((p) => nameLower.includes(p))) return;

      const semester =
        semRaw && /^\d+$/.test(semRaw) ? Number(semRaw) : (null as number | null);

      const ectsRaw = tds.length >= 5 ? normalizeText($(tds.get(4)).text()) : "";
      const ects = ectsRaw
        ? (() => {
            const normalized = ectsRaw.replace(",", ".");
            const num = Number(normalized);
            return Number.isFinite(num) ? num : null;
          })()
        : null;

      const link = $(tds.get(1)).find("a[href]").first();
      const href = link.attr("href") ?? "";
      // Example href: /predmet/2/3/1/2017/946-basics-of-electrical-engineering
      const codeMatch = href.match(/\/(\d+)-/);
      const code = codeMatch?.[1] ?? null;

      items.push({ name, code, semester, ects });
    });
  }

  // Dedup:
  // - Prefer `code` (stable, extracted from subject link)
  // - Otherwise dedup by (name + semester)
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = x.code
      ? `code:${x.code}`
      : `name:${x.name}|sem:${x.semester ?? "na"}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function extractPostsListUrlFromProgramHtml(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);

  const link = $(`a[href*='${scraperConfig.posts.postsListHrefContains}']`).first();
  if (!link.length) return null;

  const href = link.attr("href");
  if (!href) return null;
  return toAbsoluteUrl(baseUrl, href);
}

export function extractFacultyPostsListUrlFromFacultyHtml(
  html: string,
  baseUrl: string,
): string | null {
  const $ = cheerio.load(html);
  const contains = scraperConfig.facultyPosts.postsListHrefContains;
  // Try both relative forms (with and without leading `/`).
  const link =
    $(`a[href*='${contains}']`).first().length
      ? $(`a[href*='${contains}']`).first()
      : $(`a[href*='/${contains}']`).first();
  if (!link.length) return null;
  const href = link.attr("href");
  if (!href) return null;
  return toAbsoluteUrl(baseUrl, href);
}

export function parsePostsFromPostsListHtml(html: string, baseUrl: string): PostScrapeItem[] {
  const $ = cheerio.load(html);

  const table = $(scraperConfig.posts.postsTableSelector).first();
  if (!table.length) {
    // Some UCG pages render posts as "cards" (div/grid) instead of a table.
    // In those cards, there is typically a <strong> element formatted like:
    //   "PROGRAM - SUBJECT"
    // and a title link inside an <h5><a href="...">TITLE</a></h5>.
    const items: PostScrapeItem[] = [];

    const dateRe1 = /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/;
    const dateRe2 = /\b(\d{4}-\d{2}-\d{2})\b/;

    const strongs = $("strong").toArray();
    for (const strongEl of strongs) {
      const strongText = normalizeText($(strongEl).text());
      if (!strongText.includes(" - ")) continue;

      // Find a reasonable container that contains both date and the h5 link.
      const container = $(strongEl).closest("div").first();
      const titleLink = container.find("h5 a[href]").first();
      if (!titleLink.length) continue;

      const href = titleLink.attr("href");
      const title = normalizeText(titleLink.text());
      if (!href || !title) continue;

      const abs = toAbsoluteUrl(baseUrl, href);
      const containerText = normalizeText(container.text());

      const dateStr = extractFirstGroup(containerText, dateRe1) ?? extractFirstGroup(containerText, dateRe2);
      const publishedAt = dateStr ? parseMaybeDate(dateStr) : null;

      // Extract SUBJECT name from "PROGRAM - SUBJECT"
      const lastDashIdx = strongText.lastIndexOf(" - ");
      const subjectName =
        lastDashIdx >= 0 ? normalizeText(strongText.slice(lastDashIdx + 3)) : null;

      const programName =
        lastDashIdx >= 0 ? normalizeText(strongText.slice(0, lastDashIdx)) : null;

      // Optional: try to get a stable subject code from an /predmet/... link
      let subjectCode: string | null = null;
      // The site sometimes renders relative/absolute and may omit the leading `/`.
      // Example hrefs seen in the wild:
      //   /predmet/.../93-...
      //   predmet/.../93-...
      //   https://ucg.ac.me/predmet/.../93-...
      const subjLink = container.find("a[href*='predmet']").first();
      const subjHref = subjLink.attr("href") ?? "";

      const m1 = subjHref.match(/\/(\d+)-/);
      const m2 = subjHref.match(/predmet\/(\d+)(?:-|\/)/i);
      const m3 = subjHref.match(/\/predmet\/(\d+)(?:-|\/)/i);

      subjectCode = m1?.[1] ?? m2?.[1] ?? m3?.[1] ?? null;

      items.push({
        title,
        subjectName,
        subjectCode,
        programName,
        url: abs,
        publishedAt,
      });
    }

    // Dedup by url+title
    const seen = new Set<string>();
    return items.filter((x) => {
      const k = `${x.title}::${x.url}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const dateRe1 = /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/;
  const dateRe2 = /\b(\d{4}-\d{2}-\d{2})\b/;

  const items: PostScrapeItem[] = [];
  table.find("tr").each((_, tr) => {
    const row = $(tr);
    const link = row.find("a[href]").first();
    const href = link.attr("href");
    const title = normalizeText(link.text());
    if (!href || !title) return;

    const abs = toAbsoluteUrl(baseUrl, href);
    const rowText = normalizeText(row.text());

    const dateStr = extractFirstGroup(rowText, dateRe1) ?? extractFirstGroup(rowText, dateRe2);
    const publishedAt = dateStr ? parseMaybeDate(dateStr) : null;

    const tds = row.find("td");
    let subjectName: string | null = null;
    let subjectCode: string | null = null;

    // Preferred mapping: subject column often includes a link to /predmet/.../<code>-...
    const subjectLink = row.find("a[href*='/predmet/']").first();
    const subjectHref = subjectLink.attr("href") ?? "";
    const subjectHrefCodeMatch = subjectHref.match(/\/(\d+)-/);
    if (subjectHref && subjectHrefCodeMatch?.[1]) {
      subjectCode = subjectHrefCodeMatch[1];
      subjectName = normalizeText(subjectLink.text()) || null;
    } else if (tds.length >= 1) {
      // Fallback mapping by text heuristics.
      const tdTexts = Array.from({ length: tds.length }).map((_, i) =>
        normalizeText($(tds.get(i)).text()),
      );
      const normalizedTitle = normalizeText(title);
      const normalizedDate = publishedAt
        ? normalizeText(dateStr ?? "")
        : "";

      subjectName =
        tdTexts.find(
          (t) =>
            t &&
            t !== normalizedTitle &&
            t !== normalizedDate &&
            t.length <= 80,
        ) ?? null;
    }

    items.push({ title, subjectName, subjectCode, url: abs, publishedAt });
  });

  // Dedup by url+title
  const seen = new Set<string>();
  return items.filter((x) => {
    const k = `${x.title}::${x.url}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

