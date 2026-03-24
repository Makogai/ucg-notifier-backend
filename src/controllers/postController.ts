import type { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { PostService } from "../services/PostService";

const postService = new PostService();

function parseListQuery(req: Request) {
  const sectionRaw = req.query.section;
  const section =
    typeof sectionRaw === "string" && sectionRaw.trim().length > 0
      ? sectionRaw.trim()
      : undefined;

  const limitRaw = req.query.limit;
  const limit =
    typeof limitRaw === "string" && limitRaw.trim().length > 0
      ? Number(limitRaw)
      : undefined;

  const offsetRaw = req.query.offset;
  const offset =
    typeof offsetRaw === "string" && offsetRaw.trim().length > 0
      ? Number(offsetRaw)
      : undefined;

  return {
    section,
    limit: limit != null && Number.isFinite(limit) ? limit : undefined,
    offset: offset != null && Number.isFinite(offset) ? offset : undefined,
  };
}

/** GET /faculties/:id/posts */
export async function getFacultyPosts(req: Request, res: Response) {
  const facultyId = Number(req.params.id);
  if (!Number.isFinite(facultyId)) {
    return res.status(400).json({ error: "Invalid faculty id" });
  }

  const faculty = await prisma.faculty.findUnique({
    where: { id: facultyId },
    select: { id: true, name: true, shortCode: true },
  });
  if (!faculty) return res.status(404).json({ error: "Faculty not found" });

  const q = parseListQuery(req);
  const items = await postService.listFacultyPosts(facultyId, q);
  res.json({ faculty, items });
}

/**
 * GET /posts?facultyId=<ID>&section=<OPTIONAL>&limit=&offset=
 * Same data as GET /faculties/:id/posts but faculty is selected by query param.
 */
export async function getPosts(req: Request, res: Response) {
  const facultyIdRaw = req.query.facultyId;
  const facultyId =
    typeof facultyIdRaw === "string" && facultyIdRaw.trim().length > 0
      ? Number(facultyIdRaw.trim())
      : NaN;
  if (!Number.isFinite(facultyId)) {
    return res.status(400).json({ error: "Query facultyId is required and must be a number" });
  }

  const faculty = await prisma.faculty.findUnique({
    where: { id: facultyId },
    select: { id: true, name: true, shortCode: true },
  });
  if (!faculty) return res.status(404).json({ error: "Faculty not found" });

  const q = parseListQuery(req);
  const items = await postService.listFacultyPosts(facultyId, q);
  res.json({ faculty, items });
}
