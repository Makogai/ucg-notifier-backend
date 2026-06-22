import { fetchHtml } from "../scraper/puppeteerClient";
import {
  extractPaginationUrlsFromPostsListHtml,
  extractPostsListUrlFromProgramHtml,
  parsePostsFromPostsListHtml,
  type PostScrapeItem,
} from "../scraper/ucgScraper";
import { env } from "../config/env";
import { sha256 } from "../utils/hash";
import { normalizeText } from "../utils/normalize";
import { prisma } from "../prisma/client";

export type SubjectPostsScrapeMeta = {
  scrapedPage: number | null;
  totalSourcePages: number;
  hasMorePages: boolean;
  newPostsCount: number;
};

export class SubjectPostScrapeService {
  async scrapeSubjectPostsPage(
    subjectId: number,
    page: number,
  ): Promise<SubjectPostsScrapeMeta> {
    if (!Number.isFinite(page) || page < 1) {
      throw new Error("Invalid scrape page");
    }

    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: {
        program: { select: { id: true, url: true } },
      },
    });
    if (!subject?.program?.url) {
      throw new Error("Subject or program not found");
    }

    const { pageUrls, totalSourcePages } = await this.resolveProgramPostsPages(
      subject.program.url,
    );
    if (page > totalSourcePages) {
      return {
        scrapedPage: null,
        totalSourcePages,
        hasMorePages: false,
        newPostsCount: 0,
      };
    }

    const pageUrl = pageUrls[page - 1];
    const pageHtml = await fetchHtml(pageUrl);
    const parsed = parsePostsFromPostsListHtml(pageHtml, env.SCRAPER_BASE_URL);
    const forSubject = parsed.filter((item) =>
      this.matchesSubject(item, subject.code, subject.name),
    );

    const newPostsCount = await this.insertNewPosts(
      forSubject,
      subject.id,
      subject.program.id,
    );

    return {
      scrapedPage: page,
      totalSourcePages,
      hasMorePages: page < totalSourcePages,
      newPostsCount,
    };
  }

  async peekPagination(subjectId: number): Promise<SubjectPostsScrapeMeta> {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      include: {
        program: { select: { id: true, url: true } },
      },
    });
    if (!subject?.program?.url) {
      throw new Error("Subject or program not found");
    }

    const { totalSourcePages } = await this.resolveProgramPostsPages(
      subject.program.url,
    );

    return {
      scrapedPage: null,
      totalSourcePages,
      hasMorePages: totalSourcePages > 1,
      newPostsCount: 0,
    };
  }

  private async resolveProgramPostsPages(programUrl: string) {
    const programHtml = await fetchHtml(programUrl);
    const postsListUrl = extractPostsListUrlFromProgramHtml(
      programHtml,
      env.SCRAPER_BASE_URL,
    );
    if (!postsListUrl) {
      return { pageUrls: [programUrl], totalSourcePages: 1 };
    }

    const firstPageHtml = await fetchHtml(postsListUrl);
    const paginated = extractPaginationUrlsFromPostsListHtml(
      firstPageHtml,
      env.SCRAPER_BASE_URL,
    );

    const pageUrls = this.sortPageUrls([postsListUrl, ...paginated]);
    return {
      pageUrls,
      totalSourcePages: Math.max(pageUrls.length, 1),
    };
  }

  private sortPageUrls(urls: string[]): string[] {
    const unique = Array.from(new Set(urls));
    return unique.sort((a, b) => this.pageNumberFromUrl(a) - this.pageNumberFromUrl(b));
  }

  private pageNumberFromUrl(url: string): number {
    const match = url.match(/\/(\d+)\/?$/);
    if (match) return Number(match[1]);
    return 1;
  }

  private matchesSubject(
    item: PostScrapeItem,
    subjectCode: string,
    subjectName: string,
  ): boolean {
    if (item.subjectCode && item.subjectCode === subjectCode) return true;

    const itemName = item.subjectName ? normalizeText(item.subjectName) : "";
    const wanted = normalizeText(subjectName);
    if (!itemName || !wanted) return false;

    return (
      itemName === wanted ||
      itemName.toUpperCase() === wanted.toUpperCase() ||
      wanted.toUpperCase().includes(itemName.toUpperCase()) ||
      itemName.toUpperCase().includes(wanted.toUpperCase())
    );
  }

  private async insertNewPosts(
    items: PostScrapeItem[],
    subjectId: number,
    programId: number,
  ): Promise<number> {
    if (items.length === 0) return 0;

    const prepared = items.map((p) => {
      const hash = sha256(`${p.title}::${p.url}`);
      return {
        title: p.title,
        content: null,
        contentHtml: null,
        section: p.sectionTitle ?? null,
        url: p.url,
        publishedAt: p.publishedAt ?? null,
        facultyId: null,
        subjectId,
        programId,
        hash,
      };
    });

    const hashes = prepared.map((p) => p.hash);
    const existing = await prisma.post.findMany({
      where: { hash: { in: hashes } },
      select: { hash: true },
    });
    const existingSet = new Set(existing.map((e) => e.hash));
    const newPosts = prepared.filter((p) => !existingSet.has(p.hash));
    if (newPosts.length === 0) return 0;

    const res = await prisma.post.createMany({
      data: newPosts,
      skipDuplicates: true,
    });
    return res.count;
  }
}
