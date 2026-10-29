import { useMutation } from "@tanstack/react-query";
import { enabledTargetLanguages, normalizeYouTubeUrl } from "@video-translate/contracts";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type FormValues = {
  youtubeUrl: string;
  targetLanguage: "pt-BR";
};

export function HomePage() {
  const navigate = useNavigate();
  const form = useForm<FormValues>({
    defaultValues: { youtubeUrl: "", targetLanguage: "pt-BR" },
  });
  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.createVideo(values, `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    onSuccess: (video) => {
      void navigate(`/videos/${video.id}`);
    },
  });

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.35fr_0.75fr] lg:items-start">
      <section className="lg:pt-4">
        <p className="text-sm font-medium text-primary">Inglês para português do Brasil</p>
        <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Assistir com legendas e perguntar sobre a fala
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted">
          Informe um vídeo individual do YouTube. O áudio original é preservado. A tradução das legendas é local e, nesta
          versão, o destino disponível é português do Brasil a partir do inglês.
        </p>
        <Card className="mt-8">
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => {
              const normalized = normalizeYouTubeUrl(values.youtubeUrl);
              if (!normalized.ok) {
                form.setError("youtubeUrl", { message: normalized.message });
                return;
              }
              mutation.mutate({ youtubeUrl: normalized.canonicalUrl, targetLanguage: "pt-BR" });
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="youtubeUrl">URL do vídeo</Label>
              <Input id="youtubeUrl" type="url" autoComplete="off" placeholder="https://www.youtube.com/watch?v=" {...form.register("youtubeUrl", { required: "Informe a URL." })} />
              {form.formState.errors.youtubeUrl ? (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.youtubeUrl.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetLanguage">Idioma das legendas</Label>
              <select
                id="targetLanguage"
                className="h-12 w-full rounded-xl border border-border bg-background px-3"
                {...form.register("targetLanguage")}
              >
                {enabledTargetLanguages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={mutation.isPending} className="w-full sm:w-auto">
              {mutation.isPending ? "Enviando" : "Gerar vídeo"}
            </Button>
            {mutation.isError ? (
              <p className="text-sm text-destructive" role="alert">
                {mutation.error.message}
              </p>
            ) : null}
          </form>
        </Card>
      </section>
      <aside className="grid gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Antes de enviar</h2>
        {[
          "Duração máxima inicial: 30 minutos.",
          "Os arquivos ficam disponíveis por 7 dias e podem ser excluídos antes.",
          "Resumo e chat usam a fala transcrita, não o texto que aparece só na imagem.",
          "O áudio original permanece. A ferramenta não faz dublagem.",
        ].map((note) => (
          <Card key={note} className="p-4 text-sm leading-6">
            {note}
          </Card>
        ))}
      </aside>
    </div>
  );
}
