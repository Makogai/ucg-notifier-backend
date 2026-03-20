import { scrapingQueue, jobScheduler, queueName } from "./queues";
import { env } from "../config/env";
import { logInfo } from "../utils/logger";

async function main() {
  await jobScheduler.waitUntilReady();

  const intervalMs = env.SCRAPER_SCHEDULE_EVERY_MINUTES * 60_000;
  const repeatJobId = "scrapeFaculties:repeat";

  await scrapingQueue.add(
    "scrapeFaculties",
    {},
    {
      jobId: repeatJobId,
      repeat: { every: intervalMs },
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  logInfo(`Scheduler started for queue=${queueName} every=${env.SCRAPER_SCHEDULE_EVERY_MINUTES}m`);
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
    await jobScheduler.close().catch(() => undefined);
  });

