import { config as loadDotenv } from "dotenv";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAuthConfiguration, queueForStage } from "@video-translate/contracts";
import { findRepoRoot, readRuntimeConfig } from "@video-translate/contracts/runtime";
import { createPrismaClient } from "@video-translate/database";
import { createObjectStorage, ensurePrivateBucket } from "@video-translate/storage";
import { logger } from "./logger.js";
import { processStage } from "./processor.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(currentDirectory);
loadDotenv({ path: resolve(repoRoot, ".env") });
const config = readRuntimeConfig(process.env, repoRoot);
assertAuthConfiguration({
  nodeEnv: config.nodeEnv,
  authMode: config.authMode,
  allowDevIdentity: config.allowDevIdentity,
});

const prisma = createPrismaClient(config.databaseUrl);
const storage = createObjectStorage(config.s3);
await ensurePrivateBucket(config.s3, config.webOrigin);
const connection = () => new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const queues = {
  media: new Queue("media", { connection: connection() }),
  intelligence: new Queue("intelligence", { connection: connection() }),
  maintenance: new Queue("maintenance", { connection: connection() }),
};

function startWorker(name: "media" | "intelligence" | "maintenance", concurrency: number): Worker {
  return new Worker(
    name,
    async (job) => {
      const data = job.data as { videoId?: string; stage?: string; version?: number };
      if (!data.videoId || !data.stage || !data.version) {
        return;
      }
      await processStage({ prisma, storage, config }, data.videoId, data.stage, data.version);
    },
    { connection: connection(), concurrency },
  );
}

const workers = [startWorker("media", 1), startWorker("intelligence", 2), startWorker("maintenance", 1)];

async function publishOutbox(): Promise<void> {
  const events = await prisma.outboxEvent.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  for (const event of events) {
    const video = await prisma.video.findUnique({ where: { id: event.videoId } });
    if (!video || (video.deletionRequestedAt && event.stage !== "cleanup")) {
      await prisma.outboxEvent.update({ where: { id: event.id }, data: { status: "discarded" } });
      continue;
    }
    const queue = queues[event.queueName as keyof typeof queues] ?? queues.media;
    try {
      await queue.add(
        event.stage,
        { videoId: event.videoId, stage: event.stage, version: event.version },
        {
          jobId: event.id,
          attempts: 1,
          removeOnComplete: 200,
          removeOnFail: 200,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/already|exists/i.test(message)) {
        throw error;
      }
    }
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: "published", publishedAt: new Date() },
    });
    await prisma.processingJob.updateMany({
      where: { videoId: event.videoId, stage: event.stage, version: event.version, status: "pending" },
      data: { status: "queued" },
    });
  }
}

async function reconcileAbandonedJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - config.stageTimeoutMs - 60_000);
  const abandoned = await prisma.processingJob.findMany({
    where: { status: "running", updatedAt: { lt: cutoff } },
    take: 20,
  });
  for (const job of abandoned) {
    if (job.workerPid && pidIsAlive(job.workerPid)) {
      continue;
    }
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "pending", workerPid: null, errorCode: "abandoned", failureClass: "transient" },
    });
    await prisma.outboxEvent.create({
      data: {
        videoId: job.videoId,
        stage: job.stage,
        version: job.version,
        queueName: queueForStage(job.stage),
        status: "pending",
      },
    });
  }
}

async function expireVideos(): Promise<void> {
  const due = await prisma.video.findMany({
    where: {
      expiresAt: { lt: new Date() },
      deletionRequestedAt: null,
      deletedAt: null,
      status: { notIn: ["expired", "deleted", "deleting"] },
    },
    take: 20,
  });
  for (const video of due) {
    await prisma.video.update({
      where: { id: video.id },
      data: { status: "expired", deletionRequestedAt: new Date() },
    });
    await prisma.processingJob.upsert({
      where: { videoId_stage_version: { videoId: video.id, stage: "cleanup", version: video.version } },
      create: { videoId: video.id, stage: "cleanup", version: video.version, status: "pending" },
      update: { status: "pending" },
    });
    await prisma.outboxEvent.create({
      data: {
        videoId: video.id,
        stage: "cleanup",
        version: video.version,
        queueName: "maintenance",
        status: "pending",
      },
    });
  }
}

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const outboxTimer = setInterval(() => {
  void publishOutbox().catch((error: unknown) => logger.error({ error: error instanceof Error ? error.message : "outbox" }, "Falha no outbox"));
}, 2000);
const maintenanceTimer = setInterval(() => {
  void reconcileAbandonedJobs().catch((error: unknown) => logger.error({ error: error instanceof Error ? error.message : "reconcile" }, "Falha na reconciliacao"));
  void expireVideos().catch((error: unknown) => logger.error({ error: error instanceof Error ? error.message : "expire" }, "Falha na expiracao"));
}, 30_000);

logger.info("Worker de processamento iniciado");

async function shutdown(): Promise<void> {
  clearInterval(outboxTimer);
  clearInterval(maintenanceTimer);
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
