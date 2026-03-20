import { JobScheduler, Queue } from "bullmq";
import { env } from "../config/env";

export const queueName = "ucg-scraper";

/**
 * BullMQ must receive connection **options** with a `url` field — not a bare URL string.
 * Passing a string gets merged with defaults via Object.assign and loses `url`, so ioredis
 * falls back to 127.0.0.1:6379 (see bullmq RedisConnection constructor + init).
 */
export const redisConnectionOptions = { url: env.REDIS_URL };

export const scrapingQueue = new Queue(queueName, {
  connection: redisConnectionOptions as any,
});

export const jobScheduler = new JobScheduler(queueName, {
  connection: redisConnectionOptions as any,
});
