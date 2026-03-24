/**
 * Sanity-check Redis + BullMQ queue (no scraping).
 * Usage: npx tsx scripts/verify-queue.ts
 */
import "dotenv/config";
import { Queue } from "bullmq";

function n(envName: string, fallback: number) {
  const raw = process.env[envName];
  if (raw === undefined) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("REDIS_URL is not set");
    process.exit(1);
  }

  const queueName = "ucg-scraper";
  const q = new Queue(queueName, {
    connection: { url } as any,
  });

  await q.waitUntilReady();
  const client = await q.client;
  const pong = await client.ping();
  console.log("Redis PING via BullMQ:", pong);

  // Debug keys: confirm we’re looking at the same internal structures the worker uses.
  const delayedKey = (q as any).keys?.delayed as string | undefined;
  const markerKey = (q as any).keys?.marker as string | undefined;
  if (delayedKey && markerKey) {
    const [minDelayedJobId, minDelayedScore] = (await client.zrange(
      delayedKey,
      0,
      0,
      "WITHSCORES",
    )) as unknown as [string, string] | any[];
    const [minMarkerMember, minMarkerScore] = (await client.zrange(
      markerKey,
      0,
      0,
      "WITHSCORES",
    )) as unknown as [string, string] | any[];

    console.log("BullMQ delayed key:", delayedKey);
    console.log("BullMQ marker key:", markerKey);
    console.log(
      "Min delayed:",
      minDelayedJobId,
      "score=",
      minDelayedScore,
      "approxTimestampMs=",
      minDelayedScore ? Number(minDelayedScore) / 0x1000 : "?",
    );
    console.log(
      "Min marker:",
      minMarkerMember,
      "score=",
      minMarkerScore,
      "approxMs=",
      minMarkerScore ? Number(minMarkerScore) : "?",
    );
  } else {
    console.log("BullMQ debug keys not available (q.keys missing).");
  }

  const repeatables = await q.getRepeatableJobs();
  console.log("Repeatable jobs on queue:", repeatables.length);
  for (const r of repeatables.slice(0, 10)) {
    console.log(
      "  -",
      r.name,
      "every",
      r.every,
      "ms next",
      r.next ? new Date(r.next).toISOString() : "?",
      "key",
      r.key,
    );
  }

  // Inspect one delayed job (if any) to see whether it is actually due yet.
  const delayedJobs = await q.getJobs(["delayed"], 0, 1);
  if (delayedJobs.length) {
    const j = delayedJobs[0];
    console.log(
      "Delayed job sample:",
      j.name,
      "id=",
      j.id,
      "timestamp=",
      j.timestamp,
      "delay=",
      (j as any).delay,
      "opts.delay=",
      (j.opts as any)?.delay,
    );
  } else {
    console.log("Delayed job sample: none");
  }

  const waitSeconds = n("VERIFY_WAIT_SECONDS", 60);
  const intervalSeconds = n("VERIFY_INTERVAL_SECONDS", 10);
  console.log(
    `Watching job counts for ~${waitSeconds}s (every ${intervalSeconds}s)…`,
  );

  const rounds = Math.ceil(waitSeconds / intervalSeconds);
  for (let i = 0; i < rounds; i++) {
    const counts = await q.getJobCounts(
      "waiting",
      "delayed",
      "active",
      "completed",
      "failed",
    );
    console.log(
      `t+${i * intervalSeconds}s Job counts:`,
      counts,
    );
    if (i < rounds - 1) {
      await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
    }
  }

  await q.close();
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
