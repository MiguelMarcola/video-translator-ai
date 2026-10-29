import { Controller, Get, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiError } from "./api-error.js";
import { allowedWebOrigins } from "./local-origins.js";
import { mediaSignatureIsValid } from "./media-signature.js";
import { PrismaService } from "./prisma.service.js";
import { runtimeConfig } from "./runtime.js";
import { StorageService } from "./storage.service.js";

const mediaKinds: Record<string, { contentType: string; downloadName: string | null }> = {
  playback_mp4: { contentType: "video/mp4", downloadName: null },
  subtitles_vtt: { contentType: "text/vtt; charset=utf-8", downloadName: "legendas.vtt" },
  subtitles_srt: { contentType: "application/x-subrip; charset=utf-8", downloadName: "legendas.srt" },
  burned_mp4: { contentType: "video/mp4", downloadName: "video-legendado.mp4" },
};

@Controller("media")
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get(":videoId/:kind")
  async stream(
    @Param("videoId") videoId: string,
    @Param("kind") kind: string,
    @Query("user") userId: string | undefined,
    @Query("expires") expires: string | undefined,
    @Query("signature") signature: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const definition = mediaKinds[kind];
      if (!definition || !userId || !expires || !signature) {
        throw new ApiError(403, "media_url_invalid", "O endereco temporario e invalido ou expirou.");
      }
      const signatureIsValid = mediaSignatureIsValid({
        secret: runtimeConfig.mediaSigningSecret,
        userId,
        videoId,
        kind,
        expires,
        signature,
      });
      if (!signatureIsValid) {
        throw new ApiError(403, "media_url_invalid", "O endereco temporario e invalido ou expirou.");
      }
      const video = await this.prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.ownerId !== userId || video.deletedAt || video.deletionRequestedAt) {
        throw new ApiError(404, "media_not_found", "Midia nao encontrada.");
      }
      const artifact = await this.prisma.artifact.findUnique({
        where: { videoId_kind_version: { videoId, kind, version: video.version } },
      });
      if (!artifact) {
        throw new ApiError(404, "media_not_found", "Midia nao encontrada.");
      }
      const rangeHeader = request.headers.range;
      const opened = await this.storage.openObject(artifact.objectKey, typeof rangeHeader === "string" ? rangeHeader : undefined);
      response.status(opened.statusCode);
      response.setHeader("Content-Type", definition.contentType);
      response.setHeader("Accept-Ranges", "bytes");
      response.setHeader("Cache-Control", "private, max-age=0");
      const requestOrigin = request.headers.origin;
      const allowedOrigins = new Set(
        runtimeConfig.nodeEnv === "production" ? [runtimeConfig.webOrigin] : allowedWebOrigins(runtimeConfig.webOrigin),
      );
      const allowOrigin = requestOrigin && allowedOrigins.has(requestOrigin) ? requestOrigin : runtimeConfig.webOrigin;
      response.setHeader("Access-Control-Allow-Origin", allowOrigin);
      response.setHeader(
        "Access-Control-Expose-Headers",
        "Accept-Ranges, Content-Range, Content-Length, Content-Type, Content-Disposition",
      );
      if (opened.contentLength !== undefined) {
        response.setHeader("Content-Length", String(opened.contentLength));
      }
      if (opened.contentRange) {
        response.setHeader("Content-Range", opened.contentRange);
      }
      if (definition.downloadName) {
        response.setHeader("Content-Disposition", `attachment; filename="${definition.downloadName}"`);
      }
      opened.body.pipe(response);
    } catch (error) {
      if (response.headersSent) {
        return;
      }
      const statusCode = error instanceof ApiError ? error.statusCode : 500;
      const code = error instanceof ApiError ? error.code : "media_failed";
      const message = error instanceof ApiError ? error.message : "Nao foi possivel abrir a midia.";
      response.status(statusCode).json({ code, message });
    }
  }
}
