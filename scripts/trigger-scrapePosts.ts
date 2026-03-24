/**
 * Enqueue a single `scrapePosts` job (optionally delayed) to test worker consumption.
 *
 * Usage:
 *   npx tsx scripts/trigger-scrapePosts.ts
 * or
 *   DELAY_MS=5000 npx tsx scripts/trigger-scrapePosts.ts
 */
import "dotenv/config";
import { scrapingQueue, queueName } from "../src/jobs/queues";

const delayMs = Number(process.env.DELAY_MS ?? 0);

async function main() {
  await scrapingQueue.waitUntilReady();
  const job = await scrapingQueue.add(
    "scrapePosts",
    {},
    {
      delay: delayMs,
      attempts: 3,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  console.log(
    `Enqueued scrapePosts for queue=${queueName} jobId=${job.id} delayMs=${delayMs}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

