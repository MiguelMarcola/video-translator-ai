import { createHmac, timingSafeEqual } from "node:crypto";

export function createSignedMediaUrl(input: {
  apiPublicUrl: string;
  secret: string;
  userId: string;
  videoId: string;
  kind: string;
  expiresAtMs: number;
}): string {
  const expires = Math.floor(input.expiresAtMs / 1000).toString();
  const signature = signMediaPayload(input.secret, input.userId, input.videoId, input.kind, expires);
  const url = new URL(`/media/${input.videoId}/${input.kind}`, input.apiPublicUrl);
  url.searchParams.set("user", input.userId);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signature);
  return url.toString();
}

export function mediaSignatureIsValid(input: {
  secret: string;
  userId: string;
  videoId: string;
  kind: string;
  expires: string;
  signature: string;
}): boolean {
  const expected = signMediaPayload(input.secret, input.userId, input.videoId, input.kind, input.expires);
  const providedBytes = Buffer.from(input.signature);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    return false;
  }
  const expiresAtSeconds = Number(input.expires);
  return Number.isFinite(expiresAtSeconds) && expiresAtSeconds * 1000 >= Date.now();
}

function signMediaPayload(secret: string, userId: string, videoId: string, kind: string, expires: string): string {
  return createHmac("sha256", secret).update(`${userId}:${videoId}:${kind}:${expires}`).digest("hex");
}
