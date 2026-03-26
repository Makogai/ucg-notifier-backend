import { prisma } from "../prisma/client";
import { logInfo, logWarn } from "../utils/logger";
import { getFirebaseAdmin } from "./firebaseAdmin";
import { env } from "../config/env";

export class NotificationService {
  async notifySubscribersForPost(postId: number) {
    const startedAt = Date.now();
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        url: true,
        facultyId: true,
        programId: true,
        subjectId: true,
        subject: {
          select: { id: true, semester: true, name: true },
        },
        program: {
          select: { facultyId: true },
        },
      },
    });

    if (!post) {
      logWarn("NOTIFY skip: post not found", { postId });
      return;
    }

    logInfo("notifySubscribersForPost", {
      postId: post.id,
      title: post.title.slice(0, 80),
      facultyId: post.facultyId ?? null,
      programId: post.programId,
      subjectId: post.subjectId,
      subjectSemester: post.subject?.semester ?? null,
    });

    // If app isn't configured for push, just no-op.
    if (!env.FIREBASE_SERVICE_ACCOUNT_JSON && !env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      logWarn("NOTIFY skip: push disabled (Firebase not configured)", {
        postId,
        reason: "firebase_not_configured",
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    // Determine facultyId:
    // - Prefer program.facultyId when programId exists (program-level posts).
    // - Fallback to post.facultyId for faculty-level posts that don't map to a program.
    const facultyId = post.program?.facultyId ?? post.facultyId ?? null;
    const programId = post.programId ?? null;
    const subjectId = post.subjectId ?? null;
    const subjectSemester = post.subject?.semester ?? null;

    if (!facultyId) {
      logWarn("NOTIFY skip: missing mapping (facultyId)", {
        postId,
        facultyId: null,
        programId,
        subjectId,
        reason: "missing_faculty",
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const subs = await prisma.subscription.findMany({
      where: {
        OR: [
          // Faculty subscription always works when facultyId is known.
          { type: "FACULTY" as const, referenceId: facultyId, semester: 0 },

          // Program/subject subscriptions only make sense if we have a programId.
          ...(programId != null
            ? ([
                {
                  type: "PROGRAM" as const,
                  referenceId: programId,
                  semester: 0,
                }, // whole program
                ...(subjectSemester != null
                  ? ([
                      {
                        type: "PROGRAM" as const,
                        referenceId: programId,
                        semester: subjectSemester,
                      } as const,
                    ] as const)
                  : ([] as const)),
              ] as const)
            : ([] as const)),

          // Exact subject subscriptions only make sense if subjectId is known.
          ...(subjectId != null
            ? ([
                {
                  type: "SUBJECT" as const,
                  referenceId: subjectId,
                  semester: 0,
                },
              ] as const)
            : ([] as const)),
        ],
      },
      include: {
        user: { select: { id: true, deviceId: true, fcmToken: true } },
      },
    });

    if (subs.length === 0) {
      logWarn("NOTIFY no matching subscriptions", {
        postId,
        facultyId,
        programId,
        subjectId,
        subjectSemester,
        subsMatched: 0,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    // Avoid sending duplicates if multiple subscription rules match the post.
    const tokenByDeviceId = new Map<string, string>();
    for (const s of subs) {
      if (!s.user.fcmToken) continue;
      if (s.user.deviceId) {
        tokenByDeviceId.set(s.user.deviceId, s.user.fcmToken);
      } else {
        // Shouldn't happen, but keep safe.
        tokenByDeviceId.set(String(s.user.id), s.user.fcmToken);
      }
    }

    logInfo("notifySubscribersForPost matching", {
      postId,
      subsMatched: subs.length,
      tokensCount: tokenByDeviceId.size,
    });

    if (tokenByDeviceId.size === 0) {
      logWarn("NOTIFY no tokens (users missing fcmToken)", {
        postId,
        subsMatched: subs.length,
        tokensCount: 0,
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const admin = getFirebaseAdmin();
    if (!admin.apps || admin.apps.length === 0) {
      logWarn("NOTIFY skip: Firebase not initialized in this process", {
        postId,
        reason: "firebase_not_initialized",
        elapsedMs: Date.now() - startedAt,
      });
      return;
    }

    const data = {
      postId: String(post.id),
      url: post.url,
      title: post.title,
      programId: post.programId ? String(post.programId) : "",
      subjectId: post.subjectId ? String(post.subjectId) : "",
      subjectSemester: post.subject?.semester ? String(post.subject.semester) : "",
    };

    const sendTasks: Array<Promise<string>> = [];
    for (const [, token] of tokenByDeviceId) {
      sendTasks.push(
        admin.messaging().send({
          token,
          notification: {
            title: "Nova obavještenja",
            body: post.title.slice(0, 120),
          },
          data,
        }),
      );
    }

    const results = await Promise.allSettled(sendTasks);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.length - ok;
    logInfo("notifySubscribersForPost send results", { postId, ok, fail });
    logWarn("NOTIFY summary", {
      postId,
      facultyId,
      programId,
      subjectId,
      subjectSemester,
      subsMatched: subs.length,
      tokensCount: tokenByDeviceId.size,
      ok,
      fail,
      elapsedMs: Date.now() - startedAt,
    });
    if (fail > 0) {
      const firstRej = results.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      logWarn("notifySubscribersForPost first failure", {
        postId,
        reason: firstRej ? String(firstRej.reason) : "unknown",
      });
    }
  }
}

