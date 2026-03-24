import { prisma } from "../prisma/client";
import type { Post } from "@prisma/client";

export type UpsertPostInput = {
  title: string;
  content?: string | null;
  url: string;
  publishedAt?: Date | null;
  subjectId?: number | null;
  programId?: number | null;
  hash: string;
};

export class PostService {
  async upsertPost(input: UpsertPostInput) {
    return prisma.post.upsert({
      where: { hash: input.hash },
      update: {
        title: input.title,
        content: input.content ?? null,
        url: input.url,
        publishedAt: input.publishedAt ?? null,
        subjectId: input.subjectId ?? null,
        programId: input.programId ?? null,
      },
      create: {
        title: input.title,
        content: input.content ?? null,
        url: input.url,
        publishedAt: input.publishedAt ?? null,
        subjectId: input.subjectId ?? null,
        programId: input.programId ?? null,
        hash: input.hash,
      },
    });
  }

  async upsertPostWithCreated(input: UpsertPostInput): Promise<{ post: Post; created: boolean }> {
    const existing = await prisma.post.findUnique({
      where: { hash: input.hash },
      select: { id: true },
    });

    if (existing) {
      const post = await this.upsertPost(input);
      return { post, created: false };
    }

    const post = await prisma.post.create({
      data: {
        title: input.title,
        content: input.content ?? null,
        url: input.url,
        publishedAt: input.publishedAt ?? null,
        subjectId: input.subjectId ?? null,
        programId: input.programId ?? null,
        hash: input.hash,
      },
    });

    return { post, created: true };
  }

  async listSubjectPosts(subjectId: number) {
    return prisma.post.findMany({
      where: { subjectId },
      orderBy: { publishedAt: "desc" },
      take: 200,
    });
  }

  /**
   * Faculty-level scraped posts (`facultyId` set). Optional `section` filters
   * exact match on `Post.section` (e.g. Obavještenja, Vijesti).
   */
  async listFacultyPosts(
    facultyId: number,
    opts?: { section?: string; limit?: number; offset?: number },
  ) {
    const limitRaw = opts?.limit ?? 200;
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500);
    const offsetRaw = opts?.offset ?? 0;
    const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
    const section =
      typeof opts?.section === "string" && opts.section.trim().length > 0
        ? opts.section.trim()
        : undefined;

    return prisma.post.findMany({
      where: {
        facultyId,
        ...(section ? { section } : {}),
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: offset,
    });
  }
}

