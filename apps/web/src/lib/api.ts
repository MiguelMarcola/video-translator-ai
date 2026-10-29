const devUserStorageKey = "videoTranslateDevUserId";

export type VideoSummary = {
  id: string;
  title: string | null;
  sourceUrl: string | null;
  targetLanguage: string;
  status: string;
  currentStage: string | null;
  currentStageLabel: string | null;
  expiresAt: string;
  playbackReady: boolean;
  subtitlesReady: boolean;
  summaryStatus: string;
  chatStatus: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  durationMs: number | null;
  maxDurationSeconds?: number;
  retentionDays?: number;
};

export type StageState = {
  stage: string;
  label: string;
  status: string;
  errorMessage: string | null;
};

export type TemporalReference = {
  segmentId: string;
  startMs: number;
  endMs: number;
};

function devUserId(): string {
  const existing = window.localStorage.getItem(devUserStorageKey);
  if (existing && /^[a-z0-9-]{3,64}$/.test(existing)) {
    return existing;
  }
  window.localStorage.setItem(devUserStorageKey, "local-dev");
  return "local-dev";
}

export class ApiRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Dev-User-Id": devUserId(),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
    throw new ApiRequestError(
      response.status,
      payload?.code ?? "request_failed",
      payload?.message ?? "Nao foi possivel concluir a solicitacao.",
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  createVideo(body: { youtubeUrl: string; targetLanguage: "pt-BR" }, idempotencyKey: string) {
    return request<VideoSummary>("/videos", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },
  listVideos() {
    return request<{ items: VideoSummary[] }>("/videos");
  },
  video(videoId: string) {
    return request<VideoSummary & { downloads: { burnedMp4: string; exportId: string | null } }>(`/videos/${videoId}`);
  },
  status(videoId: string) {
    return request<{
      status: string;
      currentStageLabel: string | null;
      stages: StageState[];
      summaryStatus: string;
      chatStatus: string;
      playbackReady: boolean;
      failureMessage: string | null;
    }>(`/videos/${videoId}/status`);
  },
  playback(videoId: string) {
    return request<{
      videoUrl: string;
      subtitles: Array<{ url: string; label: string }>;
      expiresAt: string;
    }>(`/videos/${videoId}/playback`);
  },
  subtitle(videoId: string, format: "srt" | "vtt") {
    return request<{ url: string }>(`/videos/${videoId}/subtitles/${format}`);
  },
  summary(videoId: string) {
    return request<{
      overview: string;
      topics: Array<{ title: string; detail: string; references: TemporalReference[] }>;
      conclusions: Array<{ text: string; references: TemporalReference[] }>;
    }>(`/videos/${videoId}/summary`);
  },
  openConversation(videoId: string) {
    return request<{ id: string }>(`/videos/${videoId}/conversations`, { method: "POST", body: "{}" });
  },
  messages(conversationId: string) {
    return request<{ messages: Array<{ id: string; role: string; content: string; status: string; references: TemporalReference[] }> }>(
      `/conversations/${conversationId}/messages`,
    );
  },
  requestExport(videoId: string) {
    return request<{ exportId: string; status: string; url?: string }>(`/videos/${videoId}/exports`, { method: "POST", body: "{}" });
  },
  exportStatus(videoId: string, exportId: string) {
    return request<{ status: string; url?: string; startedAt?: string | null; errorMessage?: string | null }>(
      `/videos/${videoId}/exports/${exportId}`,
    );
  },
  retry(videoId: string, stage: string) {
    return request(`/videos/${videoId}/retries`, { method: "POST", body: JSON.stringify({ stage }) });
  },
  remove(videoId: string) {
    return request(`/videos/${videoId}`, { method: "DELETE" });
  },
  recordEvent(videoId: string, eventType: "timestamp.clicked" | "summary.opened" | "playback.started") {
    return request(`/videos/${videoId}/events`, { method: "POST", body: JSON.stringify({ eventType }) }).catch(() => undefined);
  },
};
