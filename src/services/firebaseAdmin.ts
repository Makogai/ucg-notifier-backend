import admin from "firebase-admin";
import fs from "fs";
import { env } from "../config/env";
import { logInfo, logWarn } from "../utils/logger";

let initialized = false;

/**
 * Many hosts (Coolify, etc.) wrap secrets in extra quotes or store JSON-as-string.
 * Normalize before JSON.parse.
 */
function parseServiceAccountJson(raw: string): Record<string, unknown> {
  let s = raw.trim().replace(/^\uFEFF/, "");

  // Strip one layer of surrounding ASCII single quotes
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    s = s.slice(1, -1).trim();
  }

  // Value is a JSON *string* whose content is the real JSON (outer double quotes + inner escapes)
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    try {
      const inner = JSON.parse(s);
      if (typeof inner === "string") {
        s = inner.trim();
      }
    } catch {
      // not a JSON string wrapper; try parsing s as object below
    }
  }

  const parsed: unknown = JSON.parse(s);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Service account JSON must be a single object");
  }
  return parsed as Record<string, unknown>;
}

function initIfNeeded() {
  if (initialized) return;

  const json = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const path = env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!json && !path) {
    logWarn("Firebase admin not configured (no service account env vars). Push disabled.");
    initialized = true;
    return;
  }

  try {
    const serviceAccount =
      json != null && json.trim().length > 0
        ? parseServiceAccountJson(json)
        : (JSON.parse(fs.readFileSync(path as string, "utf8")) as Record<
            string,
            unknown
          >);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    initialized = true;
    logInfo("Firebase admin initialized");
  } catch (e) {
    initialized = true;
    const hint =
      json != null && json.trim().length > 0
        ? " Fix FIREBASE_SERVICE_ACCOUNT_JSON: use minified JSON starting with { — no extra outer quotes in the value, or paste raw JSON in Coolify (not .env-style \"...\" wrapping)."
        : "";
    logWarn(`Firebase admin init failed; push disabled. ${String(e)}${hint}`);
  }
}

export function getFirebaseAdmin() {
  initIfNeeded();
  return admin;
}
