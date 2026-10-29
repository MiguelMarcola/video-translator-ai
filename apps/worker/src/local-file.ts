import { config as loadDotenv } from "dotenv";
import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { queueForStage } from "@video-translate/contracts";
import { findRepoRoot, readRuntimeConfig } from "@video-translate/contracts/runtime";
import { createPrismaClient } from "@video-translate/database";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(currentDirectory);
loadDotenv({ path: resolve(repoRoot, ".env") });
const config = readRuntimeConfig(process.env, repoRoot);
const fileFlag = process.argv.indexOf("--file");
const userFlag = process.argv.indexOf("--user");
const filePath = fileFlag >= 0 ? process.argv[fileFlag + 1] : undefined;
const externalUserId = userFlag >= 0 ? process.argv[userFlag + 1] : "local-dev";
if (!filePath) {
  throw new Error("Informe --file com um video dentro de LOCAL_MEDIA_ROOT");
}

const resolvedRoot = await realpath(config.localMediaRoot);
const resolvedFile = await realpath(filePath);
const relativePath = relative(resolvedRoot, resolvedFile);
if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
  throw new Error("O arquivo local esta fora da raiz autorizada");
}

const prisma = createPrismaClient(config.databaseUrl);
const user = await prisma.user.upsert({
  where: { externalId: externalUserId },
  update: {},
  create: { externalId: externalUserId, displayName: externalUserId },
});
const expiresAt = new Date(Date.now() + config.retentionDays * 24 * 60 * 60 * 1000);
const video = await prisma.video.create({
  data: {
    ownerId: user.id,
    sourceKind: "local_file",
    internalSourcePath: resolvedFile,
    title: resolvedFile.split("/").at(-1) ?? "video local",
    targetLanguage: "pt-BR",
    status: "queued",
    currentStage: "ingest",
    expiresAt,
  },
});
await prisma.processingJob.create({
  data: { videoId: video.id, stage: "ingest", version: 1, status: "pending" },
});
await prisma.outboxEvent.create({
  data: { videoId: video.id, stage: "ingest", version: 1, queueName: queueForStage("ingest"), status: "pending" },
});
console.log(video.id);
await prisma.$disconnect();
