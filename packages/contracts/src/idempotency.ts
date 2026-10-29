import { createHash } from "node:crypto";

export function requestFingerprint(body: { youtubeUrl: string; targetLanguage: string }): string {
  return createHash("sha256")
    .update(JSON.stringify({ targetLanguage: body.targetLanguage, youtubeUrl: body.youtubeUrl }))
    .digest("hex");
}
