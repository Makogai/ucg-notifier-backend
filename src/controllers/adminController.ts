import type { Request, Response } from "express";
import { z } from "zod";
import { getFirebaseAdmin } from "../services/firebaseAdmin";
import { prisma } from "../prisma/client";
import { scrapingQueue } from "../jobs/queues";
import { sha256 } from "../utils/hash";
import { normalizeText } from "../utils/normalize";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NotifyBodySchema = z.object({
  token: z.string().min(10).optional(),
  deviceId: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  // Optional string map for navigation/handling in Flutter.
  data: z.record(z.string(), z.string()).optional(),
});

export async function adminTestNotify(req: Request, res: Response) {
  const parse = NotifyBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { token, title, body, data } = parse.data;

  // For simplicity: token-based send. DeviceId-based send can be wired later
  // once the client saves deviceId->fcmToken reliably.
  if (!token) {
    return res.status(400).json({
      error: "Provide `token` for now. (deviceId->fcmToken mapping is TODO)",
    });
  }

  const admin = getFirebaseAdmin();
  const message = {
    token,
    notification: { title, body },
    // FCM expects string values for data payload.
    data: Object.fromEntries(
      Object.entries(data ?? {}).map(([k, v]) => [k, String(v)]),
    ),
  };

  // Admin SDK `send` returns a message id.
  const messageId = await admin.messaging().send(message as any);
  return res.json({ ok: true, messageId });
}

const NewPostNotifyBodySchema = z.object({
  deviceId: z.string().min(1),
  fcmToken: z.string().min(10),
  subscription: z.object({
    type: z.enum(["FACULTY", "PROGRAM", "SUBJECT"]),
    // For PROGRAM only:
    // - WHOLE => store semester=0
    // - FROM_SUBJECT => store semester=subject.semester (requires subjectId)
    semesterMode: z.enum(["WHOLE", "FROM_SUBJECT"]).optional(),
  }),
  subjectId: z.number().int().positive(),
  post: z.object({
    title: z.string().min(1),
    url: z.string().min(1),
  }),
});

export async function adminTestNewPostNotify(req: Request, res: Response) {
  const parse = NewPostNotifyBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { deviceId, fcmToken, subscription, subjectId, post } = parse.data;

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: {
      id: true,
      programId: true,
      semester: true,
      program: { select: { facultyId: true } },
    },
  });

  if (!subject) {
    return res.status(404).json({ error: "Subject not found" });
  }

  const programId = subject.programId;
  const facultyId = subject.program.facultyId;
  const subjectSemester = subject.semester ?? null;

  const semester =
    subscription.type !== "PROGRAM"
      ? 0
      : subscription.semesterMode === "FROM_SUBJECT"
        ? subjectSemester ?? 0
        : 0;

  const referenceId =
    subscription.type === "FACULTY"
      ? facultyId
      : subscription.type === "PROGRAM"
        ? programId
        : subjectId;

  // 1) Upsert device user
  const user = await prisma.user.upsert({
    where: { deviceId },
    update: { fcmToken },
    create: { deviceId, fcmToken },
  });

  // 2) Upsert subscription
  const sub = await prisma.subscription.upsert({
    where: {
      userId_type_referenceId_semester: {
        userId: user.id,
        type: subscription.type,
        referenceId,
        semester,
      },
    },
    update: {},
    create: {
      userId: user.id,
      type: subscription.type,
      referenceId,
      semester,
    },
  });

  // 3) Upsert post (dedup by hash). We still enqueue notification even
  // if the post already exists, because this is an explicit admin test.
  const hash = sha256(`${normalizeText(post.title)}::${post.url}`);

  const createdPost = await prisma.post.upsert({
    where: { hash },
    update: {
      title: post.title,
      url: post.url,
      programId,
      subjectId,
      publishedAt: new Date(),
      content: null,
    },
    create: {
      title: post.title,
      url: post.url,
      programId,
      subjectId,
      hash,
      publishedAt: new Date(),
      content: null,
    },
  });

  // 4) Enqueue notification job
  await scrapingQueue.add(
    "notifySubscribers",
    { postId: createdPost.id },
    { attempts: 3, removeOnComplete: true },
  );

  return res.json({
    ok: true,
    subscriptionId: sub.id,
    postId: createdPost.id,
    hash,
  });
}

const NewPostBroadcastBodySchema = z.object({
  subjectId: z.number().int().positive(),
  post: z.object({
    title: z.string().min(1),
    url: z.string().min(1),
  }),
});

export async function adminTestNewPostBroadcastNotify(
  req: Request,
  res: Response,
) {
  const parse = NewPostBroadcastBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten() });
  }

  const { subjectId, post } = parse.data;

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { id: true, programId: true },
  });

  if (!subject) return res.status(404).json({ error: "Subject not found" });

  const hash = sha256(`${normalizeText(post.title)}::${post.url}`);

  const createdPost = await prisma.post.upsert({
    where: { hash },
    update: {
      title: post.title,
      url: post.url,
      programId: subject.programId,
      subjectId: subject.id,
      publishedAt: new Date(),
      content: null,
    },
    create: {
      title: post.title,
      url: post.url,
      programId: subject.programId,
      subjectId: subject.id,
      hash,
      publishedAt: new Date(),
      content: null,
    },
  });

  await scrapingQueue.add(
    "notifySubscribers",
    { postId: createdPost.id },
    { attempts: 3, removeOnComplete: true },
  );

  return res.json({ ok: true, postId: createdPost.id, hash });
}

export async function adminPage(_req: Request, res: Response) {
  // Minimal HTML form for quick manual testing.
  res.setHeader("content-type", "text/html; charset=utf-8");
  const subjects = await prisma.subject.findMany({
    take: 200,
    select: {
      id: true,
      name: true,
      code: true,
      semester: true,
      ects: true,
      programId: true,
    },
    orderBy: [{ semester: "desc" }, { name: "asc" }],
  });

  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>FCM Admin Test</title>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 16px;">
    <h2>FCM Admin Test</h2>
    <p>Send a push to a specific FCM <code>token</code>.</p>
    <form id="f">
      <div style="margin-bottom: 8px;">
        <label>FCM token</label><br/>
        <input name="token" style="width: 520px;" />
      </div>
      <div style="margin-bottom: 8px;">
        <label>Title</label><br/>
        <input name="title" value="Nova obavještenja" />
      </div>
      <div style="margin-bottom: 8px;">
        <label>Body</label><br/>
        <input name="body" value="Test poruka" />
      </div>
      <button type="submit">Send</button>
    </form>
    <pre id="out"></pre>
    <hr style="margin: 18px 0;"/>
    <h3>Test new-post notifications (scraper → notifySubscribers)</h3>
    <p>
      This creates/updates a device user, creates/updates a subscription, inserts a Post,
      and enqueues <code>notifySubscribers</code>.
    </p>
    <form id="newPost">
      <div style="margin-bottom: 8px;">
        <label>deviceId</label><br/>
        <input name="deviceId" style="width: 220px;" value="test-device-1"/>
      </div>
      <div style="margin-bottom: 8px;">
        <label>fcmToken</label><br/>
        <input name="fcmToken" style="width: 520px;" />
      </div>
      <div style="margin-bottom: 8px; display:flex; gap:12px; flex-wrap:wrap;">
        <div>
          <label>subscription.type</label><br/>
          <select name="subType" id="subType">
            <option value="PROGRAM">PROGRAM</option>
            <option value="SUBJECT">SUBJECT</option>
            <option value="FACULTY">FACULTY</option>
          </select>
        </div>
        <div id="semesterModeWrap">
          <label>PROGRAM semester mode</label><br/>
          <select name="semesterMode" id="semesterMode">
            <option value="WHOLE">WHOLE</option>
            <option value="FROM_SUBJECT">FROM_SUBJECT</option>
          </select>
        </div>
      </div>

      <div style="margin-bottom: 8px;">
        <label>subject to create the post for</label><br/>
        <select name="subjectId" id="subjectId" style="width: 720px;">
          ${subjects
            .map((s) => {
              const sem = s.semester ?? "na";
              const label = `${s.name}${s.code ? ` (${s.code})` : ""} — sem ${sem}`;
              return `<option value="${s.id}">${escapeHtml(label)}</option>`;
            })
            .join("\n")}
        </select>
      </div>

      <div style="margin-bottom: 8px;">
        <label>post.title</label><br/>
        <input name="postTitle" style="width: 420px;" value="Test obavještenje"/>
      </div>
      <div style="margin-bottom: 8px;">
        <label>post.url (make unique)</label><br/>
        <input name="postUrl" style="width: 520px;" value="https://example.com/test-1"/>
      </div>
      <button type="submit">Create post + notify</button>
    </form>
    <hr style="margin: 18px 0;"/>
    <h3>Create post + notify ALL subscribers</h3>
    <p>
      This mode does NOT create a device or subscription.
      It only inserts a new Post and enqueues <code>notifySubscribers</code>,
      so every already-matching subscription in your DB will be notified.
    </p>
    <form id="broadcastPost">
      <div style="margin-bottom: 8px;">
        <label>subject to create the post for</label><br/>
        <select name="subjectId" id="broadcastSubjectId" style="width: 720px;">
          ${subjects
            .map((s) => {
              const sem = s.semester ?? "na";
              const label = `${s.name}${s.code ? ` (${s.code})` : ""} — sem ${sem}`;
              return `<option value="${s.id}">${escapeHtml(label)}</option>`;
            })
            .join("\n")}
        </select>
      </div>
      <div style="margin-bottom: 8px;">
        <label>post.title</label><br/>
        <input name="postTitle" style="width: 420px;" value="Test obavještenje (broadcast)"/>
      </div>
      <div style="margin-bottom: 8px;">
        <label>post.url (make unique)</label><br/>
        <input name="postUrl" style="width: 520px;" value="https://example.com/test-broadcast-1"/>
      </div>
      <button type="submit">Create post + notify ALL</button>
    </form>
    <script>
      const authKey = new URLSearchParams(location.search).get('key') || '';
      const subTypeEl = document.getElementById('subType');
      const semesterModeWrap = document.getElementById('semesterModeWrap');
      function syncSemWrap() {
        semesterModeWrap.style.display = (subTypeEl.value === 'PROGRAM') ? 'block' : 'none';
      }
      subTypeEl.addEventListener('change', syncSemWrap);
      syncSemWrap();

      const f = document.getElementById('f');
      const out = document.getElementById('out');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = new FormData(f);
        const payload = {
          token: form.get('token'),
          title: form.get('title'),
          body: form.get('body'),
          data: { postId: "0" }
        };
        out.textContent = 'Sending...';
        const res = await fetch('/admin/test-notify', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(authKey ? { 'x-admin-key': authKey } : {})
          },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        out.textContent = res.ok ? JSON.stringify(json, null, 2) : 'ERROR: ' + JSON.stringify(json, null, 2);
      });

      const newPostForm = document.getElementById('newPost');
      newPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = new FormData(newPostForm);
        const subType = form.get('subType');
        const semesterMode = form.get('semesterMode') || 'WHOLE';
        const subjectId = Number(form.get('subjectId'));

        const payload = {
          deviceId: String(form.get('deviceId')),
          fcmToken: String(form.get('fcmToken')),
          subscription: {
            type: subType,
            ...(subType === 'PROGRAM' ? { semesterMode: semesterMode } : {})
          },
          subjectId: subjectId,
          post: { title: String(form.get('postTitle')), url: String(form.get('postUrl')) }
        };

        out.textContent = 'Sending new-post test...';
        const res = await fetch('/admin/test-new-post-notify', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(authKey ? { 'x-admin-key': authKey } : {})
          },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        out.textContent = res.ok ? JSON.stringify(json, null, 2) : 'ERROR: ' + JSON.stringify(json, null, 2);
      });

      const broadcastForm = document.getElementById('broadcastPost');
      broadcastForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = new FormData(broadcastForm);
        const payload = {
          subjectId: Number(form.get('subjectId')),
          post: {
            title: String(form.get('postTitle')),
            url: String(form.get('postUrl')),
          }
        };

        out.textContent = 'Sending broadcast new-post test...';
        const res = await fetch('/admin/test-new-post-broadcast-notify', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(authKey ? { 'x-admin-key': authKey } : {})
          },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        out.textContent = res.ok ? JSON.stringify(json, null, 2) : 'ERROR: ' + JSON.stringify(json, null, 2);
      });
    </script>
  </body>
</html>`);
}

