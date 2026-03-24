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
  sectionTitle?: string | null;
  url: string;
  publishedAt?: Date | null;
};

export type FacultySectionListLink = {
  sectionTitle: string;
  listUrl: string;
  paginate: boolean;
};

function normalizeSectionKey(input: string): string {
  return normalizeText(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

export function extractFacultyPostSectionLinksFromFacultyHtml(
  html: string,
  baseUrl: string,
): FacultySectionListLink[] {
  const $ = cheerio.load(html);
  const items: FacultySectionListLink[] = [];
  const allowedSectionByKey = new Map<string, string>([
    ["obavjestenja", "Obavještenja"],
    ["vijesti", "Vijesti"],
    ["akademska obavjestenja", "Akademska obavještenja"],
    ["obavjestenja za predmete", "Obavještenja za predmete"],
  ]);

  // On faculty pages section links usually appear in sidebar/blocks as:
  //   <h3><a href="objave_spisak/...">Obavještenja</a></h3>
  // but some pages render links without h3 wrappers.
  $("a[href*='objave_spisak/'], a[href*='/objave_spisak/']").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const rawTitle = normalizeText($(a).text());
    if (!rawTitle) return;
    const key = normalizeSectionKey(rawTitle);
    const canonicalSectionTitle = allowedSectionByKey.get(key);
    if (!canonicalSectionTitle) return;

    const listUrl = toAbsoluteUrl(baseUrl, href);
    // Keep pagination only for main "Obavještenja".
    const paginate = key === "obavjestenja";

    items.push({
      sectionTitle: canonicalSectionTitle,
      listUrl,
      paginate,
    });
  });

  // Dedup by listUrl
  const seen = new Set<string>();
  return items.filter((x) => {
    if (seen.has(x.listUrl)) return false;
    seen.add(x.listUrl);
    return true;
  });
}

export function extractPaginationUrlsFromPostsListHtml(
  html: string,
  baseUrl: string,
): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $("a[href*='/objave_spisak/']").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const text = normalizeText($(a).text());
    if (!/^\d+$/.test(text)) return;
    urls.push(toAbsoluteUrl(baseUrl, href));
  });
  return Array.from(new Set(urls));
}

export function parseFacultyPostsFromSectionListHtml(
  html: string,
  baseUrl: string,
  sectionTitle: string,
): PostScrapeItem[] {
  const $ = cheerio.load(html);
  const items: PostScrapeItem[] = [];

  // Faculty section cards are rendered in multiple variants:
  // - `.entry-title h4 a[href='/objava/blog/...']` (your "Obavještenja" example)
  // - `.entry-title h5 a[href='/objava/blog/...']` (some faculty pages)
  // - other list/table-like layouts (handled by generic fallback below)
  $(
    ".entry .entry-title h4 a[href*='/objava/blog/'], .entry .entry-title h4 a[href*='objava/blog/'], .entry .entry-title h5 a[href*='/objava/blog/'], .entry .entry-title h5 a[href*='objava/blog/']",
  ).each((_, a) => {
    const href = $(a).attr("href");
    const title = normalizeText($(a).text());
    if (!href || !title) return;

    const entry = $(a).closest(".entry");
    const entryMetaText = normalizeText(entry.find(".entry-meta").first().text());
    const entryText = normalizeText(entry.text());
    const dateSource = `${entryMetaText} ${entryText}`;

    const dateStr =
      extractFirstGroup(dateSource, /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/) ??
      extractFirstGroup(dateSource, /\b(\d{4}-\d{2}-\d{2})\b/);
    const publishedAt = dateStr ? parseMaybeDate(dateStr) : null;

    items.push({
      title,
      sectionTitle,
      url: toAbsoluteUrl(baseUrl, href),
      publishedAt,
    });
  });

  // Fallback for legacy/table-like list pages:
  // parse generic posts list and force section title.
  items.push(
    ...parsePostsFromPostsListHtml(html, baseUrl).map((p) => ({
      ...p,
      sectionTitle,
    })),
  );

  // Additional fallback tailored for list pages like /objave_spisak/blog/101:
  // posts are often direct `h5 a` under `.col-md-6.col-lg-12` blocks.
  $("h5 a[href*='/objava/blog/'], h5 a[href*='objava/blog/']").each((_, a) => {
    const href = $(a).attr("href");
    const title = normalizeText($(a).text());
    if (!href || !title) return;

    const box = $(a).closest(".col-md-6.col-lg-12, .col-lg-12, .col-md-6, div");
    const strongText = normalizeText(box.find("strong").first().text());
    const boxText = normalizeText(box.text());
    const dateSource = `${strongText} ${boxText}`;
    const dateStr =
      extractFirstGroup(dateSource, /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/) ??
      extractFirstGroup(dateSource, /\b(\d{4}-\d{2}-\d{2})\b/);

    items.push({
      title,
      sectionTitle,
      url: toAbsoluteUrl(baseUrl, href),
      publishedAt: dateStr ? parseMaybeDate(dateStr) : null,
    });
  });

  // Dedup while preferring entries that have publishedAt populated.
  const byKey = new Map<string, PostScrapeItem>();
  for (const item of items) {
    const k = `${item.title}::${item.url}`;
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, item);
      continue;
    }
    if (!existing.publishedAt && item.publishedAt) {
      byKey.set(k, item);
    }
  }
  return Array.from(byKey.values());
}

export function parsePostDetailContentFromPostHtml(html: string): {
  contentHtml: string | null;
  contentText: string | null;
} {
  const $ = cheerio.load(html);
  const postcontent = $(".postcontent").first();
  if (!postcontent.length) return { contentHtml: null, contentText: null };

  const styleEl = postcontent.find("style").first();
  let contentRoot: cheerio.Cheerio<any>;

  if (styleEl.length) {
    contentRoot = styleEl.nextAll().clone();
  } else {
    contentRoot = postcontent.clone();
    contentRoot.find(".entry-title").remove();
    contentRoot.find(".entry-meta").remove();
  }

  // Remove noisy footer/promo pieces
  contentRoot.find("script").remove();
  contentRoot.find(".style-msg").remove();
  contentRoot.find("[data-scrollto]").remove();

  const contentHtmlRaw = contentRoot.toArray().map((el) => $.html(el)).join("").trim();
  const contentHtml = contentHtmlRaw.length ? contentHtmlRaw : null;

  const plain = cheerio.load(contentHtmlRaw || "");
  plain("style,script").remove();
  const contentText = normalizeText(plain.root().text()) || null;

  return { contentHtml, contentText };
}

export type FacultyStaffScrapeItem = {
  profileUrl: string;
  name: string;
  email: string | null;
  position: string | null;
  // Major section name from the page (e.g. "Rukovodstvo", "Angažovano osoblje")
  category: string;
  avatarUrl: string | null;
};

/**
 * Parses a faculty staff page (`/osoblje/<shortCode>`).
 *
 * Strategy:
 * - Use each `<h3>` inside `.postcontent` as the section/category.
 * - Take the content between this `<h3>` and the next `<h3>`.
 * - Extract staff "cards" that link to `/radnik/...`.
 */
export function parseFacultyStaffFromStaffPageHtml(
  html: string,
  baseUrl: string,
): FacultyStaffScrapeItem[] {
  const $ = cheerio.load(html);

  // De-dupe within a single faculty scrape by (profileUrl, category),
  // so the same professor appearing in multiple sections is kept.
  const byCardKey = new Map<string, FacultyStaffScrapeItem>();

  // Only staff-related headings should be in this region.
  const headings = $(".postcontent h3")
    .toArray()
    .map((el) => $(el))
    .filter((h) => normalizeText(h.text()).length > 0);

  for (const h of headings) {
    const category = normalizeText(h.text());
    if (!category) continue; // should not happen, but keep parser defensive

    // The `<h3>` is usually inside `.fancy-title`, and the cards live in the
    // siblings right after that wrapper. In particular, another section's `h3`
    // is NOT a sibling element, it lives inside another `.fancy-title` wrapper.
    // So we must stop at `.fancy-title` boundaries, not literal `h3` elements.
    const fancyTitle = h.closest(".fancy-title");
    const wrapper = fancyTitle.length ? fancyTitle.first() : h.parent();

    // Prefer the immediate container right after the header.
    // In the HTML, each staff category renders as:
    //   <div class="fancy-title"> <h3>...</h3> </div>
    //   <div class="row posts-md ..."> ... cards ... </div>
    // So we restrict extraction to that container to avoid over-including cards
    // from the next section.
    const sectionRoot = wrapper.nextAll(".row.posts-md").first();
    const section =
      sectionRoot.length > 0
        ? sectionRoot
        : fancyTitle.length
          ? wrapper.nextUntil(".fancy-title")
          : wrapper.nextUntil("h3");

    const cards = section.find("div.card.h-100");
    cards.each((_, cardEl) => {
      const card = $(cardEl);

      const profileAnchor = card.find("h5.card-title a[href*='/radnik/']").first();
      if (!profileAnchor.length) return;

      const href = profileAnchor.attr("href");
      if (!href) return;
      const profileUrl = toAbsoluteUrl(baseUrl, href);

      const img = profileAnchor.find("img[src]").first();
      const avatarHref = img.attr("src") ?? null;
      const avatarUrl = avatarHref ? toAbsoluteUrl(baseUrl, avatarHref) : null;

      const altName = img.attr("alt");
      const anchorTextName = normalizeText(profileAnchor.text());
      const name = normalizeText(altName ?? anchorTextName) || anchorTextName;
      if (!name) return;

      const mailto = card.find("a[href^='mailto:']").first().attr("href") ?? null;
      const email = mailto ? mailto.replace(/^mailto:/i, "") : null;

      const positionSpan = card.find("p.card-text span").first();
      // Remove the mailto link inside the span so position doesn't include email.
      const positionRaw = positionSpan
        .clone()
        .find("a[href^='mailto:']")
        .remove()
        .end()
        .text();
      const position = normalizeText(positionRaw) || null;

      const nextItem: FacultyStaffScrapeItem = {
        profileUrl,
        name,
        email,
        position,
        category,
        avatarUrl,
      };

      const cardKey = `${profileUrl}::${category}`;
      if (byCardKey.has(cardKey)) return;
      byCardKey.set(cardKey, nextItem);
    });
  }

  return Array.from(byCardKey.values());
}

export type ProfessorTeachingScrapeItem = {
  unit?: string | null;
  programName?: string | null;
  programType?: string | null;
  semester?: number | null;

  subjectName?: string | null;
  subjectCode?: string | null;

  pXgp?: number | null;
  vXgv?: number | null;
  lXgl?: number | null;
};

export type ProfessorSelectedPublicationScrapeItem = {
  year?: number | null;
  category?: string | null;
  authors?: string | null;
  title?: string | null;
  source?: string | null;
  url?: string | null;
};

export type ProfessorAcademicContributionScrapeItem = {
  contributionGroup?: string | null;
  bibliographicValue?: string | null;
  year?: number | null;
  ucgAuthors?: string | null;
  details?: string | null;
};

export type ProfessorDetailsScrapeResult = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;

  biographyHtml?: string | null;
  biographyCompletePageUrl?: string | null;

  teachings: ProfessorTeachingScrapeItem[];
  selectedPublications: ProfessorSelectedPublicationScrapeItem[];

  academicContributionsPageUrl?: string | null;
};

function parseMaybeFloat(text: string): number | null {
  const t = normalizeText(text);
  if (!t) return null;
  const m = t.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseMaybeInt(text: string): number | null {
  const n = parseMaybeFloat(text);
  if (n === null) return null;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function stripUnwantedBiographyNodes($root: cheerio.Cheerio<any>): void {
  // Avoid huge images/styles in biography HTML. Keep the actual text structure.
  $root.find("style").remove();
  $root.find("img").remove();
}

export function parseProfessorDetailsFromProfessorPageHtml(
  html: string,
  baseUrl: string,
): ProfessorDetailsScrapeResult {
  const $ = cheerio.load(html);

  // The biography text is fetched via the linked "Kompletna biografija" page.
  const name: string | null = null;

  const mailto = $("a[href^='mailto:']").first().attr("href") ?? null;
  const email = mailto ? mailto.replace(/^mailto:/i, "") : null;

  // Avatar is best-effort; the HTML differs across pages.
  const avatarHref = $("img[src]").first().attr("src") ?? null;
  const avatarUrl = avatarHref ? toAbsoluteUrl(baseUrl, avatarHref) : null;

  const academicContributionsLinks = $("a[href*='akademski_radovi_radnik.php']")
    .toArray()
    .map((el) => $(el).attr("href"))
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  // Prefer the link that targets this exact professor (`radnik_id=`).
  const academicContributionsHref =
    academicContributionsLinks.find((h) => h.includes("radnik_id=")) ??
    academicContributionsLinks[0] ??
    null;
  const academicContributionsAbsUrl = academicContributionsHref
    ? toAbsoluteUrl(baseUrl, academicContributionsHref)
    : null;

  const biographyAnchor = $("a")
    .filter((_, el) =>
      normalizeText($(el).text()).toLowerCase().includes("kompletna biograf"),
    )
    .first();
  const biographyHref = biographyAnchor.attr("href") ?? null;
  const biographyCompletePageUrl = biographyHref
    ? toAbsoluteUrl(baseUrl, biographyHref)
    : null;

  // Teaching subjects ("Nastava") - table id="predmeti"
  const teachings: ProfessorTeachingScrapeItem[] = [];
  const teachingTable = $("table#predmeti").first();
  if (teachingTable.length) {
    teachingTable.find("tbody tr").each((_, trEl) => {
      const tds = $(trEl).find("td");
      const getTd = (i: number) => normalizeText($(tds.get(i)).text());

      const unit = getTd(0) || null;
      const programName = getTd(1) || null;
      const programType = getTd(2) || null;
      const semester = parseMaybeInt(getTd(3));
      const subjectName = getTd(4) || null;
      const pXgp = parseMaybeFloat(getTd(5));
      const vXgv = parseMaybeFloat(getTd(6));
      const lXgl = parseMaybeFloat(getTd(7));

      if (!unit && !programName && !subjectName) return;

      teachings.push({
        unit,
        programName,
        programType,
        semester,
        subjectName,
        subjectCode: null,
        pXgp,
        vXgv,
        lXgl,
      });
    });
  }

  // Selected publications ("Izabrane publikacije") - table id="radovi"
  const selectedPublications: ProfessorSelectedPublicationScrapeItem[] = [];
  const pubsTable = $("table#radovi").first();
  if (pubsTable.length) {
    pubsTable.find("tbody tr").each((_, trEl) => {
      const tds = $(trEl).find("td");
      const getTd = (i: number) => normalizeText($(tds.get(i)).text());

      const year = parseMaybeInt(getTd(0));
      const category = getTd(1) || null;
      const authors = getTd(2) || null;
      const titleTd = tds.get(3);
      const title = titleTd ? normalizeText($(titleTd).text()) : null;
      const source = getTd(4) || null;

      const titleAnchorHref =
        titleTd ? $(titleTd).find("a[href]").first().attr("href") ?? null : null;
      const url = titleAnchorHref ? toAbsoluteUrl(baseUrl, titleAnchorHref) : null;

      if (!year && !title) return;

      selectedPublications.push({
        year,
        category,
        authors,
        title,
        source,
        url,
      });
    });
  }

  return {
    name,
    email,
    avatarUrl,
    biographyHtml: null,
    biographyCompletePageUrl,
    teachings,
    selectedPublications,
    academicContributionsPageUrl: academicContributionsAbsUrl,
  };
}

export function parseProfessorBiographyFromCompleteBiographyPageHtml(
  html: string,
  baseUrl: string,
): { name: string | null; biographyHtml: string | null } {
  const $ = cheerio.load(html);

  // Typical title:
  //   "Biografija - Lutovac Budimir"
  const entryTitleText = normalizeText($("div.entry-title").first().text());
  const nameMatch = entryTitleText.match(/^Biografija\s*-\s*(.+)$/i);
  const name = nameMatch ? normalizeText(nameMatch[1]) : null;

  const postcontent = $(".postcontent").first();
  if (!postcontent.length) return { name, biographyHtml: null };

  // On the biography page, there is a `<style>` block and then the real
  // biography content. We store only the content after that style block
  // (and remove wrappers like title/meta/images).
  const styleEl = postcontent.find("style").first();

  const normalizeClone = (clone: cheerio.Cheerio<any>) => {
    clone.find("style").remove();
    clone.find("img").remove();
    clone.find("script").remove();
    clone.find(".entry-title").remove();
    clone.find(".entry-meta").remove();
    return clone;
  };

  let biographyHtml: string | null = null;
  if (styleEl.length) {
    const afterStyle = styleEl.nextAll().clone();
    const normalized = normalizeClone(afterStyle);
    // Absoluteize relative links inside the snippet.
    normalized.find("a[href^='/']").each((_, el) => {
      const href = normalized.find(el).attr("href");
      if (!href) return;
      normalized.find(el).attr("href", toAbsoluteUrl(baseUrl, href));
    });
    normalized.find("img[src^='/']").each((_, el) => {
      const src = normalized.find(el).attr("src");
      if (!src) return;
      normalized.find(el).attr("src", toAbsoluteUrl(baseUrl, src));
    });
    const html = normalized.toArray().map((el) => $.html(el)).join("");
    biographyHtml = html.trim().length ? html : null;
  }

  // Fallback: store the remaining postcontent content if "after style"
  // extraction fails.
  if (!biographyHtml) {
    const root = postcontent.clone();
    const normalized = normalizeClone(root);
    normalized.find("a[href^='/']").each((_, el) => {
      const href = normalized.find(el).attr("href");
      if (!href) return;
      normalized.find(el).attr("href", toAbsoluteUrl(baseUrl, href));
    });
    normalized.find("img[src^='/']").each((_, el) => {
      const src = normalized.find(el).attr("src");
      if (!src) return;
      normalized.find(el).attr("src", toAbsoluteUrl(baseUrl, src));
    });
    biographyHtml = normalized.html() ?? null;
  }

  return { name, biographyHtml };
}

export function parseProfessorAcademicContributionsFromAcademicContributionsPageHtml(
  html: string,
  baseUrl: string,
): ProfessorAcademicContributionScrapeItem[] {
  const $ = cheerio.load(html);

  const out: ProfessorAcademicContributionScrapeItem[] = [];

  // Cards with headers like "M1a-..." and an internal table with columns:
  //   Godina | UCG autori | Detalji
  const cards = $("div.card").filter((_, cardEl) => {
    return $(cardEl).find("table").length > 0;
  });

  cards.each((_, cardEl) => {
    const card = $(cardEl);
    const strongText = normalizeText(card.find(".card-header strong").first().text());
    const bibliographicValue =
      normalizeText(card.find(".card-header").first().text()) || null;

    // Best-effort group title: strongText is the most informative part.
    const contributionGroup = strongText || null;

    card.find("table tbody tr").each((_, trEl) => {
      const tds = $(trEl).find("td");
      const getTd = (i: number) => normalizeText($(tds.get(i)).text());

      const year = parseMaybeInt(getTd(0));
      const ucgAuthors = getTd(1) || null;
      const details = getTd(2) || null;

      if (!year && !details) return;

      out.push({
        contributionGroup,
        bibliographicValue,
        year,
        ucgAuthors,
        details,
      });
    });
  });

  return out;
}

