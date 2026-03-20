import { Worker } from "bullmq";
import { scrapingQueue, redisConnectionOptions, queueName } from "../jobs/queues";
import { ScraperService } from "../services/ScraperService";
import { NotificationService } from "../services/NotificationService";
import { logInfo, logWarn } from "../utils/logger";
import { shutdownPuppeteer } from "../scraper/puppeteerClient";
import { env } from "../config/env";

const scraperService = new ScraperService();
const notificationService = new NotificationService();

const worker = new Worker(
  queueName,
  async (job) => {
    logInfo(`Job started name=${job.name} id=${job.id}`);

    switch (job.name) {
      case "scrapeFaculties": {
        await scraperService.scrapeFaculties();
        await scrapingQueue.add("scrapePrograms", {}, { attempts: 3, removeOnComplete: true });
        return;
      }
      case "scrapePrograms": {
        await scraperService.scrapePrograms();
        await scrapingQueue.add("scrapeSubjects", {}, { attempts: 3, removeOnComplete: true });
        return;
      }
      case "scrapeSubjects": {
        await scraperService.scrapeSubjects();
        await scrapingQueue.add("scrapePosts", {}, { attempts: 3, removeOnComplete: true });
        return;
      }
      case "scrapePosts": {
        await scraperService.scrapePosts();
        return;
      }
      case "notifySubscribers": {
        const rawPostId = (job.data as { postId?: unknown }).postId;
        if (rawPostId === undefined || rawPostId === null) return;
        const postId = Number(rawPostId);
        if (!Number.isFinite(postId)) return;
        logInfo("Worker processing notifySubscribers", { postId });
        await notificationService.notifySubscribersForPost(postId);
        return;
      }
      default:
        logWarn(`Unknown job name=${String(job.name)}`);
        return;
    }
  },
  {
    connection: redisConnectionOptions as any,
    concurrency: 1, // keep pipeline order stable
  },
);

worker.on("completed", async (job) => {
  logInfo(`Job completed name=${job.name} id=${job.id}`);
});
worker.on("failed", async (job, err) => {
  logWarn(`Job failed name=${job?.name} id=${job?.id}`);
  logWarn(String(err));
});

async function shutdown() {
  logInfo("Shutting down scraper worker");
  await worker.close().catch(() => undefined);
  await shutdownPuppeteer().catch(() => undefined);
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

logInfo(
  `Scraper worker started queue=${queueName} headless=${String(
    env.SCRAPER_PUPPETEER_HEADLESS,
  )}`,
);

