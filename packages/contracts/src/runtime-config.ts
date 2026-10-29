import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type RuntimeConfig = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  webOrigin: string;
  repoRoot: string;
  pythonBin: string;
  workRoot: string;
  cacheRoot: string;
  localMediaRoot: string;
  fontFile: string;
  fontFamily: string;
  whisperModel: string;
  whisperBeamSize: number;
  maxDurationSeconds: number;
  retentionDays: number;
  maxActiveVideosPerUser: number;
  presignTtlSeconds: number;
  stageTimeoutMs: number;
  maxChatMessages: number;
  chatSimilarityThreshold: number;
  openaiApiKey: string | null;
  openaiSummaryModel: string | null;
  openaiChatModel: string | null;
  openaiEmbeddingModel: string | null;
  openaiEmbeddingDimensions: number;
  apiPublicUrl: string;
  mediaSigningSecret: string;
  authMode: string | undefined;
  allowDevIdentity: string | undefined;
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
};

export function findRepoRoot(startDirectory: string): string {
  let current = resolve(startDirectory);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error("Raiz do repositorio nao encontrada");
}

export function readRuntimeConfig(env: Record<string, string | undefined>, repoRoot: string): RuntimeConfig {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(`Variavel obrigatoria ausente: ${name}`);
    }
    return value;
  };
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: numberFromEnv(env.PORT, 3000),
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    webOrigin: env.WEB_ORIGIN ?? "http://localhost:5173",
    repoRoot,
    pythonBin: env.PYTHON_BIN || join(repoRoot, "workers/media-python/.venv/bin/python"),
    workRoot: env.WORK_ROOT ?? join(repoRoot, "var/work"),
    cacheRoot: env.MODEL_CACHE_ROOT ?? join(repoRoot, ".cache"),
    localMediaRoot: env.LOCAL_MEDIA_ROOT ?? join(repoRoot, "var/local-media"),
    fontFile: env.FONT_FILE ?? "/System/Library/Fonts/Supplemental/Arial.ttf",
    fontFamily: env.FONT_FAMILY ?? "Arial",
    whisperModel: env.WHISPER_MODEL ?? "base",
    whisperBeamSize: numberFromEnv(env.WHISPER_BEAM_SIZE, 5),
    maxDurationSeconds: numberFromEnv(env.MAX_VIDEO_DURATION_SECONDS, 1800),
    retentionDays: numberFromEnv(env.RETENTION_DAYS, 7),
    maxActiveVideosPerUser: numberFromEnv(env.MAX_ACTIVE_VIDEOS_PER_USER, 1),
    presignTtlSeconds: numberFromEnv(env.PRESIGN_TTL_SECONDS, 900),
    stageTimeoutMs: numberFromEnv(env.STAGE_TIMEOUT_MS, 1_800_000),
    maxChatMessages: numberFromEnv(env.MAX_CHAT_MESSAGES, 40),
    chatSimilarityThreshold: Number(env.CHAT_SIMILARITY_THRESHOLD ?? 0.2),
    openaiApiKey: env.OPENAI_API_KEY || null,
    openaiSummaryModel: env.OPENAI_SUMMARY_MODEL || null,
    openaiChatModel: env.OPENAI_CHAT_MODEL || null,
    openaiEmbeddingModel: env.OPENAI_EMBEDDING_MODEL || null,
    openaiEmbeddingDimensions: numberFromEnv(env.OPENAI_EMBEDDING_DIMENSIONS, 1536),
    apiPublicUrl: env.API_PUBLIC_URL ?? `http://localhost:${numberFromEnv(env.PORT, 3000)}`,
    mediaSigningSecret:
      env.MEDIA_SIGNING_SECRET ||
      (env.NODE_ENV === "production" ? required("MEDIA_SIGNING_SECRET") : "local-dev-media-signing-secret"),
    authMode: env.AUTH_MODE,
    allowDevIdentity: env.ALLOW_DEV_IDENTITY,
    s3: {
      endpoint: required("S3_ENDPOINT"),
      region: env.S3_REGION ?? "us-east-1",
      bucket: required("S3_BUCKET"),
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? "true") === "true",
    },
  };
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Valor numerico invalido: ${value}`);
  }
  return parsed;
}
