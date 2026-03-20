import { JobScheduler, Queue, RedisConnection } from "bullmq";
import { env } from "../config/env";

export const queueName = "ucg-scraper";

// BullMQ's TS types are strict about connection shape; at runtime `RedisConnection` works.
// We cast here only at the type boundary.
export const redisConnection: any = new RedisConnection(env.REDIS_URL as any);

export const scrapingQueue = new Queue(queueName, {
  connection: redisConnection as any,
});

// Manages repeat/delayed jobs for the queue.
export const jobScheduler = new JobScheduler(queueName, {
  connection: redisConnection as any,
});

