import type { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { PostService } from "../services/PostService";

const postService = new PostService();

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

  const posts = await postService.listSubjectPosts(subjectId);
  res.json({ subject, items: posts });
}

