export function allowedWebOrigins(webOrigin: string): string[] {
  const origins = new Set([webOrigin]);
  try {
    const parsed = new URL(webOrigin);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      origins.add(parsed.origin);
    } else if (parsed.hostname === "127.0.0.1") {
      parsed.hostname = "localhost";
      origins.add(parsed.origin);
    }
  } catch {
    return [webOrigin];
  }
  return [...origins];
}
