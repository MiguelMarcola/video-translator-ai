import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "./auth.guard.js";
import { ConversationsService } from "./conversations.service.js";
import { CurrentUserId } from "./current-user.js";

@Controller()
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post("videos/:videoId/conversations")
  open(@CurrentUserId() userId: string, @Param("videoId") videoId: string) {
    return this.conversations.open(userId, videoId);
  }

  @Get("conversations/:conversationId/messages")
  list(@CurrentUserId() userId: string, @Param("conversationId") conversationId: string) {
    return this.conversations.listMessages(userId, conversationId);
  }

  @Post("conversations/:conversationId/messages")
  async create(
    @CurrentUserId() userId: string,
    @Param("conversationId") conversationId: string,
    @Body() body: unknown,
    @Res() response: Response,
  ): Promise<void> {
    try {
      await this.conversations.streamMessage(userId, conversationId, body, response);
    } catch (error) {
      if (response.headersSent) {
        if (!response.writableEnded) {
          response.end();
        }
        return;
      }
      throw error;
    }
  }
}
