const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;
const allowedHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);

export type YouTubeUrlResult =
  | { ok: true; videoId: string; canonicalUrl: string }
  | { ok: false; code: "invalid_url" | "playlist" | "unsupported_host"; message: string };

export function normalizeYouTubeUrl(input: string): YouTubeUrlResult {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return { ok: false, code: "invalid_url", message: "Informe uma URL valida de um video do YouTube." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, code: "invalid_url", message: "A URL precisa usar HTTP ou HTTPS." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, code: "invalid_url", message: "A URL nao pode conter credenciais." };
  }
  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(host)) {
    return { ok: false, code: "unsupported_host", message: "Somente links de videos do YouTube sao aceitos." };
  }
  if (parsed.pathname === "/playlist" || parsed.searchParams.has("list") && !extractVideoId(parsed)) {
    return { ok: false, code: "playlist", message: "Playlists nao sao aceitas. Informe um video individual." };
  }
  if (parsed.pathname.startsWith("/playlist") || parsed.pathname.startsWith("/channel") || parsed.pathname.startsWith("/results") || parsed.pathname.startsWith("/@")) {
    return { ok: false, code: "playlist", message: "Informe o link de um video individual, nao de um canal ou playlist." };
  }
  const videoId = extractVideoId(parsed);
  if (!videoId) {
    return { ok: false, code: "invalid_url", message: "Nao foi possivel identificar um video individual nessa URL." };
  }
  return {
    ok: true,
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function extractVideoId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    const shortId = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return videoIdPattern.test(shortId) ? shortId : null;
  }
  const fromQuery = parsed.searchParams.get("v");
  if (fromQuery && videoIdPattern.test(fromQuery)) {
    return fromQuery;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  const markerIndex = parts.findIndex((part) => part === "embed" || part === "shorts" || part === "live" || part === "v");
  if (markerIndex >= 0) {
    const candidate = parts[markerIndex + 1] ?? "";
    return videoIdPattern.test(candidate) ? candidate : null;
  }
  return null;
}
