import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ReferenceList } from "@/components/reference-list";
import { ChatThread } from "@/components/chat-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoPlayer } from "@/components/video-player";
import { api, ApiRequestError } from "@/lib/api";

export function VideoPage() {
  const { videoId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [seekToMs, setSeekToMs] = useState<{ token: number; startMs: number } | null>(null);
  const [contentTab, setContentTab] = useState("resumo");
  const videoQuery = useQuery({
    queryKey: ["video", videoId],
    queryFn: () => api.video(videoId),
    retry: (failureCount, error) => {
      if (error instanceof ApiRequestError && error.statusCode === 404) {
        return false;
      }
      return failureCount < 2;
    },
  });
  const statusQuery = useQuery({
    queryKey: ["video-status", videoId],
    queryFn: () => api.status(videoId),
    retry: (failureCount, error) => {
      if (error instanceof ApiRequestError && error.statusCode === 404) {
        return false;
      }
      return failureCount < 2;
    },
    refetchInterval: (query) => {
      if (query.state.error) {
        return false;
      }
      const status = query.state.data?.status;
      if (!status || status === "queued" || status === "processing" || status === "partial" || status === "deleting") {
        return 4000;
      }
      return false;
    },
  });
  const playbackReady = statusQuery.data?.playbackReady ?? videoQuery.data?.playbackReady ?? false;
  const playbackQuery = useQuery({
    queryKey: ["playback", videoId],
    queryFn: () => api.playback(videoId),
    enabled: playbackReady,
    refetchInterval: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      if (!expiresAt) {
        return false;
      }
      return Math.max(15_000, new Date(expiresAt).getTime() - Date.now() - 60_000);
    },
  });
  const summaryQuery = useQuery({
    queryKey: ["summary", videoId],
    queryFn: () => api.summary(videoId),
    enabled: statusQuery.data?.summaryStatus === "ready",
    retry: false,
  });
  const conversationQuery = useQuery({
    queryKey: ["conversation", videoId],
    queryFn: () => api.openConversation(videoId),
    enabled: statusQuery.data?.chatStatus === "ready",
    retry: false,
  });
  const messagesQuery = useQuery({
    queryKey: ["messages", conversationQuery.data?.id],
    queryFn: () => api.messages(conversationQuery.data?.id ?? ""),
    enabled: Boolean(conversationQuery.data?.id),
  });
  const exportMutation = useMutation({
    mutationFn: () => api.requestExport(videoId),
  });
  const exportId = exportMutation.data?.exportId ?? videoQuery.data?.downloads.exportId ?? "";
  const exportQuery = useQuery({
    queryKey: ["export", videoId, exportId],
    queryFn: () => api.exportStatus(videoId, exportId),
    enabled: exportId.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "ready" || status === "failed") {
        return false;
      }
      return 2000;
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.remove(videoId),
    onSuccess: async () => {
      queryClient.setQueryData<{ items: Array<{ id: string }> }>(["videos"], (currentList) => {
        if (!currentList) {
          return currentList;
        }
        return {
          ...currentList,
          items: currentList.items.filter((video) => video.id !== videoId),
        };
      });
      await queryClient.invalidateQueries({ queryKey: ["videos"] });
      navigate("/videos");
    },
  });

  const seek = (startMs: number) => {
    setSeekToMs({ token: Date.now(), startMs });
    void api.recordEvent(videoId, "timestamp.clicked");
  };

  if (videoQuery.isLoading) {
    return <p>Carregando o projeto.</p>;
  }
  if (videoQuery.isError) {
    const missingVideo = videoQuery.error instanceof ApiRequestError && videoQuery.error.statusCode === 404;
    return (
      <Card role="alert" className="mx-auto mt-16 max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {missingVideo ? "Vídeo não encontrado" : "Não foi possível abrir o vídeo"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {missingVideo
            ? "Esse vídeo foi excluído ou o endereço não existe mais."
            : videoQuery.error.message}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/videos">Voltar ao histórico</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Novo vídeo</Link>
          </Button>
        </div>
      </Card>
    );
  }
  const video = videoQuery.data;
  if (!video) {
    return null;
  }
  const processing = !playbackReady && video.status !== "failed" && video.status !== "expired";

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(18.5rem,22rem)]">
      <div className="min-w-0 space-y-6 md:h-full">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{video.title ?? "Vídeo em processamento"}</h1>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              {video.sourceUrl ? (
                <a className="text-sm font-medium text-primary" href={video.sourceUrl}>
                  Origem
                </a>
              ) : null}
              <p className="text-sm text-muted">Disponível até {new Date(video.expiresAt).toLocaleString("pt-BR")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {playbackReady ? (
                <VideoDownload
                  status={exportQuery.data?.status ?? exportMutation.data?.status ?? video.downloads.burnedMp4}
                  url={exportQuery.data?.url ?? exportMutation.data?.url}
                  startedAt={exportQuery.data?.startedAt}
                  errorMessage={exportQuery.data?.errorMessage}
                  starting={exportMutation.isPending}
                  onStart={() => exportMutation.mutate()}
                />
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                Excluir dados
              </Button>
            </div>
          </div>
          <Link to="/videos" className="mt-3 inline-flex text-sm font-medium text-primary">
            Voltar ao histórico
          </Link>
        </div>
        {video.status === "expired" ? (
          <p role="status" className="rounded-2xl border border-border bg-card p-4 text-sm">
            Os arquivos expiraram. Envie o vídeo novamente para gerar outro processamento.
          </p>
        ) : null}
        {video.status === "failed" ? (
          <p role="alert" className="rounded-2xl border border-destructive bg-card p-4 text-sm text-destructive">
            {statusQuery.data?.failureMessage ?? video.failureMessage ?? "O processamento falhou."}
          </p>
        ) : null}
        <Card className="md:sticky md:top-20 md:z-10">
          {processing ? (
            <div className="mb-6">
              <h2 className="text-lg font-semibold tracking-tight">Processamento</h2>
              <p className="mt-2 text-sm" role="status">
                Etapa atual: {statusQuery.data?.currentStageLabel ?? video.currentStageLabel ?? "Na fila"}
              </p>
              <ol className="mt-4 space-y-2">
                {statusQuery.data?.stages.map((stage) => (
                  <li key={stage.stage} className="flex items-center justify-between gap-3 rounded-xl bg-accent px-3 py-2 text-sm">
                    <span>{stage.label}</span>
                    <Badge>{stageLabel(stage.status)}</Badge>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {playbackQuery.data ? (
            <VideoPlayer
              videoUrl={playbackQuery.data.videoUrl}
              subtitleUrl={playbackQuery.data.subtitles[0]?.url ?? null}
              seekToMs={seekToMs}
            />
          ) : null}
        </Card>
      </div>
      <div className="min-w-0 md:h-full md:self-stretch">
        <Card
          className={
            contentTab === "chat"
              ? "flex h-[calc(100dvh-8rem)] min-h-0 flex-col overflow-hidden md:sticky md:top-24"
              : "h-full"
          }
        >
          <Tabs value={contentTab} onValueChange={setContentTab} className={contentTab === "chat" ? "flex min-h-0 flex-1 flex-col" : undefined}>
            <TabsList aria-label="Conteúdo do vídeo">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
            </TabsList>
            <TabsContent value="resumo">
              {statusQuery.data?.summaryStatus === "pending" ? <p>O resumo está sendo preparado.</p> : null}
              {statusQuery.data?.summaryStatus === "unavailable" ? <p>Resumo indisponível: modelo não configurado.</p> : null}
              {statusQuery.data?.summaryStatus === "failed" ? <p>O resumo falhou.</p> : null}
              {summaryQuery.data ? (
                <div className="space-y-4">
                  <p>{summaryQuery.data.overview}</p>
                  {summaryQuery.data.topics.map((topic) => (
                    <section key={topic.title} className="space-y-2">
                      <h3 className="font-medium">{topic.title}</h3>
                      <ReferenceList references={topic.references} onSeek={seek} />
                      <p className="text-sm leading-6">{topic.detail}</p>
                    </section>
                  ))}
                  {summaryQuery.data.conclusions.map((conclusion) => (
                    <div key={conclusion.text} className="space-y-2">
                      <ReferenceList references={conclusion.references} onSeek={seek} />
                      <p>{conclusion.text}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </TabsContent>
            <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
              {statusQuery.data?.chatStatus === "pending" ? <p>O chat está sendo preparado.</p> : null}
              {statusQuery.data?.chatStatus === "unavailable" ? <p>Chat indisponível: modelo não configurado.</p> : null}
              {statusQuery.data?.chatStatus === "failed" ? <p>O chat falhou.</p> : null}
              {statusQuery.data?.chatStatus === "ready" && conversationQuery.data ? (
                <ChatThread
                  conversationId={conversationQuery.data.id}
                  messages={messagesQuery.data?.messages ?? []}
                />
              ) : null}
              {statusQuery.data?.chatStatus === "ready" && !conversationQuery.data ? <p>Abrindo a conversa.</p> : null}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

function stageLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Na fila",
    queued: "Na fila",
    running: "Em execução",
    succeeded: "Concluída",
    failed: "Falhou",
    cancelled: "Cancelada",
    ready: "Pronta",
    idle: "Não iniciada",
  };
  return labels[status] ?? status;
}

function VideoDownload({
  status,
  url,
  startedAt,
  errorMessage,
  starting,
  onStart,
}: {
  status: string;
  url?: string;
  startedAt?: string | null;
  errorMessage?: string | null;
  starting: boolean;
  onStart: () => void;
}) {
  const ready = status === "ready" && Boolean(url);
  const failed = status === "failed";
  const preparing = !ready && !failed && (starting || (status !== "idle" && status !== ""));
  const preparationLabel = exportProgressMessage(status);

  return (
    <div className="flex flex-col items-end gap-1">
      {ready && url ? (
        <a className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground" href={url} download="video-legendado.mp4">
          Baixar vídeo
        </a>
      ) : (
        <Button type="button" size="sm" onClick={onStart} disabled={preparing} aria-busy={preparing}>
          <span className={preparing ? "opacity-70" : undefined}>{failed ? "Tentar novamente" : "Baixar vídeo"}</span>
          {preparing ? (
            <span className="sr-only" role="status">
              {startedAt
                ? `Em andamento desde ${new Date(startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`
                : preparationLabel}
            </span>
          ) : null}
        </Button>
      )}
      {failed ? (
        <p role="alert" className="max-w-56 text-right text-xs text-destructive">
          {errorMessage ?? "Não foi possível preparar o vídeo completo."}
        </p>
      ) : null}
    </div>
  );
}

function exportProgressMessage(status: string): string {
  if (status === "running") {
    return "Gravando as legendas no vídeo inteiro.";
  }
  if (status === "succeeded") {
    return "Finalizando o arquivo do vídeo.";
  }
  return "O vídeo completo está na fila.";
}
