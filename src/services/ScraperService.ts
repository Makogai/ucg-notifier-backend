import { fetchHtml, fetchHtmlWithPagination } from "../scraper/puppeteerClient";
import {
  extractPostsListUrlFromProgramHtml,
  extractFacultyPostsListUrlFromFacultyHtml,
  extractFacultyPostSectionLinksFromFacultyHtml,
  extractPaginationUrlsFromPostsListHtml,
  extractLogoUrlFromFacultyHtml,
  parseFacultiesFromHomeHtml,
  parseFacultyStaffFromStaffPageHtml,
  parseFacultyPostsFromSectionListHtml,
  parsePostDetailContentFromPostHtml,
  parseProfessorAcademicContributionsFromAcademicContributionsPageHtml,
  parseProfessorDetailsFromProfessorPageHtml,
  parseProfessorBiographyFromCompleteBiographyPageHtml,
  parsePostsFromPostsListHtml,
  parseProgramsFromFacultyHtml,
  parseSubjectsFromProgramHtml,
} from "../scraper/ucgScraper";
import { env } from "../config/env";
import { sha256 } from "../utils/hash";
import { logInfo, logWarn } from "../utils/logger";
import { normalizeText } from "../utils/normalize";
import { prisma } from "../prisma/client";
import { scrapingQueue } from "../jobs/queues";
import * as cheerio from "cheerio";

export class ScraperService {
  async scrapeFaculties() {
    const html = await fetchHtml(env.SCRAPER_BASE_URL + "/");
    let faculties = parseFacultiesFromHomeHtml(html, env.SCRAPER_BASE_URL);

    const testShortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();
    if (testShortCode) {
      faculties = faculties.filter(
        (f) => f.shortCode.toUpperCase() === testShortCode.toUpperCase(),
      );
    }

    logInfo(`Scraping faculties found=${faculties.length}`);

    // We also extract a faculty logo from each faculty page (`#logo img[src]`).
    // Faculties count is small, so sequential fetch is acceptable.
    for (const f of faculties) {
      let logoUrl: string | null = null;
      try {
        const facultyHtml = await fetchHtml(f.url);
        logoUrl = extractLogoUrlFromFacultyHtml(
          facultyHtml,
          env.SCRAPER_BASE_URL,
        );
      } catch {
        // Ignore logo failures; faculty still exists without a logo.
      }

      await prisma.faculty.upsert({
        where: { shortCode: f.shortCode },
        update: { name: f.name, url: f.url, logoUrl },
        create: {
          shortCode: f.shortCode,
          name: f.name,
          url: f.url,
          logoUrl,
        },
      });
    }

    return { count: faculties.length };
  }

  async scrapePrograms() {
    const testShortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();
    const faculties = testShortCode
      ? await prisma.faculty.findMany({
          where: { shortCode: testShortCode },
          select: { id: true, url: true, shortCode: true },
        })
      : await prisma.faculty.findMany({ select: { id: true, url: true } });

    logInfo(`Scraping programs faculties=${faculties.length}`);

    let created = 0;
    for (const faculty of faculties) {
      try {
        const html = await fetchHtml(faculty.url);
        const programs = parseProgramsFromFacultyHtml(html, env.SCRAPER_BASE_URL);

        if (programs.length === 0) continue;

        // 1) Insert new programs (idempotent by `url`).
        const res = await prisma.program.createMany({
          data: programs.map((p) => ({
            facultyId: faculty.id,
            name: p.name,
            type: p.type,
            url: p.url,
          })),
          // idempotent: `url` is unique in schema
          skipDuplicates: true,
        });

        created += res.count;

        // 2) If the scraper logic changed, we should correct `type` for
        // already-existing rows. This makes reruns deterministic.
        const urlToType = new Map(programs.map((p) => [p.url, p.type]));
        const existing = await prisma.program.findMany({
          where: { url: { in: programs.map((p) => p.url) } },
          // Avoid selecting `type` here: existing rows may contain legacy/invalid
          // enum values (e.g. ''), which would crash Prisma enum parsing.
          select: { id: true, url: true },
        });

        for (const ex of existing) {
          const desiredType = urlToType.get(ex.url);
          if (!desiredType) continue;

          await prisma.program.update({
            where: { id: ex.id },
            data: { type: desiredType },
          });
        }
      } catch (e) {
        logWarn(
          `Failed scraping programs for faculty=${(faculty as any).shortCode ?? faculty.id}`,
        );
      }
    }

    return { count: created };
  }

  async scrapeSubjects() {
    const testShortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();
    const programs = testShortCode
      ? await prisma.program.findMany({
          where: { faculty: { shortCode: testShortCode } },
          select: { id: true, url: true, name: true },
        })
      : await prisma.program.findMany({ select: { id: true, url: true, name: true } });

    let created = 0;
    for (const program of programs) {
      try {
        const htmlPages = await fetchHtmlWithPagination(program.url, { maxPages: 50 });
        const merged = htmlPages.flatMap((h) => parseSubjectsFromProgramHtml(h));

        // Dedupe across pages (and across tables) using same strategy as parser.
        const seen = new Set<string>();
        const subjects = merged.filter((s) => {
          const key = s.code ? `code:${s.code}` : `name:${s.name}|sem:${s.semester ?? "na"}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const res = await prisma.subject.createMany({
          data: subjects.map((s) => ({
            programId: program.id,
            name: s.name,
            code: s.code ?? null,
            semester: s.semester ?? null,
            ects: s.ects ?? null,
          })),
          // idempotent: unique(programId,code)
          skipDuplicates: true,
        });

        created += res.count;
      } catch (e) {
        logWarn(`Failed scraping subjects for program=${program.name}`);
      }
    }

    return { count: created };
  }

  async scrapePosts() {
    const testShortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();
    const postsMode = process.env.SCRAPER_POSTS_MODE ?? "PROGRAM_LEVEL";
    if (postsMode === "FACULTY_LEVEL") {
      return this.scrapePostsFacultyLevel();
    }

    const postsLimit = Number(process.env.SCRAPER_TEST_POSTS_LIMIT ?? 0);
    const programs = testShortCode
      ? await prisma.program.findMany({
          where: { faculty: { shortCode: testShortCode } },
          select: { id: true, url: true, name: true },
        })
      : await prisma.program.findMany({ select: { id: true, url: true, name: true } });

    logInfo(`Scraping posts programs=${programs.length}`);

    let created = 0;
    const programIds = programs.map((p) => p.id);

    // Preload all subjects once so post-subject mapping doesn't require per-program queries.
    const subjectRows = programIds.length
      ? await prisma.subject.findMany({
          where: { programId: { in: programIds } },
          select: { id: true, name: true, code: true, programId: true, semester: true },
        })
      : [];

    const subjectByCode = new Map<string, { id: number }>();

    // If a subject name appears multiple times (different semesters), pick the
    // earliest semester for post-subject mapping (fallback when we don't have subjectCode).
    const subjectByNorm = new Map<string, { id: number; semester: number | null }>();
    for (const s of subjectRows) {
      if (s.code) {
        subjectByCode.set(`${s.programId}:${s.code}`, { id: s.id });
      }
      const key = `${s.programId}:${normalizeText(s.name)}`;
      const existing = subjectByNorm.get(key);
      const sem = s.semester ?? null;
      if (!existing) {
        subjectByNorm.set(key, { id: s.id, semester: sem });
        continue;
      }
      if (existing.semester === null && sem !== null) {
        subjectByNorm.set(key, { id: s.id, semester: sem });
        continue;
      }
      if (sem === null) continue;
      if (existing.semester !== null && sem < existing.semester) {
        subjectByNorm.set(key, { id: s.id, semester: sem });
      }
    }

    for (const program of programs) {
      try {
        const programHtml = await fetchHtml(program.url);
        const postsListUrl = extractPostsListUrlFromProgramHtml(
          programHtml,
          env.SCRAPER_BASE_URL,
        );
        if (!postsListUrl) continue;

        const postsHtml = await fetchHtml(postsListUrl);
        let postItems = parsePostsFromPostsListHtml(
          postsHtml,
          env.SCRAPER_BASE_URL,
        );
        if (postsLimit > 0) postItems = postItems.slice(0, postsLimit);

        const postsPrepared: Array<{
          title: string;
          content: string | null;
          contentHtml: string | null;
          section: string | null;
          url: string;
          publishedAt: Date | null;
          facultyId: number | null;
          subjectId: number | null;
          programId: number | null;
          hash: string;
        }> = postItems.map((p) => {
          const hash = sha256(`${p.title}::${p.url}`);
          const subjectIdFromCode =
            p.subjectCode && subjectByCode.get(`${program.id}:${p.subjectCode}`)?.id
              ? subjectByCode.get(`${program.id}:${p.subjectCode}`)?.id ?? null
              : null;

          const subjectNameNorm = p.subjectName
            ? normalizeText(p.subjectName)
            : "";

          const subjectIdFromName =
            subjectNameNorm
              ? subjectByNorm.get(`${program.id}:${subjectNameNorm}`)?.id ?? null
              : null;

          const subjectId = subjectIdFromCode ?? subjectIdFromName ?? null;

          return {
            title: p.title,
            content: null,
            contentHtml: null,
            section: p.sectionTitle ?? null,
            url: p.url,
            publishedAt: p.publishedAt ?? null,
            facultyId: null,
            subjectId,
            programId: program.id,
            hash,
          };
        });

        if (postsPrepared.length === 0) continue;

        // New-post detection without per-row upserts:
        // 1) fetch existing hashes in a single query
        // 2) insert only missing posts
        const hashes = postsPrepared.map((p) => p.hash);
        const existing = await prisma.post.findMany({
          where: { hash: { in: hashes } },
          select: { hash: true },
        });
        const existingSet = new Set(existing.map((e) => e.hash));

        const newPosts = postsPrepared.filter((p) => !existingSet.has(p.hash));
        if (newPosts.length === 0) continue;

        const res = await prisma.post.createMany({
          data: newPosts,
          // hash is unique, so skipDuplicates makes it idempotent
          skipDuplicates: true,
        });
        created += res.count;
        logInfo("scrapePosts new posts inserted", { count: res.count });

        // createMany doesn't return IDs, so fetch them by hash and enqueue notifications.
        const newHashes = newPosts.map((p) => p.hash);
        const inserted = await prisma.post.findMany({
          where: { hash: { in: newHashes } },
          select: { id: true, hash: true },
        });
        const idByHash = new Map(inserted.map((x) => [x.hash, x.id]));

        await Promise.all(
          newPosts.map(async (p) => {
            const postId = idByHash.get(p.hash);
            if (!postId) return;
            // Queueing is the handoff to the worker + NotificationService.
            await scrapingQueue.add(
              "notifySubscribers",
              { postId },
              { attempts: 3, removeOnComplete: true },
            );
          }),
        );
      } catch (e) {
        logWarn(`Failed scraping posts for program=${program.name}`);
      }
    }

    return { count: created };
  }

  private async scrapePostsFacultyLevel() {
    const testShortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();
    // Align with program-level: unset / 0 = scrape all posts (do not use slice(0, 0)).
    const postsLimit = Number(process.env.SCRAPER_TEST_POSTS_LIMIT ?? 0);

    const faculties = testShortCode
      ? await prisma.faculty.findMany({
          where: { shortCode: testShortCode },
          select: { id: true, url: true, shortCode: true },
        })
      : await prisma.faculty.findMany({ select: { id: true, url: true, shortCode: true } });

    let created = 0;
    let processed = 0;
    let failed = 0;
    let totalParsedAcrossFaculties = 0;
    const totalFaculties = faculties.length;
    logInfo("scrapePostsFacultyLevel started", {
      facultiesTotal: totalFaculties,
      postsLimit: postsLimit > 0 ? postsLimit : null,
      mode: "FACULTY_LEVEL",
    });

    for (const faculty of faculties) {
      const startedAt = Date.now();
      try {
        let mappingUpdated = 0;
        const facultyHtml = await fetchHtml(faculty.url);

        // Keep old "Obavještenja za predmete" as one source.
        const sectionLinks = extractFacultyPostSectionLinksFromFacultyHtml(
          facultyHtml,
          env.SCRAPER_BASE_URL,
        );
        logInfo("scrapePostsFacultyLevel sections discovered", {
          faculty: faculty.shortCode,
          count: sectionLinks.length,
          sections: sectionLinks.map((s) => ({
            title: s.sectionTitle,
            url: s.listUrl,
            paginate: s.paginate,
          })),
        });
        const postsBySection: {
          title: string;
          items: ReturnType<typeof parseFacultyPostsFromSectionListHtml>;
        }[] = [];

        for (const section of sectionLinks) {
          logInfo("scrapePostsFacultyLevel section start", {
            faculty: faculty.shortCode,
            section: section.sectionTitle,
            listUrl: section.listUrl,
            paginate: section.paginate,
          });
          const firstPageHtml = await fetchHtml(section.listUrl);
          let pageUrls = [section.listUrl];

          if (section.paginate) {
            const paginated = extractPaginationUrlsFromPostsListHtml(
              firstPageHtml,
              env.SCRAPER_BASE_URL,
            );
            if (paginated.length > 0) {
              pageUrls = Array.from(new Set([section.listUrl, ...paginated]));
            }
          }
          logInfo("scrapePostsFacultyLevel section pages", {
            faculty: faculty.shortCode,
            section: section.sectionTitle,
            pages: pageUrls.length,
            pageUrls,
          });

          const sectionItems: ReturnType<typeof parseFacultyPostsFromSectionListHtml> = [];
          for (const pageUrl of pageUrls) {
            const pageHtml =
              pageUrl === section.listUrl ? firstPageHtml : await fetchHtml(pageUrl);
            sectionItems.push(
              ...parseFacultyPostsFromSectionListHtml(
                pageHtml,
                env.SCRAPER_BASE_URL,
                section.sectionTitle,
              ),
            );
          }
          logInfo("scrapePostsFacultyLevel section parsed", {
            faculty: faculty.shortCode,
            section: section.sectionTitle,
            parsed: sectionItems.length,
          });

          postsBySection.push({ title: section.sectionTitle, items: sectionItems });
        }

        // Backward compatibility fallback: if no sections found, use old source.
        if (postsBySection.length === 0) {
          const postsListUrl = extractFacultyPostsListUrlFromFacultyHtml(
            facultyHtml,
            env.SCRAPER_BASE_URL,
          );
          if (!postsListUrl) continue;
          const postsHtml = await fetchHtml(postsListUrl);
          postsBySection.push({
            title: "Obavještenja za predmete",
            items: parsePostsFromPostsListHtml(postsHtml, env.SCRAPER_BASE_URL),
          });
          logWarn("scrapePostsFacultyLevel fallback source used", {
            faculty: faculty.shortCode,
            source: "Obavještenja za predmete",
            url: postsListUrl,
          });
        }

        const allSectionItems = postsBySection.flatMap((s) => s.items);
        totalParsedAcrossFaculties += allSectionItems.length;
        logInfo("scrapePostsFacultyLevel parsed before limit", {
          faculty: faculty.shortCode,
          total: allSectionItems.length,
          bySection: postsBySection.map((s) => ({ section: s.title, count: s.items.length })),
        });

        const postItems = allSectionItems.slice(
          0,
          postsLimit > 0 ? postsLimit : undefined,
        );
        logInfo("scrapePostsFacultyLevel limit applied", {
          faculty: faculty.shortCode,
          limit: postsLimit > 0 ? postsLimit : null,
          kept: postItems.length,
        });

        // Load all programs + subjects under this faculty so we can map:
        // - programName -> Program.id
        // - subjectCode + Program.id -> Subject.id
        const programs = await prisma.program.findMany({
          where: { facultyId: faculty.id },
          select: { id: true, name: true },
        });

        const canonicalProgramName = (name: string): string => {
          // Posts list programName usually omits the year suffix while our menu-program
          // names include "(YYYY)".
          const normalized = normalizeText(name);
          return normalized.replace(/\s*\(\d{4}\)\s*$/i, "").trim();
        };

        // Canonical key is used first; we also store raw normalized as a fallback.
        const programByName = new Map<string, number>();
        for (const p of programs) {
          const raw = normalizeText(p.name);
          const canon = canonicalProgramName(raw);
          if (raw) programByName.set(raw, p.id);
          if (canon) programByName.set(canon, p.id);
        }

        const subjectRows = await prisma.subject.findMany({
          where: { programId: { in: programs.map((p) => p.id) } },
          select: { id: true, code: true, programId: true, semester: true, name: true },
        });

        // If multiple program rows share the same canonical name (different menu years),
        // prefer the one that actually has subjects scraped in DB.
        const subjectCountByProgramId = new Map<number, number>();
        for (const s of subjectRows) {
          subjectCountByProgramId.set(
            s.programId,
            (subjectCountByProgramId.get(s.programId) ?? 0) + 1,
          );
        }
        for (const p of programs) {
          const raw = normalizeText(p.name);
          const canon = canonicalProgramName(raw);

          const candidateCount = subjectCountByProgramId.get(p.id) ?? 0;

          for (const key of [raw, canon]) {
            if (!key) continue;
            const existingId = programByName.get(key);
            const existingCount = existingId
              ? subjectCountByProgramId.get(existingId) ?? 0
              : -1;
            if (existingId == null || candidateCount > existingCount) {
              programByName.set(key, p.id);
            }
          }
        }

        const subjectByCode = new Map<string, number>();
        const subjectByNorm = new Map<string, number>();
        const subjectByCodeGlobal = new Map<string, { id: number; programId: number }>();
        const subjectByNormGlobal = new Map<string, { id: number; programId: number }>();
        for (const s of subjectRows) {
          if (s.code) subjectByCode.set(`${s.programId}:${s.code}`, s.id);
          const sNameNorm = normalizeText(s.name).toUpperCase();
          subjectByNorm.set(`${s.programId}:${sNameNorm}`, s.id);
          if (s.code && !subjectByCodeGlobal.has(s.code)) {
            subjectByCodeGlobal.set(s.code, { id: s.id, programId: s.programId });
          }
          if (sNameNorm && !subjectByNormGlobal.has(sNameNorm)) {
            subjectByNormGlobal.set(sNameNorm, { id: s.id, programId: s.programId });
          }
        }

        const postsPrepared: Array<{
          title: string;
          content: string | null;
          contentHtml: string | null;
          section: string | null;
          url: string;
          publishedAt: Date | null;
          facultyId: number | null;
          subjectId: number | null;
          programId: number | null;
          hash: string;
        }> = postItems.map((p) => {
          const hash = sha256(`${p.title}::${p.url}`);
          const programNameNorm = p.programName ? normalizeText(p.programName) : null;
          const programNameCanon = programNameNorm ? canonicalProgramName(programNameNorm) : null;

          // Start with a best-effort program mapping (even if programName doesn't include year).
          let programId =
            programNameCanon ? programByName.get(programNameCanon) ?? null : null;

          // Then map subject. If we can't match program+subject, fall back to matching by
          // subject code/name globally (best-effort; still better than NULLs).
          let subjectId: number | null = null;

          if (p.subjectCode) {
            if (programId != null) {
              subjectId = subjectByCode.get(`${programId}:${p.subjectCode}`) ?? null;
            }
            if (subjectId == null) {
              const global = subjectByCodeGlobal.get(p.subjectCode);
              if (global) {
                subjectId = global.id;
                programId = global.programId;
              }
            }
          }

          if (subjectId == null && p.subjectName) {
            const subjNameNorm = normalizeText(p.subjectName);
            if (programId != null) {
              subjectId = subjectByNorm.get(
                `${programId}:${subjNameNorm.toUpperCase()}`,
              ) ?? null;
            }
            if (subjectId == null && subjNameNorm) {
              const global = subjectByNormGlobal.get(subjNameNorm.toUpperCase());
              if (global) {
                subjectId = global.id;
                programId = global.programId;
              }
            }

            // Tolerant fallback: card subjectName sometimes includes extra
            // prefixes/suffixes that are not present in `Subject.name` rows.
            // Example: "POSLOVNE RAČUNARSKE MREŽE" vs stored "RAČUNARSKE MREŽE".
            if (subjectId == null && subjNameNorm) {
              let best: { id: number; programId: number; score: number } | null = null;
              const subjUpper = subjNameNorm.toUpperCase();
              for (const s of subjectRows) {
                const sNameNorm = normalizeText(s.name).toUpperCase();
                if (!sNameNorm) continue;
                if (subjUpper.includes(sNameNorm) || sNameNorm.includes(subjUpper)) {
                  const score = sNameNorm.length; // prefer the most specific match
                  if (best == null || score > best.score) {
                    best = { id: s.id, programId: s.programId, score };
                  }
                }
              }

              if (best) {
                subjectId = best.id;
                programId = best.programId;
              }
            }
          }

          return {
            title: p.title,
            content: null,
            contentHtml: null,
            section: p.sectionTitle ?? null,
            url: p.url,
            publishedAt: p.publishedAt ?? null,
            facultyId: faculty.id,
            subjectId,
            programId,
            hash,
          };
        });

        const hashes = postsPrepared.map((p) => p.hash);
        const existing = await prisma.post.findMany({
          where: { hash: { in: hashes } },
          select: {
            id: true,
            hash: true,
            programId: true,
            subjectId: true,
            facultyId: true,
            section: true,
            content: true,
            contentHtml: true,
          },
        });

        const existingByHash = new Map<string, (typeof existing)[number]>();
        for (const row of existing) existingByHash.set(row.hash, row);

        const existingSet = new Set(existing.map((e) => e.hash));

        // Fetch post detail content (html + text) only when needed:
        // - new posts
        // - existing posts with missing content/contentHtml
        const detailCandidates = postsPrepared.filter((prepared) => {
          const row = existingByHash.get(prepared.hash);
          if (!row) return true;
          const missingContent = row.content == null || row.content === "";
          const missingContentHtml = row.contentHtml == null || row.contentHtml === "";
          return missingContent || missingContentHtml;
        });
        logInfo("scrapePostsFacultyLevel detail fetch candidates", {
          faculty: faculty.shortCode,
          totalPrepared: postsPrepared.length,
          candidates: detailCandidates.length,
        });

        for (const prepared of detailCandidates) {
          try {
            const detailHtml = await fetchHtml(prepared.url);
            const detail = parsePostDetailContentFromPostHtml(detailHtml);
            prepared.content = detail.contentText;
            prepared.contentHtml = detail.contentHtml;
          } catch {
            // Keep null content if detail fetch fails.
          }
        }

        const newPosts = postsPrepared.filter((p) => !existingSet.has(p.hash));

        if (newPosts.length > 0) {
          const res = await prisma.post.createMany({
            data: newPosts,
            skipDuplicates: true,
          });
          created += res.count;
          logInfo("scrapePostsFacultyLevel new posts inserted", {
            faculty: faculty.shortCode,
            count: res.count,
          });
        }

        // After inserting new posts, re-load all posts by hash so we can update mapping
        // for previously-existing rows (important for reruns after scraper changes).
        const allPosts = await prisma.post.findMany({
          where: { hash: { in: hashes } },
          select: {
            id: true,
            hash: true,
            programId: true,
            subjectId: true,
            facultyId: true,
            section: true,
            publishedAt: true,
            content: true,
            contentHtml: true,
          },
        });
        const allByHash = new Map<string, (typeof allPosts)[number]>();
        for (const row of allPosts) allByHash.set(row.hash, row);

        const shouldNotifyIds: number[] = [];
        for (const desired of postsPrepared) {
          const row = allByHash.get(desired.hash);
          if (!row) continue;

          const desiredProgramId = desired.programId ?? null;
          const desiredSubjectId = desired.subjectId ?? null;
          const desiredFacultyId = desired.facultyId ?? null;
          const desiredSection = desired.section ?? null;
          const desiredPublishedAt = desired.publishedAt ?? null;
          const desiredContent = desired.content ?? null;
          const desiredContentHtml = desired.contentHtml ?? null;

          const needsProgram =
            (row.programId == null && desiredProgramId != null) ||
            // Keep Post.programId consistent when we successfully resolve subjectId
            // but the best matching program differs from the stored one.
            (row.subjectId == null &&
              desiredSubjectId != null &&
              desiredProgramId != null &&
              row.programId !== desiredProgramId);
          const needsSubject = row.subjectId == null && desiredSubjectId != null;
          const needsFaculty = row.facultyId == null && desiredFacultyId != null;
          const needsSection = (row.section == null || row.section === "") && desiredSection != null;
          const needsPublishedAt =
            desiredPublishedAt != null &&
            (row.publishedAt == null ||
              row.publishedAt.getTime() !== desiredPublishedAt.getTime());
          const needsContent = (row.content == null || row.content === "") && desiredContent != null;
          const needsContentHtml =
            (row.contentHtml == null || row.contentHtml === "") && desiredContentHtml != null;

          if (
            needsProgram ||
            needsSubject ||
            needsFaculty ||
            needsSection ||
            needsPublishedAt ||
            needsContent ||
            needsContentHtml
          ) {
            const data: {
              programId?: number | null;
              subjectId?: number | null;
              facultyId?: number | null;
              section?: string | null;
              publishedAt?: Date | null;
              content?: string | null;
              contentHtml?: string | null;
            } = {};
            if (needsProgram) data.programId = desiredProgramId;
            if (needsSubject) data.subjectId = desiredSubjectId;
            if (needsFaculty) data.facultyId = desiredFacultyId;
            if (needsSection) data.section = desiredSection;
            if (needsPublishedAt) data.publishedAt = desiredPublishedAt;
            if (needsContent) data.content = desiredContent;
            if (needsContentHtml) data.contentHtml = desiredContentHtml;

            await prisma.post.update({ where: { id: row.id }, data });
            mappingUpdated += 1;
          }
        }

        // Also notify for newly inserted posts (even if mapping didn't change).
        const newlyInsertedHashes = newPosts.map((p) => p.hash);
        for (const desired of postsPrepared) {
          if (!newlyInsertedHashes.includes(desired.hash)) continue;
          const row = allByHash.get(desired.hash);
          if (!row) continue;
          shouldNotifyIds.push(row.id);
        }

        // Dedup queued IDs.
        const uniqueIds = Array.from(new Set(shouldNotifyIds));
        if (uniqueIds.length > 0) {
          logInfo("scrapePostsFacultyLevel queue notifySubscribers", {
            faculty: faculty.shortCode,
            queued: uniqueIds.length,
            sample: uniqueIds.slice(0, 5),
          });
          await Promise.all(
            uniqueIds.map((postId) =>
              scrapingQueue.add("notifySubscribers", { postId }, { attempts: 3, removeOnComplete: true }),
            ),
          );
        }

        logInfo(
          `Faculty-level posts mapping: faculty=${faculty.shortCode} parsed=${postItems.length} inserted=${newPosts.length} updated=${mappingUpdated} queued=${uniqueIds.length}`,
        );
        processed += 1;
        logInfo("scrapePostsFacultyLevel faculty done", {
          progress: `${processed}/${totalFaculties}`,
          faculty: faculty.shortCode,
          parsedTotalThisFaculty: allSectionItems.length,
          insertedThisFaculty: newPosts.length,
          updatedThisFaculty: mappingUpdated,
          queuedThisFaculty: uniqueIds.length,
          elapsedMs: Date.now() - startedAt,
          totals: {
            created,
            parsed: totalParsedAcrossFaculties,
            failed,
          },
        });
      } catch (e) {
        failed += 1;
        processed += 1;
        logWarn(
          `Failed scraping faculty posts for faculty=${faculty.shortCode}: ${String(e)}`,
        );
        logWarn("scrapePostsFacultyLevel faculty failed", {
          progress: `${processed}/${totalFaculties}`,
          faculty: faculty.shortCode,
          elapsedMs: Date.now() - startedAt,
          totals: {
            created,
            parsed: totalParsedAcrossFaculties,
            failed,
          },
        });
      }
    }

    logInfo("scrapePostsFacultyLevel finished", {
      facultiesTotal: totalFaculties,
      processed,
      failed,
      created,
      parsed: totalParsedAcrossFaculties,
    });

    return { count: created };
  }

  /**
   * Scrapes faculty staff from `/osoblje/<facultyShortCode>`.
   *
   * New behavior:
   * - `Professor` rows are unique by `profileUrl` (same person can be updated idempotently).
   * - `faculty_staff` rows are not unique by `profileUrl` anymore; we keep all categories:
   *   unique by `(facultyId, professorId, category)`.
   */
  async scrapeFacultyStaff() {
    const testShortCode = process.env.SCRAPER_TEST_FACULTY_SHORTCODE?.trim();

    const faculties = testShortCode
      ? await prisma.faculty.findMany({
          where: { shortCode: testShortCode },
          select: { id: true, shortCode: true },
        })
      : await prisma.faculty.findMany({
          select: { id: true, shortCode: true },
        });

    logInfo(`Scraping faculty staff faculties=${faculties.length}`);

    let upserted = 0;

    for (const faculty of faculties) {
      try {
        const staffUrl = `${env.SCRAPER_BASE_URL}/osoblje/${faculty.shortCode}`;
        const staffHtml = await fetchHtml(staffUrl);

        const staffItems = parseFacultyStaffFromStaffPageHtml(
          staffHtml,
          env.SCRAPER_BASE_URL,
        );

        for (const item of staffItems) {
          const professor = await prisma.professor.upsert({
            where: { profileUrl: item.profileUrl },
            update: {
              name: item.name,
              email: item.email,
              avatarUrl: item.avatarUrl,
            },
            create: {
              profileUrl: item.profileUrl,
              name: item.name,
              email: item.email,
              avatarUrl: item.avatarUrl,
            },
            select: { id: true },
          });

          await prisma.facultyStaff.upsert({
            where: {
              facultyId_professorId_category: {
                facultyId: faculty.id,
                professorId: professor.id,
                category: item.category,
              },
            },
            update: {
              position: item.position,
            },
            create: {
              facultyId: faculty.id,
              professorId: professor.id,
              category: item.category,
              position: item.position,
            },
          });
          upserted += 1;
        }
      } catch (e) {
        logWarn(
          `Failed scraping faculty staff for faculty=${faculty.shortCode}: ${String(e)}`,
        );
      }
    }

    return { count: upserted };
  }

  /**
   * Scrapes the professor page (biography, "Nastava", "Izabrane publikacije")
   * and the academic contributions page ("Akademski doprinosi") if present.
   */
  async scrapeProfessorDetailsForProfileUrl(profileUrl: string) {
    const absProfileUrl = profileUrl.trim();
    if (!absProfileUrl) throw new Error("profileUrl is required");

    const profileHtml = await fetchHtml(absProfileUrl);

    const parsed = parseProfessorDetailsFromProfessorPageHtml(
      profileHtml,
      env.SCRAPER_BASE_URL,
    );

    let biographyHtml: string | null = null;
    let biographyText: string | null = null;
    let biographyName: string | null = null;

    if (parsed.biographyCompletePageUrl) {
      const biographyHtmlRaw = await fetchHtml(
        parsed.biographyCompletePageUrl,
      );
      const bioParsed = parseProfessorBiographyFromCompleteBiographyPageHtml(
        biographyHtmlRaw,
        env.SCRAPER_BASE_URL,
      );
      biographyHtml = bioParsed.biographyHtml;
      biographyName = bioParsed.name;
    }

    if (biographyHtml) {
      // Convert HTML biography snippet to plain text for clients that
      // can't render HTML.
      const $bio = cheerio.load(biographyHtml);
      $bio("style").remove();
      $bio("script").remove();
      $bio("img").remove();
      $bio("hr").replaceWith("\n");
      const rawText = $bio.root().text();
      biographyText = normalizeText(rawText) || null;
    }

    const maybeName = biographyName ?? parsed.name;
    const nameForCreate = maybeName ?? "Unknown professor";

    const professor = await prisma.professor.upsert({
      where: { profileUrl: absProfileUrl },
      update: {
        ...(maybeName ? { name: maybeName } : {}),
        email: parsed.email ?? null,
        biographyHtml: biographyHtml ?? null,
        biographyText: biographyText ?? null,
        biographyUpdatedAt: new Date(),
      },
      create: {
        profileUrl: absProfileUrl,
        name: nameForCreate,
        email: parsed.email ?? null,
        avatarUrl: parsed.avatarUrl ?? null, // best-effort only; staff scrape later should correct/overwrite
        biographyHtml: biographyHtml ?? null,
        biographyText: biographyText ?? null,
        biographyUpdatedAt: new Date(),
      },
      select: { id: true },
    });

    // Reset and re-create the M:N-like details for determinism.
    await prisma.professorTeaching.deleteMany({
      where: { professorId: professor.id },
    });
    await prisma.professorSelectedPublication.deleteMany({
      where: { professorId: professor.id },
    });
    await prisma.professorAcademicContribution.deleteMany({
      where: { professorId: professor.id },
    });

    if (parsed.teachings.length > 0) {
      // Best-effort matching of professor "Nastava" rows to our normalized
      // `Subject` table. If we can't find a match, we keep `subjectId = null`.
      const facultyIdByShortCode = new Map<string, number | null>();
      const programIdByFacultyAndName = new Map<string, number | null>();
      const subjectIdByKey = new Map<string, number | null>();
      const subjectIdByFacultyKey = new Map<string, number | null>();

      const resolveFacultyId = async (unit: string): Promise<number | null> => {
        const key = unit.toUpperCase();
        const cached = facultyIdByShortCode.get(key);
        if (cached !== undefined) return cached;
        const f = await prisma.faculty.findFirst({
          where: { shortCode: unit },
          select: { id: true },
        });
        const id = f?.id ?? null;
        facultyIdByShortCode.set(key, id);
        return id;
      };

      const resolveProgramId = async (
        facultyId: number,
        programName: string,
      ): Promise<number | null> => {
        const key = `${facultyId}::${normalizeText(programName).toUpperCase()}`;
        const cached = programIdByFacultyAndName.get(key);
        if (cached !== undefined) return cached;
        const p = await prisma.program.findFirst({
          where: {
            facultyId,
            name: programName,
          },
          select: { id: true },
        });
        const id = p?.id ?? null;
        programIdByFacultyAndName.set(key, id);
        return id;
      };

      const resolveSubjectId = async (
        facultyId: number,
        programId: number,
        subjectName: string | null,
        semester: number | null | undefined,
      ): Promise<number | null> => {
        if (!subjectName) return null;
        // We only link when semester is known (to avoid wrong matches).
        if (semester === null || semester === undefined) return null;

        const semKey = semester;
        const key = `${programId}::${normalizeText(subjectName).toUpperCase()}::${semKey}`;
        const cached = subjectIdByKey.get(key);
        if (cached !== undefined) return cached;

        const s = await prisma.subject.findFirst({
          where: {
            programId,
            name: subjectName,
            semester,
          },
          select: { id: true },
        });

        const id = s?.id ?? null;
        subjectIdByKey.set(key, id);
        return id;
      };

      const resolveSubjectIdByFaculty = async (
        facultyId: number,
        subjectName: string | null,
        semester: number | null | undefined,
      ): Promise<number | null> => {
        if (!subjectName) return null;
        if (semester === null || semester === undefined) return null;

        const key = `${facultyId}::${normalizeText(subjectName).toUpperCase()}::${semester}`;
        const cached = subjectIdByFacultyKey.get(key);
        if (cached !== undefined) return cached;

        const s = await prisma.subject.findFirst({
          where: {
            program: { facultyId },
            name: subjectName,
            semester,
          },
          select: { id: true },
        });

        const id = s?.id ?? null;
        subjectIdByFacultyKey.set(key, id);
        return id;
      };

      await prisma.professorTeaching.createMany({
        data: parsed.teachings.map((t) => ({
          professorId: professor.id,
          unit: t.unit,
          programName: t.programName,
          programType: t.programType,
          semester: t.semester,
          subjectName: t.subjectName,
          subjectCode: t.subjectCode,
          subjectId: null, // filled below
          pXgp: t.pXgp,
          vXgv: t.vXgv,
          lXgl: t.lXgl,
        })),
      });

      // Since `createMany` can't run per-row async resolution, we update rows
      // after insertion. This keeps the scraper deterministic but still lets us
      // link to `Subject` when possible.
      const teachingsRows = await prisma.professorTeaching.findMany({
        where: { professorId: professor.id },
        select: { id: true, unit: true, programName: true, semester: true, subjectName: true },
      });

      await Promise.all(
        teachingsRows.map(async (row) => {
          if (!row.unit || !row.subjectName) return;
          const facultyId = await resolveFacultyId(row.unit);
          if (!facultyId) return;

          let subjectId: number | null = null;
          if (row.programName) {
            const programId = await resolveProgramId(facultyId, row.programName);
            if (programId) {
              subjectId = await resolveSubjectId(
                facultyId,
                programId,
                row.subjectName,
                row.semester,
              );
            }
          }

          // Fallback: match by faculty + subject name + semester.
          if (!subjectId) {
            subjectId = await resolveSubjectIdByFaculty(
              facultyId,
              row.subjectName,
              row.semester,
            );
          }

          if (!subjectId) return;
          await prisma.professorTeaching.update({
            where: { id: row.id },
            data: { subjectId },
          });
        }),
      );
    }

    if (parsed.selectedPublications.length > 0) {
      await prisma.professorSelectedPublication.createMany({
        data: parsed.selectedPublications.map((p) => ({
          professorId: professor.id,
          year: p.year,
          category: p.category,
          authors: p.authors,
          title: p.title,
          source: p.source,
          url: p.url ?? null,
        })),
      });
    }

    if (parsed.academicContributionsPageUrl) {
      const academicHtml = await fetchHtml(
        parsed.academicContributionsPageUrl,
      );
      const contributions =
        parseProfessorAcademicContributionsFromAcademicContributionsPageHtml(
          academicHtml,
          env.SCRAPER_BASE_URL,
        );

      if (contributions.length > 0) {
        await prisma.professorAcademicContribution.createMany({
          data: contributions.map((c) => ({
            professorId: professor.id,
            contributionGroup: c.contributionGroup,
            bibliographicValue: c.bibliographicValue,
            year: c.year,
            ucgAuthors: c.ucgAuthors,
            details: c.details,
          })),
        });
      }
    }

    return { professorId: professor.id };
  }
}

