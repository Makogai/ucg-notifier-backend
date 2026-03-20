import { scrapingQueue, jobScheduler, redisConnection, queueName } from "./queues";
import { env } from "../config/env";
import { logInfo } from "../utils/logger";

async function main() {
  await jobScheduler.waitUntilReady();

  const intervalMs = env.SCRAPER_SCHEDULE_EVERY_MINUTES * 60_000;
  const repeatJobId = "scrapePosts:repeat";

  await scrapingQueue.add(
    "scrapePosts",
    {},
    {
      jobId: repeatJobId,
      repeat: { every: intervalMs },
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  logInfo(
    `Posts-only scheduler started queue=${queueName} every=${env.SCRAPER_SCHEDULE_EVERY_MINUTES}m`,
  );
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
    await (redisConnection as any).disconnect?.().catch(() => undefined);
  });

