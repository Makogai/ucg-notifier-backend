import admin from "firebase-admin";
import fs from "fs";
import { env } from "../config/env";
import { logInfo, logWarn } from "../utils/logger";

let initialized = false;

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
        ? JSON.parse(json)
        : JSON.parse(fs.readFileSync(path as string, "utf8"));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    logInfo("Firebase admin initialized");
  } catch (e) {
    initialized = true;
    logWarn(`Firebase admin init failed; push disabled. ${String(e)}`);
  }
}

export function getFirebaseAdmin() {
  initIfNeeded();
  return admin;
}

