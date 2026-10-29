import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

const statusLabels: Record<string, string> = {
  queued: "Na fila",
  processing: "Processando",
  partial: "Parcialmente disponível",
  ready: "Concluído",
  failed: "Falhou",
  expired: "Expirado",
};

export function HistoryPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["videos"], queryFn: () => api.listVideos() });
  const deleteMutation = useMutation({
    mutationFn: (videoId: string) => api.remove(videoId),
    onSuccess: async (_result, videoId) => {
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
    },
  });
  const videosStillInHistory = (query.data?.items ?? []).filter(
    (video) => video.status !== "deleted" && video.status !== "deleting",
  );
  return (
    <section className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-semibold tracking-tight">Histórico</h1>
      {query.isLoading ? <p className="mt-4 text-sm text-muted">Carregando projetos.</p> : null}
      {query.isError ? (
        <p className="mt-4 text-destructive" role="alert">
          {query.error.message}
        </p>
      ) : null}
      {deleteMutation.isError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {deleteMutation.error.message}
        </p>
      ) : null}
      {!query.isLoading && !query.isError && videosStillInHistory.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nenhum vídeo ainda.</p>
      ) : null}
      <ul className="mt-6 space-y-3">
        {videosStillInHistory.map((video) => {
          const videoTitle = video.title ?? "Vídeo sem título";
          const deletingThisVideo = deleteMutation.isPending && deleteMutation.variables === video.id;
          return (
            <li key={video.id}>
              <Card className="flex flex-wrap items-center gap-4">
                <Link to={`/videos/${video.id}`} className="min-w-0 flex-1 rounded-xl">
                  <p className="font-medium tracking-tight">{videoTitle}</p>
                  <p className="text-sm text-muted">{new Date(video.createdAt).toLocaleString("pt-BR")}</p>
                </Link>
                <Badge>{statusLabels[video.status] ?? video.status}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Excluir ${videoTitle}`}
                  disabled={deletingThisVideo}
                  onClick={() => deleteMutation.mutate(video.id)}
                >
                  {deletingThisVideo ? "Excluindo" : "Excluir"}
                </Button>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
