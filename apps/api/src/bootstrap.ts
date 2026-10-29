import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ensurePrivateBucket } from "@video-translate/storage";
import { AppModule } from "./app.module.js";
import { ApiExceptionFilter } from "./api-exception.filter.js";
import { allowedWebOrigins } from "./local-origins.js";
import { runtimeConfig } from "./runtime.js";

export async function bootstrap(): Promise<void> {
  await ensurePrivateBucket(runtimeConfig.s3, runtimeConfig.webOrigin);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const allowedOrigins = new Set(
    runtimeConfig.nodeEnv === "production" ? [runtimeConfig.webOrigin] : allowedWebOrigins(runtimeConfig.webOrigin),
  );
  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    exposedHeaders: ["X-Request-Id", "Accept-Ranges", "Content-Range", "Content-Length", "Content-Type", "Content-Disposition"],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(runtimeConfig.port);
}
