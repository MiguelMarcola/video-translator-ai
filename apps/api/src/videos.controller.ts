import { Body, Controller, Delete, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiError } from "./api-error.js";
import { AuthGuard } from "./auth.guard.js";
import { CurrentUserId } from "./current-user.js";
import { VideosService } from "./videos.service.js";

@Controller("videos")
@UseGuards(AuthGuard)
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post()
  create(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.videos.create(userId, body, normalizeIdempotencyKey(idempotencyKey));
  }

  @Get()
  list(@CurrentUserId() userId: string, @Query("limit") limit?: string, @Query("offset") offset?: string) {
    return this.videos.list(userId, { limit, offset });
  }

  @Get(":videoId")
  detail(@CurrentUserId() userId: string, @Param("videoId") videoId: string) {
    return this.videos.detail(userId, videoId);
  }

  @Get(":videoId/status")
  status(@CurrentUserId() userId: string, @Param("videoId") videoId: string) {
    return this.videos.status(userId, videoId);
  }

  @Get(":videoId/playback")
  playback(@CurrentUserId() userId: string, @Param("videoId") videoId: string) {
    return this.videos.playback(userId, videoId);
  }

  @Get(":videoId/subtitles/:format")
  subtitle(
    @CurrentUserId() userId: string,
    @Param("videoId") videoId: string,
    @Param("format") format: string,
  ) {
    return this.videos.subtitle(userId, videoId, format);
  }

  @Get(":videoId/summary")
  summary(@CurrentUserId() userId: string, @Param("videoId") videoId: string) {
    return this.videos.summary(userId, videoId);
  }

  @Post(":videoId/exports")
  exportVideo(@CurrentUserId() userId: string, @Param("videoId") videoId: string) {
    return this.videos.requestExport(userId, videoId);
  }

  @Get(":videoId/exports/:exportId")
  exportStatus(
    @CurrentUserId() userId: string,
    @Param("videoId") videoId: string,
    @Param("exportId") exportId: string,
  ) {
    return this.videos.exportStatus(userId, videoId, exportId);
  }

  @Post(":videoId/retries")
  retry(@CurrentUserId() userId: string, @Param("videoId") videoId: string, @Body() body: unknown) {
    return this.videos.retry(userId, videoId, body);
  }

  @Post(":videoId/events")
  recordEvent(@CurrentUserId() userId: string, @Param("videoId") videoId: string, @Body() body: unknown) {
    return this.videos.recordEvent(userId, videoId, body);
  }

  @Delete(":videoId")
  remove(@CurrentUserId() userId: string, @Param("videoId") videoId: string) {
    return this.videos.remove(userId, videoId);
  }
}

function normalizeIdempotencyKey(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(value)) {
    throw new ApiError(400, "invalid_idempotency_key", "A chave de idempotencia e invalida.");
  }
  return value;
}
