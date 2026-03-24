import { scrapingQueue, queueName } from "./queues";
import { env } from "../config/env";
import { logInfo } from "../utils/logger";

async function main() {
  await scrapingQueue.waitUntilReady();

  const intervalMs = env.SCRAPER_SCHEDULE_EVERY_MINUTES * 60_000;

  // Reliable scheduler: enqueue `scrapePosts` directly every N minutes.
  // This avoids relying on BullMQ repeatable jobs + delayed promotion behavior.
  logInfo(
    `Posts-only scheduler (loop) started queue=${queueName} every=${env.SCRAPER_SCHEDULE_EVERY_MINUTES}m`,
  );

  while (true) {
    const job = await scrapingQueue.add("scrapePosts", {}, { attempts: 3, removeOnComplete: true });
    logInfo(`Posts-only scheduler enqueued scrapePosts jobId=${job.id}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main()
  .then(async () => {
    // Keep process alive.
    // eslint-disable-next-line no-constant-condition
    while (true) await new Promise((r) => setTimeout(r, 60_000));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await scrapingQueue.close().catch(() => undefined);
  });

