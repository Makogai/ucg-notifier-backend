import express from "express";
import cors from "cors";
import { apiRoutes } from "./routes";
import { errorMiddleware } from "./middleware/errorMiddleware";
import { setupSwagger } from "./swagger";

export const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/privacy", (_req, res) => {
  res
    .status(200)
    .type("html")
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Privacy Policy - UCG Notifier</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; background:#0b1220; color:#e5e7eb; }
      a { color:#93c5fd; }
      .wrap { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
      .card { background:#0f172a; border:1px solid rgba(148,163,184,.2); border-radius: 14px; padding: 22px; }
      h1 { margin: 0 0 10px; font-size: 28px; }
      h2 { margin: 22px 0 8px; font-size: 18px; }
      p, li { line-height: 1.55; color:#cbd5e1; }
      code { background: rgba(148,163,184,.12); padding: 2px 6px; border-radius: 6px; }
      .meta { color:#94a3b8; font-size: 14px; margin-bottom: 16px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>Privacy Policy</h1>
        <div class="meta">Last updated: ${new Date().toISOString().slice(0, 10)}</div>

        <p>
          This Privacy Policy explains how <strong>UCG Notifier</strong> (“we”, “our”, “the app”) handles information.
          The app provides notifications about publicly available posts from the University of Montenegro website.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li><strong>Device identifier</strong> (<code>deviceId</code>) generated/stored on-device to recognize your device in our system.</li>
          <li><strong>Push notification token</strong> (FCM token) to deliver notifications to your device.</li>
          <li><strong>Subscriptions</strong> you choose (faculty/program/subject + optional semester) to determine which notifications you receive.</li>
        </ul>

        <h2>Information we do not collect</h2>
        <ul>
          <li>We do not require accounts, passwords, phone numbers, or email addresses to use the app.</li>
          <li>We do not sell personal data.</li>
        </ul>

        <h2>How we use information</h2>
        <ul>
          <li>To store your notification preferences (subscriptions).</li>
          <li>To send push notifications you opted into.</li>
          <li>To maintain and secure the service (e.g., prevent duplicate notifications).</li>
        </ul>

        <h2>Source of content</h2>
        <p>
          Post content is scraped from publicly available pages on <code>ucg.ac.me</code>.
          We store post metadata (title, url, publish date, section) and may store post content (HTML/plain text) to display in the app.
        </p>

        <h2>Data retention & deletion</h2>
        <p>
          You can stop receiving notifications by unsubscribing in the app.
          If you uninstall the app, your device may stop sending updates; any stored device record may remain until periodically cleaned.
        </p>

        <h2>Third-party services</h2>
        <p>
          We use <strong>Firebase Cloud Messaging (FCM)</strong> to deliver push notifications.
          FCM tokens are handled according to Firebase/Google policies.
        </p>

        <h2>Contact</h2>
        <p>
          If you have questions about this policy, contact the developer/team that operates this instance of the service.
        </p>
      </div>
    </div>
  </body>
</html>`);
});

setupSwagger(app);

app.use(apiRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorMiddleware);

