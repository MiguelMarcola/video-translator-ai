import { Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertOwner,
  createVideoBodySchema,
  nextStages,
  normalizeYouTubeUrl,
  queueForStage,
  retryBodySchema,
  stageLabels,
  usageEventBodySchema,
} from "@video-translate/contracts";
import { requestFingerprint } from "@video-translate/contracts/idempotency";
import { ApiError } from "./api-error.js";
import { createSignedMediaUrl } from "./media-signature.js";
import { PrismaService } from "./prisma.service.js";
import { runtimeConfig } from "./runtime.js";
import { StorageService } from "./storage.service.js";

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(userId: string, body: unknown, idempotencyKey: string | undefined) {
    const parsed = createVideoBodySchema.parse(body);
    const normalized = normalizeYouTubeUrl(parsed.youtubeUrl);
    if (!normalized.ok) {
      throw new ApiError(400, normalized.code, normalized.message);
    }
    const fingerprint = requestFingerprint({
      youtubeUrl: normalized.canonicalUrl,
      targetLanguage: parsed.targetLanguage,
    });
    if (idempotencyKey) {
      const existing = await this.prisma.video.findFirst({
        where: { ownerId: userId, idempotencyKey },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new ApiError(409, "idempotency_conflict", "A chave de idempotencia ja foi usada com outros dados.");
        }
        return this.present(existing);
      }
    }
    const activeCount = await this.prisma.video.count({
      where: {
        ownerId: userId,
        deletionRequestedAt: null,
        status: { in: ["queued", "processing", "partial"] },
      },
    });
    if (activeCount >= runtimeConfig.maxActiveVideosPerUser) {
      throw new ApiError(
        429,
        "active_job_limit",
        "Ja existe um processamento ativo. Aguarde a conclusao ou exclua a tarefa.",
      );
    }
    const expiresAt = new Date(Date.now() + runtimeConfig.retentionDays * 24 * 60 * 60 * 1000);
    try {
      const video = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.video.create({
          data: {
            ownerId: userId,
            sourceKind: "youtube",
            sourceUrl: normalized.canonicalUrl,
            sourceVideoId: normalized.videoId,
            targetLanguage: parsed.targetLanguage,
            status: "queued",
            currentStage: "ingest",
            expiresAt,
            idempotencyKey,
            requestFingerprint: fingerprint,
          },
        });
        await transaction.processingJob.create({
          data: { videoId: created.id, stage: "ingest", version: 1, status: "pending" },
        });
        await transaction.outboxEvent.create({
          data: {
            videoId: created.id,
            stage: "ingest",
            version: 1,
            queueName: queueForStage("ingest"),
            status: "pending",
          },
        });
        await transaction.usageEvent.create({
          data: { userId, videoId: created.id, eventType: "video.created", metadata: {} },
        });
        return created;
      });
      return this.present(video);
    } catch (error) {
      if (!isUniqueConflict(error) || !idempotencyKey) {
        throw error;
      }
      const existing = await this.prisma.video.findFirst({ where: { ownerId: userId, idempotencyKey } });
      if (!existing) {
        throw error;
      }
      return this.present(existing);
    }
  }

  async list(userId: string, query: { limit?: string; offset?: string }) {
    const limit = boundedInteger(query.limit, 20, 1, 50);
    const offset = boundedInteger(query.offset, 0, 0, 10_000);
    const videosStillInHistory = { ownerId: userId, status: { notIn: ["deleted", "deleting"] } };
    const [videos, total] = await Promise.all([
      this.prisma.video.findMany({
        where: videosStillInHistory,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.video.count({ where: videosStillInHistory }),
    ]);
    return { items: videos.map((video) => this.present(video)), total, limit, offset };
  }

  async detail(userId: string, videoId: string) {
    const video = await this.ownedVideo(userId, videoId);
    return {
      ...this.present(video),
      downloads: await this.exportDownload(video.id, video.version, video.subtitlesReady),
      limitation:
        "O resumo e o chat analisam a fala transcrita. Texto que aparece apenas em slides ou imagens nao entra na analise.",
    };
  }

  async status(userId: string, videoId: string) {
    const video = await this.ownedVideo(userId, videoId);
    const jobs = await this.prisma.processingJob.findMany({
      where: { videoId: video.id },
      orderBy: { createdAt: "asc" },
    });
    return {
      videoId: video.id,
      status: video.status,
      currentStage: video.currentStage,
      currentStageLabel: video.currentStage ? (stageLabels[video.currentStage] ?? video.currentStage) : null,
      stages: jobs.map((job) => ({
        stage: job.stage,
        label: stageLabels[job.stage] ?? job.stage,
        status: job.status,
        attempt: job.attempt,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
      })),
      summaryStatus: video.summaryStatus,
      chatStatus: video.chatStatus,
      playbackReady: video.playbackReady,
      subtitlesReady: video.subtitlesReady,
      failureCode: video.failureCode,
      failureMessage: video.failureMessage,
    };
  }

  async playback(userId: string, videoId: string) {
    const video = await this.availableVideo(userId, videoId);
    if (!video.playbackReady) {
      throw new ApiError(409, "playback_not_ready", "O video ainda esta sendo preparado.");
    }
    await this.artifact(video.id, video.version, "playback_mp4");
    if (video.subtitlesReady) {
      await this.artifact(video.id, video.version, "subtitles_vtt");
    }
    const expiresAt = new Date(Date.now() + runtimeConfig.presignTtlSeconds * 1000).toISOString();
    return {
      videoUrl: this.mediaUrl(userId, video.id, "playback_mp4"),
      videoContentType: "video/mp4",
      subtitles: video.subtitlesReady
        ? [
            {
              language: video.targetLanguage,
              label: "Português (Brasil)",
              url: this.mediaUrl(userId, video.id, "subtitles_vtt"),
              contentType: "text/vtt",
            },
          ]
        : [],
      expiresAt,
    };
  }

  async subtitle(userId: string, videoId: string, format: string) {
    const video = await this.availableVideo(userId, videoId);
    if (!video.subtitlesReady) {
      throw new ApiError(409, "subtitles_not_ready", "As legendas ainda nao estao prontas.");
    }
    const kind = format === "srt" ? "subtitles_srt" : format === "vtt" ? "subtitles_vtt" : null;
    if (!kind) {
      throw new ApiError(400, "invalid_subtitle_format", "Use srt ou vtt.");
    }
    await this.artifact(video.id, video.version, kind);
    return {
      url: this.mediaUrl(userId, video.id, kind),
      expiresAt: new Date(Date.now() + runtimeConfig.presignTtlSeconds * 1000).toISOString(),
    };
  }

  async summary(userId: string, videoId: string) {
    const video = await this.ownedVideo(userId, videoId);
    if (video.summaryStatus === "pending") {
      throw new ApiError(409, "summary_not_ready", "O resumo ainda esta sendo preparado.");
    }
    if (video.summaryStatus === "unavailable") {
      throw new ApiError(503, "summary_unavailable", "O resumo esta indisponivel porque o modelo nao foi configurado.");
    }
    if (video.summaryStatus === "failed") {
      throw new ApiError(502, "summary_failed", video.failureMessage ?? "Nao foi possivel gerar o resumo.");
    }
    const summary = await this.prisma.summary.findUnique({
      where: { videoId_version: { videoId: video.id, version: video.version } },
    });
    if (!summary) {
      throw new ApiError(409, "summary_not_ready", "O resumo ainda esta sendo preparado.");
    }
    await this.prisma.usageEvent.create({
      data: { userId, videoId: video.id, eventType: "summary.opened", metadata: {} },
    });
    return {
      language: summary.language,
      overview: summary.overview,
      topics: summary.topics,
      conclusions: summary.conclusions,
      model: summary.model,
    };
  }

  async requestExport(userId: string, videoId: string) {
    const video = await this.availableVideo(userId, videoId);
    if (!video.subtitlesReady || !video.playbackReady) {
      throw new ApiError(409, "export_not_ready", "A exportacao precisa do video e das legendas.");
    }
    const existing = await this.prisma.artifact.findUnique({
      where: { videoId_kind_version: { videoId: video.id, kind: "burned_mp4", version: video.version } },
    });
    if (existing) {
      return {
        exportId: existing.id,
        status: "ready",
        url: this.mediaUrl(userId, video.id, "burned_mp4"),
      };
    }
    const currentJob = await this.prisma.processingJob.findUnique({
      where: { videoId_stage_version: { videoId: video.id, stage: "render", version: video.version } },
    });
    if (currentJob && (currentJob.status === "pending" || currentJob.status === "queued" || currentJob.status === "running")) {
      return { exportId: currentJob.id, status: currentJob.status };
    }
    await this.enqueueStage(video.id, "render", video.version);
    const job = await this.prisma.processingJob.findUnique({
      where: { videoId_stage_version: { videoId: video.id, stage: "render", version: video.version } },
    });
    return { exportId: job?.id ?? video.id, status: job?.status ?? "pending" };
  }

  async exportStatus(userId: string, videoId: string, exportId: string) {
    const video = await this.availableVideo(userId, videoId);
    const artifact = await this.prisma.artifact.findFirst({
      where: { id: exportId, videoId: video.id, kind: "burned_mp4" },
    });
    if (artifact) {
      return {
        exportId: artifact.id,
        status: "ready",
        url: this.mediaUrl(userId, video.id, "burned_mp4"),
        expiresAt: new Date(Date.now() + runtimeConfig.presignTtlSeconds * 1000).toISOString(),
      };
    }
    const job = await this.prisma.processingJob.findFirst({
      where: { id: exportId, videoId: video.id, stage: "render" },
    });
    if (job?.status === "succeeded") {
      const burned = await this.prisma.artifact.findUnique({
        where: { videoId_kind_version: { videoId: video.id, kind: "burned_mp4", version: video.version } },
      });
      if (burned) {
        return {
          exportId,
          status: "ready",
          url: this.mediaUrl(userId, video.id, "burned_mp4"),
          expiresAt: new Date(Date.now() + runtimeConfig.presignTtlSeconds * 1000).toISOString(),
        };
      }
    }
    if (!job) {
      throw new ApiError(404, "export_not_found", "Exportacao nao encontrada.");
    }
    return {
      exportId: job.id,
      status: job.status,
      startedAt: job.startedAt?.toISOString() ?? null,
      errorMessage: job.errorMessage,
    };
  }

  async retry(userId: string, videoId: string, body: unknown) {
    const video = await this.ownedVideo(userId, videoId);
    const parsed = retryBodySchema.parse(body);
    if (video.deletionRequestedAt) {
      throw new ApiError(409, "deletion_in_progress", "O video esta sendo excluido.");
    }
    const job = await this.prisma.processingJob.findUnique({
      where: { videoId_stage_version: { videoId: video.id, stage: parsed.stage, version: video.version } },
    });
    if (!job || job.status !== "failed") {
      throw new ApiError(409, "retry_not_allowed", "Somente uma etapa que falhou pode ser repetida.");
    }
    await this.prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "pending", errorCode: null, errorMessage: null, failureClass: null, finishedAt: null },
    });
    if (parsed.stage === "summarize") {
      await this.prisma.video.update({ where: { id: video.id }, data: { summaryStatus: "pending", status: "partial" } });
    }
    if (parsed.stage === "index") {
      await this.prisma.video.update({ where: { id: video.id }, data: { chatStatus: "pending", status: "partial" } });
    }
    await this.prisma.outboxEvent.create({
      data: {
        videoId: video.id,
        stage: parsed.stage,
        version: video.version,
        queueName: queueForStage(parsed.stage),
        status: "pending",
      },
    });
    return { videoId: video.id, stage: parsed.stage, status: "pending" };
  }

  async remove(userId: string, videoId: string) {
    const video = await this.ownedVideo(userId, videoId);
    await this.prisma.video.update({
      where: { id: video.id },
      data: { deletionRequestedAt: new Date(), status: "deleting" },
    });
    const workDirectory = join(runtimeConfig.workRoot, video.id);
    await mkdir(workDirectory, { recursive: true });
    await writeFile(join(workDirectory, "cancel"), "1");
    const runningJobs = await this.prisma.processingJob.findMany({
      where: { videoId: video.id, status: "running", workerPid: { not: null } },
    });
    for (const job of runningJobs) {
      if (!job.workerPid) {
        continue;
      }
      try {
        process.kill(-job.workerPid, "SIGTERM");
      } catch {
        try {
          process.kill(job.workerPid, "SIGTERM");
        } catch {
          // O processo ja encerrou.
        }
      }
    }
    await this.enqueueStage(video.id, "cleanup", video.version);
    return { videoId: video.id, status: "deleting" };
  }

  async recordEvent(userId: string, videoId: string, body: unknown) {
    const video = await this.ownedVideo(userId, videoId);
    const parsed = usageEventBodySchema.parse(body);
    await this.prisma.usageEvent.create({
      data: { userId, videoId: video.id, eventType: parsed.eventType, metadata: {} },
    });
    return { recorded: true };
  }

  private async enqueueStage(videoId: string, stage: string, version: number) {
    await this.prisma.processingJob.upsert({
      where: { videoId_stage_version: { videoId, stage, version } },
      create: { videoId, stage, version, status: "pending" },
      update: { status: "pending", finishedAt: null, errorCode: null, errorMessage: null },
    });
    await this.prisma.outboxEvent.create({
      data: { videoId, stage, version, queueName: queueForStage(stage), status: "pending" },
    });
  }

  private async ownedVideo(userId: string, videoId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status === "deleted" || video.deletedAt) {
      throw new ApiError(404, "not_found", "Video nao encontrado.");
    }
    assertOwner(video.ownerId, userId);
    return video;
  }

  private async availableVideo(userId: string, videoId: string) {
    const video = await this.ownedVideo(userId, videoId);
    if (video.status === "expired") {
      throw new ApiError(410, "expired", "Os arquivos expiraram. E necessario um novo processamento.");
    }
    if (video.deletionRequestedAt) {
      throw new ApiError(409, "deletion_in_progress", "O video esta sendo excluido.");
    }
    return video;
  }

  private async artifact(videoId: string, version: number, kind: string) {
    const artifact = await this.prisma.artifact.findUnique({
      where: { videoId_kind_version: { videoId, kind, version } },
    });
    if (!artifact) {
      throw new ApiError(409, "artifact_missing", "O arquivo solicitado ainda nao esta disponivel.");
    }
    return artifact;
  }

  private async exportDownload(videoId: string, version: number, subtitlesReady: boolean) {
    const artifact = await this.prisma.artifact.findUnique({
      where: { videoId_kind_version: { videoId, kind: "burned_mp4", version } },
    });
    if (artifact) {
      return { srt: subtitlesReady, vtt: subtitlesReady, burnedMp4: "ready", exportId: artifact.id };
    }
    const job = await this.prisma.processingJob.findUnique({
      where: { videoId_stage_version: { videoId, stage: "render", version } },
    });
    return {
      srt: subtitlesReady,
      vtt: subtitlesReady,
      burnedMp4: job?.status ?? "idle",
      exportId: job?.id ?? null,
    };
  }

  private present(video: {
    id: string;
    title: string | null;
    sourceUrl: string | null;
    sourceVideoId: string | null;
    targetLanguage: string;
    detectedLanguage: string | null;
    status: string;
    currentStage: string | null;
    durationMs: number | null;
    expiresAt: Date;
    playbackReady: boolean;
    subtitlesReady: boolean;
    summaryStatus: string;
    chatStatus: string;
    failureCode: string | null;
    failureMessage: string | null;
    createdAt: Date;
  }) {
    return {
      id: video.id,
      title: video.title,
      sourceUrl: video.sourceUrl,
      sourceVideoId: video.sourceVideoId,
      targetLanguage: video.targetLanguage,
      detectedLanguage: video.detectedLanguage,
      status: video.status,
      currentStage: video.currentStage,
      currentStageLabel: video.currentStage ? (stageLabels[video.currentStage] ?? video.currentStage) : null,
      durationMs: video.durationMs,
      expiresAt: video.expiresAt,
      playbackReady: video.playbackReady,
      subtitlesReady: video.subtitlesReady,
      summaryStatus: video.summaryStatus,
      chatStatus: video.chatStatus,
      failureCode: video.failureCode,
      failureMessage: video.failureMessage,
      createdAt: video.createdAt,
      retentionDays: runtimeConfig.retentionDays,
      maxDurationSeconds: runtimeConfig.maxDurationSeconds,
      nextStages: video.currentStage ? nextStages(video.currentStage) : [],
    };
  }

  private mediaUrl(userId: string, videoId: string, kind: string): string {
    return createSignedMediaUrl({
      apiPublicUrl: runtimeConfig.apiPublicUrl,
      secret: runtimeConfig.mediaSigningSecret,
      userId,
      videoId,
      kind,
      expiresAtMs: Date.now() + runtimeConfig.presignTtlSeconds * 1000,
    });
  }
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
