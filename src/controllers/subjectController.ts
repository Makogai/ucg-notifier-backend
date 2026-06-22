import type { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { PostService } from "../services/PostService";
import { SubjectPostScrapeService } from "../services/SubjectPostScrapeService";

const postService = new PostService();
const subjectPostScrapeService = new SubjectPostScrapeService();

export async function getSubjectPosts(req: Request, res: Response) {
  const subjectId = Number(req.params.id);
  if (!Number.isFinite(subjectId)) {
    return res.status(400).json({ error: "Invalid subject id" });
  }
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, name: true, code: true, programId: true },
  });

  if (!subject) return res.status(404).json({ error: "Subject not found" });

  const scrapePageRaw = req.query.scrapePage;
  const includeMeta = req.query.includeMeta === "1" || req.query.includeMeta === "true";

  let scrape:
    | {
        scrapedPage: number | null;
        totalSourcePages: number;
        hasMorePages: boolean;
        newPostsCount: number;
      }
    | undefined;

  try {
    if (scrapePageRaw !== undefined) {
      const scrapePage = Number(scrapePageRaw);
      scrape = await subjectPostScrapeService.scrapeSubjectPostsPage(
        subjectId,
        scrapePage,
      );
    } else if (includeMeta) {
      scrape = await subjectPostScrapeService.peekPagination(subjectId);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scrape failed";
    return res.status(502).json({ error: message });
  }

  const posts = await postService.listSubjectPosts(subjectId);
  res.json({
    subject,
    items: posts,
    ...(scrape ? { scrape } : {}),
  });
}

