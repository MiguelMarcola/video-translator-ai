import { rm } from "node:fs/promises";
import { join } from "node:path";
import { canWriteArtifacts } from "@video-translate/contracts";
import type { RuntimeConfig } from "@video-translate/contracts/runtime";
import type { PrismaClient } from "@video-translate/database";
import type { ObjectStorage } from "@video-translate/storage";

export async function runCleanup(
  prisma: PrismaClient,
  storage: ObjectStorage,
  config: RuntimeConfig,
  videoId: string,
): Promise<void> {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video || canWriteArtifacts(video)) {
    return;
  }
  await storage.deletePrefix(`videos/${videoId}/`);
  await prisma.transcriptChunk.deleteMany({ where: { videoId } });
  await prisma.transcriptSegment.deleteMany({ where: { videoId } });
  await prisma.summary.deleteMany({ where: { videoId } });
  await prisma.artifact.deleteMany({ where: { videoId } });
  await prisma.conversation.deleteMany({ where: { videoId } });
  await rm(join(config.workRoot, videoId), { recursive: true, force: true });
  if (video.status === "expired") {
    await prisma.video.update({
      where: { id: videoId },
      data: {
        playbackReady: false,
        subtitlesReady: false,
        summaryStatus: "unavailable",
        chatStatus: "unavailable",
        currentStage: null,
        internalSourcePath: null,
      },
    });
    return;
  }
  await prisma.video.update({
    where: { id: videoId },
    data: {
      status: "deleted",
      deletedAt: new Date(),
      playbackReady: false,
      subtitlesReady: false,
      currentStage: null,
      internalSourcePath: null,
      title: null,
      sourceUrl: null,
    },
  });
}
