import { Queue } from "bullmq";
import { env } from "../config/env";

export const queueName = "ucg-scraper";

/**
 * BullMQ must receive connection **options** with a `url` field — not a bare URL string.
 * Passing a string gets merged with defaults via Object.assign and loses `url`, so ioredis
 * falls back to 127.0.0.1:6379 (see bullmq RedisConnection constructor + init).
 *
 * Use a single Queue instance for producers. Do not create a second JobScheduler with the
 * same queue name — it duplicates Redis/meta handling and can break repeat + worker.
 */
export const redisConnectionOptions = { url: env.REDIS_URL };

export const scrapingQueue = new Queue(queueName, {
  connection: redisConnectionOptions as any,
});
