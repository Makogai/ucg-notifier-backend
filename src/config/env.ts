import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: required("REDIS_URL"),

  SCRAPER_BASE_URL: process.env.SCRAPER_BASE_URL ?? "https://ucg.ac.me",
  // Invalid / missing values must not become NaN (breaks BullMQ repeat { every }).
  SCRAPER_SCHEDULE_EVERY_MINUTES: (() => {
    const n = Number(process.env.SCRAPER_SCHEDULE_EVERY_MINUTES ?? 10);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
  })(),

  SCRAPER_PUPPETEER_HEADLESS:
    (process.env.SCRAPER_PUPPETEER_HEADLESS ?? "true").toLowerCase() ===
    "true",
  SCRAPER_PUPPETEER_TIMEOUT_MS: Number(
    process.env.SCRAPER_PUPPETEER_TIMEOUT_MS ?? 30_000,
  ),

  // Optional: force Puppeteer to use system chromium inside the container
  // (more reliable than Puppeteer's downloaded binary on some platforms).
  SCRAPER_PUPPETEER_EXECUTABLE_PATH: process.env.SCRAPER_PUPPETEER_EXECUTABLE_PATH,

  // When set, the scraper will only scrape this faculty (for fast testing).
  SCRAPER_TEST_FACULTY_SHORTCODE: process.env.SCRAPER_TEST_FACULTY_SHORTCODE,

  // Firebase (for push notifications). Provide exactly one of:
  // - FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON)
  // - FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON file)
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,

  ADMIN_API_KEY: process.env.ADMIN_API_KEY,

  // Posts scraping mode:
  // - PROGRAM_LEVEL: scrape posts per program page
  // - FACULTY_LEVEL: scrape posts once per faculty and map cards to program/subject
  SCRAPER_POSTS_MODE: process.env.SCRAPER_POSTS_MODE,

  // Optional limit used for test mode (primarily for posts parsing).
  SCRAPER_TEST_POSTS_LIMIT: Number(process.env.SCRAPER_TEST_POSTS_LIMIT ?? 0),
};

