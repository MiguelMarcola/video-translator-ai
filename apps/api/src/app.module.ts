import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuthGuard } from "./auth.guard.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";
import { MediaController } from "./media.controller.js";
import { HealthController } from "./health.controller.js";
import { PrismaService } from "./prisma.service.js";
import { RequestIdMiddleware } from "./request-id.middleware.js";
import { StorageService } from "./storage.service.js";
import { VideosController } from "./videos.controller.js";
import { VideosService } from "./videos.service.js";

@Module({
  controllers: [HealthController, MediaController, VideosController, ConversationsController],
  providers: [PrismaService, AuthGuard, StorageService, VideosService, ConversationsService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
