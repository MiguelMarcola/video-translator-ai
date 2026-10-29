import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { realpath } from "node:fs/promises";
import {
  canWriteArtifacts,
  classifyStageFailure,
  nextStages,
  queueForStage,
} from "@video-translate/contracts";
import type { RuntimeConfig } from "@video-translate/contracts/runtime";
import type { PrismaClient } from "@video-translate/database";
import { objectKey, type ObjectStorage } from "@video-translate/storage";
import { runCleanup } from "./cleanup.js";
import { runIndex, runSummary } from "./intelligence.js";
import { logger } from "./logger.js";
import { runPythonStage, StageExecutionError } from "./python-process.js";

type StageContext = {
  prisma: PrismaClient;
  storage: ObjectStorage;
  config: RuntimeConfig;
};

export async function processStage(context: StageContext, videoId: string, stage: string, version: number): Promise<void> {
  const video = await context.prisma.video.findUnique({ where: { id: videoId } });
  if (!video) {
    return;
  }
  if (stage !== "cleanup" && !canWriteArtifacts(video)) {
    await context.prisma.processingJob.updateMany({
      where: { videoId, stage, version },
      data: { status: "cancelled", finishedAt: new Date(), errorCode: "cancelled" },
    });
    return;
  }
  const job = await context.prisma.processingJob.findUnique({
    where: { videoId_stage_version: { videoId, stage, version } },
  });
  if (!job) {
    return;
  }
  if (job.status === "succeeded") {
    await enqueueFollowing(context, video.id, stage, version);
    return;
  }
  const attempt = job.attempt + 1;
  await context.prisma.processingJob.update({
    where: { id: job.id },
    data: { status: "running", attempt, startedAt: new Date() },
  });
  await context.prisma.video.update({
    where: { id: video.id },
    data: { status: stage === "cleanup" ? video.status : "processing", currentStage: stage },
  });
  try {
    if (stage === "cleanup") {
      await runCleanup(context.prisma, context.storage, context.config, video.id);
    } else if (stage === "summarize") {
      await runSummary(context.prisma, context.config, video.id, version);
    } else if (stage === "index") {
      await runIndex(context.prisma, context.config, video.id, version);
    } else {
      await runMediaStage(context, video, stage, version);
      if (stage === "write_subtitles") {
        await context.prisma.video.update({
          where: { id: video.id },
          data: { playbackReady: true, subtitlesReady: true, status: "partial" },
        });
      }
    }
    await assertStillWritable(context, video.id, stage);
    await context.prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "succeeded", finishedAt: new Date(), workerPid: null, errorCode: null, errorMessage: null },
    });
    await enqueueFollowing(context, video.id, stage, version);
    await refreshVideoStatus(context, video.id);
    await context.prisma.usageEvent.create({
      data: { userId: video.ownerId, videoId: video.id, eventType: "stage.finished", metadata: { stage, attempt } },
    });
  } catch (error) {
    if (error instanceof DeletionGuardError || (stage !== "cleanup" && !(await stillWritable(context, video.id)))) {
      await context.prisma.processingJob.update({
        where: { id: job.id },
        data: { status: "cancelled", finishedAt: new Date(), workerPid: null, errorCode: "cancelled" },
      });
      return;
    }
    const stageError = error instanceof StageExecutionError
      ? error
      : new StageExecutionError(error instanceof Error ? error.message : "Falha na etapa", "stage_failed", 10, "transient");
    const decision = classifyStageFailure({
      exitCode: stageError.exitCode,
      attempt,
      maxAttempts: job.maxAttempts,
      failureClass: stageError.failureClass,
    });
    await context.prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: decision === "retry" ? "pending" : "failed",
        finishedAt: new Date(),
        workerPid: null,
        errorCode: stageError.code,
        errorMessage: stageError.message,
        failureClass: stageError.failureClass,
      },
    });
    logger.error({ videoId, stage, code: stageError.code, decision }, "Etapa falhou");
    if (decision === "retry") {
      await context.prisma.outboxEvent.create({
        data: { videoId, stage, version, queueName: queueForStage(stage), status: "pending" },
      });
      return;
    }
    await markStageFailure(context, video.id, stage, stageError);
  }
}

async function runMediaStage(
  context: StageContext,
  video: {
    id: string;
    version: number;
    sourceKind: string;
    sourceUrl: string | null;
    internalSourcePath: string | null;
    targetLanguage: string;
    detectedLanguage: string | null;
    ownerId: string;
  },
  stage: string,
  version: number,
): Promise<void> {
  if (await outputsExist(context, video.id, version, stage)) {
    return;
  }
  const workDirectory = join(context.config.workRoot, video.id);
  await mkdir(workDirectory, { recursive: true });
  if (stage === "ingest" && video.sourceKind === "local_file") {
    if (!video.internalSourcePath) {
      throw new StageExecutionError("Arquivo local ausente", "source_unavailable", 3, "permanent");
    }
    const sourcePath = await assertInsideRoot(context.config.localMediaRoot, video.internalSourcePath);
    await copyFile(sourcePath, join(workDirectory, "input.mp4"));
  }
  if (stage === "prepare") {
    await ensureArtifactFile(context, video.id, version, "source_media", join(workDirectory, "source.mp4"));
  }
  if (stage === "transcribe") {
    await ensureArtifactFile(context, video.id, version, "audio_wav", join(workDirectory, "audio.wav"));
  }
  if (stage === "translate" || stage === "write_subtitles" || stage === "render") {
    await materializeSegments(context, video, workDirectory);
  }
  if (stage === "render") {
    await ensureArtifactFile(context, video.id, version, "playback_mp4", join(workDirectory, "playback.mp4"));
    await ensureArtifactFile(context, video.id, version, "subtitles_ass", join(workDirectory, "subtitles.ass"));
  }
  const requestPath = join(workDirectory, "request.json");
  const resultPath = join(workDirectory, "result.json");
  const request = {
    contractVersion: "1.0.0",
    command: commandForStage(stage),
    jobId: `${video.id}:${stage}:${version}`,
    videoId: video.id,
    workDirectory,
    cacheDirectory: context.config.cacheRoot,
    targetLanguage: video.targetLanguage,
    sourceLanguage: video.detectedLanguage,
    inputs: inputsForStage(stage, workDirectory, video),
    parameters: {
      whisperModel: context.config.whisperModel,
      whisperBeamSize: context.config.whisperBeamSize,
      maxDurationSeconds: context.config.maxDurationSeconds,
      fontFile: context.config.fontFile,
      fontFamily: context.config.fontFamily,
      timeoutSeconds: Math.floor(context.config.stageTimeoutMs / 1000),
    },
  };
  const result = await runPythonStage({
    pythonBin: context.config.pythonBin,
    pythonModulePath: join(context.config.repoRoot, "workers/media-python"),
    request,
    requestPath,
    resultPath,
    workDirectory,
    timeoutMs: context.config.stageTimeoutMs,
    shouldCancel: async () => !(await stillWritable(context, video.id)),
    onPid: async (pid) => {
      await context.prisma.processingJob.updateMany({
        where: { videoId: video.id, stage, version },
        data: { workerPid: pid },
      });
    },
    writeRequest: async () => {
      await writeFile(requestPath, JSON.stringify(request));
    },
  });
  await assertStillWritable(context, video.id, stage);
  for (const artifact of result.artifacts ?? []) {
    await storeArtifact(context, video.id, version, workDirectory, artifact);
  }
  if (stage === "ingest") {
    const metadata = result.metadata ?? {};
    await context.prisma.video.update({
      where: { id: video.id },
      data: {
        title: video.sourceKind === "local_file" ? undefined : typeof metadata.title === "string" ? metadata.title : undefined,
        durationMs: typeof metadata.durationMs === "number" ? metadata.durationMs : undefined,
        sourceVideoId: typeof metadata.sourceVideoId === "string" ? metadata.sourceVideoId : undefined,
      },
    });
  }
  if (stage === "prepare" && typeof result.metadata?.durationMs === "number") {
    await context.prisma.video.update({
      where: { id: video.id },
      data: { durationMs: result.metadata.durationMs },
    });
  }
  if (stage === "transcribe" && result.segments) {
    await context.prisma.$transaction(async (transaction) => {
      const current = await transaction.video.findUnique({ where: { id: video.id } });
      if (!current || !canWriteArtifacts(current)) {
        throw new DeletionGuardError();
      }
      await transaction.transcriptSegment.deleteMany({ where: { videoId: video.id, version } });
      await transaction.transcriptSegment.createMany({
        data: result.segments!.map((segment, position) => ({
          publicId: segment.id,
          videoId: video.id,
          version,
          position,
          startMs: segment.startMs,
          endMs: segment.endMs,
          originalText: segment.text,
          sourceLanguage: typeof result.metadata?.detectedLanguage === "string" ? result.metadata.detectedLanguage : null,
          targetLanguage: video.targetLanguage,
        })),
      });
      await transaction.video.update({
        where: { id: video.id },
        data: {
          detectedLanguage: typeof result.metadata?.detectedLanguage === "string" ? result.metadata.detectedLanguage : null,
        },
      });
    });
  }
  if (stage === "translate" && result.segments) {
    await context.prisma.$transaction(async (transaction) => {
      const current = await transaction.video.findUnique({ where: { id: video.id } });
      if (!current || !canWriteArtifacts(current)) {
        throw new DeletionGuardError();
      }
      for (const segment of result.segments ?? []) {
        await transaction.transcriptSegment.updateMany({
          where: { videoId: video.id, version, publicId: segment.id },
          data: { translatedText: segment.translatedText ?? "" },
        });
      }
    });
  }
}

async function outputsExist(context: StageContext, videoId: string, version: number, stage: string): Promise<boolean> {
  const has = async (kind: string) =>
    Boolean(
      await context.prisma.artifact.findUnique({
        where: { videoId_kind_version: { videoId, kind, version } },
      }),
    );
  if (stage === "ingest") {
    return has("source_media");
  }
  if (stage === "prepare") {
    return (await has("playback_mp4")) && (await has("audio_wav"));
  }
  if (stage === "transcribe") {
    const count = await context.prisma.transcriptSegment.count({ where: { videoId, version } });
    return count > 0;
  }
  if (stage === "translate") {
    const missing = await context.prisma.transcriptSegment.count({
      where: { videoId, version, translatedText: null },
    });
    const total = await context.prisma.transcriptSegment.count({ where: { videoId, version } });
    return total > 0 && missing === 0;
  }
  if (stage === "write_subtitles") {
    return has("subtitles_vtt");
  }
  if (stage === "render") {
    return has("burned_mp4");
  }
  return false;
}

async function storeArtifact(
  context: StageContext,
  videoId: string,
  version: number,
  workDirectory: string,
  artifact: { kind: string; path: string; contentType: string; byteSize: number },
): Promise<void> {
  const resolvedWork = resolve(workDirectory);
  const resolvedPath = resolve(artifact.path);
  const relativePath = relative(resolvedWork, resolvedPath);
  if (relativePath.startsWith("..")) {
    throw new StageExecutionError("Artefato fora do diretorio de trabalho", "invalid_artifact_path", 2, "permanent");
  }
  const body = await readFile(resolvedPath);
  const key = objectKey(videoId, version, artifact.kind, basename(resolvedPath));
  await context.storage.putObject({ key, body, contentType: artifact.contentType });
  await context.prisma.artifact.upsert({
    where: { videoId_kind_version: { videoId, kind: artifact.kind, version } },
    create: { videoId, kind: artifact.kind, version, objectKey: key, contentType: artifact.contentType, byteSize: body.length },
    update: { objectKey: key, contentType: artifact.contentType, byteSize: body.length },
  });
}

async function ensureArtifactFile(
  context: StageContext,
  videoId: string,
  version: number,
  kind: string,
  destination: string,
): Promise<void> {
  if (existsSync(destination)) {
    return;
  }
  const artifact = await context.prisma.artifact.findUnique({
    where: { videoId_kind_version: { videoId, kind, version } },
  });
  if (!artifact) {
    throw new StageExecutionError("Arquivo da etapa anterior ausente", "artifact_missing", 10, "transient");
  }
  const body = await context.storage.getObject(artifact.objectKey);
  await writeFile(destination, body);
}

async function materializeSegments(
  context: StageContext,
  video: { id: string; version: number; detectedLanguage: string | null },
  workDirectory: string,
): Promise<void> {
  const segmentsPath = join(workDirectory, "segments.json");
  if (existsSync(segmentsPath)) {
    return;
  }
  const segments = await context.prisma.transcriptSegment.findMany({
    where: { videoId: video.id, version: video.version },
    orderBy: { position: "asc" },
  });
  await writeFile(
    segmentsPath,
    JSON.stringify({
      detectedLanguage: video.detectedLanguage,
      segments: segments.map((segment) => ({
        id: segment.publicId,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.originalText,
        translatedText: segment.translatedText ?? undefined,
      })),
    }),
  );
}

async function enqueueFollowing(context: StageContext, videoId: string, stage: string, version: number): Promise<void> {
  for (const nextStage of nextStages(stage)) {
    const existing = await context.prisma.processingJob.findUnique({
      where: { videoId_stage_version: { videoId, stage: nextStage, version } },
    });
    if (existing && existing.status !== "failed" && existing.status !== "cancelled") {
      continue;
    }
    await context.prisma.processingJob.upsert({
      where: { videoId_stage_version: { videoId, stage: nextStage, version } },
      create: { videoId, stage: nextStage, version, status: "pending" },
      update: { status: "pending", errorCode: null, errorMessage: null, finishedAt: null },
    });
    await context.prisma.outboxEvent.create({
      data: { videoId, stage: nextStage, version, queueName: queueForStage(nextStage), status: "pending" },
    });
  }
}

async function refreshVideoStatus(context: StageContext, videoId: string): Promise<void> {
  const video = await context.prisma.video.findUnique({ where: { id: videoId } });
  if (!video || !canWriteArtifacts(video) || !video.playbackReady) {
    return;
  }
  const summaryDone = ["ready", "failed", "unavailable"].includes(video.summaryStatus);
  const chatDone = ["ready", "failed", "unavailable"].includes(video.chatStatus);
  await context.prisma.video.update({
    where: { id: video.id },
    data: {
      status: summaryDone && chatDone ? "ready" : "partial",
      currentStage: summaryDone && chatDone ? null : video.currentStage,
    },
  });
}

async function markStageFailure(context: StageContext, videoId: string, stage: string, error: StageExecutionError): Promise<void> {
  if (stage === "summarize") {
    await context.prisma.video.update({
      where: { id: videoId },
      data: { summaryStatus: "failed", status: "partial" },
    });
    await refreshVideoStatus(context, videoId);
    return;
  }
  if (stage === "index") {
    await context.prisma.video.update({
      where: { id: videoId },
      data: { chatStatus: "failed", status: "partial" },
    });
    await refreshVideoStatus(context, videoId);
    return;
  }
  if (stage === "render" || stage === "cleanup") {
    return;
  }
  await context.prisma.video.update({
    where: { id: videoId },
    data: { status: "failed", failureCode: error.code, failureMessage: error.message, currentStage: stage },
  });
}

async function stillWritable(context: StageContext, videoId: string): Promise<boolean> {
  const video = await context.prisma.video.findUnique({ where: { id: videoId } });
  return Boolean(video && canWriteArtifacts(video));
}

async function assertStillWritable(context: StageContext, videoId: string, stage: string): Promise<void> {
  if (stage === "cleanup") {
    return;
  }
  if (!(await stillWritable(context, videoId))) {
    throw new DeletionGuardError();
  }
}

class DeletionGuardError extends Error {
  constructor() {
    super("Video excluido durante o processamento");
    this.name = "DeletionGuardError";
  }
}

function commandForStage(stage: string): string {
  const commands: Record<string, string> = {
    ingest: "acquire",
    prepare: "prepare",
    transcribe: "transcribe",
    translate: "translate",
    write_subtitles: "write_subtitles",
    render: "render",
  };
  const command = commands[stage];
  if (!command) {
    throw new StageExecutionError("Etapa sem comando", "invalid_stage", 2, "permanent");
  }
  return command;
}

function inputsForStage(
  stage: string,
  workDirectory: string,
  video: { sourceKind: string; sourceUrl: string | null },
): { mediaPath: string | null; youtubeUrl: string | null; segmentsPath: string | null; subtitlesAssPath: string | null } {
  if (stage === "ingest") {
    return {
      mediaPath: video.sourceKind === "local_file" ? join(workDirectory, "input.mp4") : null,
      youtubeUrl: video.sourceKind === "youtube" ? video.sourceUrl : null,
      segmentsPath: null,
      subtitlesAssPath: null,
    };
  }
  if (stage === "prepare") {
    return { mediaPath: join(workDirectory, "source.mp4"), youtubeUrl: null, segmentsPath: null, subtitlesAssPath: null };
  }
  if (stage === "transcribe") {
    return { mediaPath: join(workDirectory, "audio.wav"), youtubeUrl: null, segmentsPath: null, subtitlesAssPath: null };
  }
  if (stage === "translate" || stage === "write_subtitles") {
    return { mediaPath: null, youtubeUrl: null, segmentsPath: join(workDirectory, "segments.json"), subtitlesAssPath: null };
  }
  return {
    mediaPath: join(workDirectory, "playback.mp4"),
    youtubeUrl: null,
    segmentsPath: null,
    subtitlesAssPath: join(workDirectory, "subtitles.ass"),
  };
}

async function assertInsideRoot(root: string, candidate: string): Promise<string> {
  const resolvedRoot = await realpath(root);
  const resolvedCandidate = await realpath(candidate);
  const relativePath = relative(resolvedRoot, resolvedCandidate);
  if (relativePath.startsWith("..") || resolve(relativePath) === relativePath) {
    throw new StageExecutionError("Arquivo local fora da raiz autorizada", "invalid_request", 2, "permanent");
  }
  return resolvedCandidate;
}
