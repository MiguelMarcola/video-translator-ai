import { useEffect, useRef } from "react";

export function VideoPlayer({
  videoUrl,
  subtitleUrl,
  seekToMs,
}: {
  videoUrl: string;
  subtitleUrl: string | null;
  seekToMs: { token: number; startMs: number } | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !seekToMs) {
      return;
    }
    video.currentTime = seekToMs.startMs / 1000;
    void video.play().catch(() => undefined);
  }, [seekToMs]);

  return (
    <video
      ref={videoRef}
      className="aspect-video w-full rounded-2xl bg-black shadow-[0_16px_50px_rgba(18,20,23,0.16)]"
      controls
      crossOrigin="anonymous"
      src={videoUrl}
      onPlay={() => undefined}
    >
      {subtitleUrl ? (
        <track kind="subtitles" src={subtitleUrl} srcLang="pt-BR" label="Português (Brasil)" default />
      ) : null}
    </video>
  );
}
