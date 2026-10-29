import { Injectable } from "@nestjs/common";
import type { Response } from "express";
import OpenAI from "openai";
import {
  assertOwner,
  buildChatMessages,
  buildChatTranscriptContext,
  createMessageBodySchema,
  resolveSegmentReferences,
  toPlainChatProse,
} from "@video-translate/contracts";
import { ApiError } from "./api-error.js";
import { logger } from "./logger.js";
import { PrismaService } from "./prisma.service.js";
import { runtimeConfig } from "./runtime.js";

const limitationText =
  "A transcrição deste vídeo não contém informação suficiente para responder a essa pergunta. O assistente analisa a fala transcrita e não o que aparece apenas em imagens ou slides.";
const maximumChatContextCharacters = 12_000;

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async open(userId: string, videoId: string) {
    const video = await this.ownedVideo(userId, videoId);
    if (video.chatStatus === "unavailable") {
      throw new ApiError(503, "chat_unavailable", "O chat esta indisponivel porque o modelo ou os embeddings nao foram configurados.");
    }
    if (video.chatStatus !== "ready") {
      throw new ApiError(409, "chat_not_ready", "O chat fica disponivel quando a transcricao terminar de ser indexada.");
    }
    const conversation = await this.prisma.conversation.upsert({
      where: { videoId_ownerId: { videoId: video.id, ownerId: userId } },
      create: { videoId: video.id, ownerId: userId },
      update: {},
    });
    return { id: conversation.id, videoId: video.id };
  }

  async listMessages(userId: string, conversationId: string) {
    const conversation = await this.ownedConversation(userId, conversationId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    return { messages: messages.map(presentMessage) };
  }

  async streamMessage(userId: string, conversationId: string, body: unknown, response: Response): Promise<void> {
    const parsed = createMessageBodySchema.parse(body);
    const conversation = await this.ownedConversation(userId, conversationId);
    const video = await this.ownedVideo(userId, conversation.videoId);
    if (video.chatStatus !== "ready") {
      throw new ApiError(409, "chat_not_ready", "O chat ainda nao esta pronto.");
    }
    const messageCount = await this.prisma.message.count({
      where: { conversationId: conversation.id, role: "user" },
    });
    if (messageCount >= runtimeConfig.maxChatMessages) {
      throw new ApiError(429, "chat_limit", "O limite de perguntas deste video foi atingido.");
    }
    const assistantClientId = `${parsed.clientMessageId}:assistant`;
    const existingAssistant = await this.prisma.message.findUnique({
      where: { conversationId_clientMessageId: { conversationId: conversation.id, clientMessageId: assistantClientId } },
    });
    if (existingAssistant?.status === "complete") {
      this.writeReplay(response, existingAssistant.content, existingAssistant.segmentRefs);
      return;
    }
    if (
      existingAssistant?.status === "streaming" &&
      Date.now() - existingAssistant.updatedAt.getTime() < 30_000
    ) {
      throw new ApiError(409, "message_in_progress", "Esta pergunta ainda esta sendo respondida.");
    }
    const client = this.openAiClient();
    const history = await this.prisma.message.findMany({
      where: { conversationId: conversation.id, status: "complete" },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    history.reverse();
    await this.prisma.message.upsert({
      where: { conversationId_clientMessageId: { conversationId: conversation.id, clientMessageId: parsed.clientMessageId } },
      create: {
        conversationId: conversation.id,
        role: "user",
        content: parsed.content,
        status: "complete",
        clientMessageId: parsed.clientMessageId,
      },
      update: { content: parsed.content, status: "complete" },
    });
    const assistant = await this.prisma.message.upsert({
      where: { conversationId_clientMessageId: { conversationId: conversation.id, clientMessageId: assistantClientId } },
      create: {
        conversationId: conversation.id,
        role: "assistant",
        content: "",
        status: "streaming",
        clientMessageId: assistantClientId,
      },
      update: { status: "streaming", content: "" },
    });
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    const segments = await this.prisma.transcriptSegment.findMany({
      where: { videoId: video.id, version: video.version },
      orderBy: { position: "asc" },
    });
    try {
      const retrieved = await this.retrieveSegments(
        client,
        video.id,
        userId,
        parsed.content,
        segments,
        video.detectedLanguage,
      );
      const transcriptContext = retrieved.limited ? "" : buildChatTranscriptContext(retrieved.segments);
      const messages = buildChatMessages({
        targetLanguage: video.targetLanguage,
        transcriptContext,
        history: history
          .filter((message) => message.role === "user" || message.role === "assistant")
          .filter((message) => message.content !== limitationText)
          .map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
        question: parsed.content,
      });
      const stream = await client.chat.completions.create(
        {
          model: runtimeConfig.openaiChatModel ?? "",
          messages,
          stream: true,
        },
        { signal: AbortSignal.timeout(runtimeConfig.stageTimeoutMs) },
      );
      let raw = "";
      let pendingLine = "";
      let clientClosed = false;
      response.on("close", () => {
        clientClosed = true;
      });
      for await (const part of stream) {
        if (clientClosed) {
          break;
        }
        const token = part.choices[0]?.delta?.content ?? "";
        if (!token) {
          continue;
        }
        raw += token;
        pendingLine += token;
        const lines = pendingLine.split("\n");
        pendingLine = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim().startsWith("REFS:")) {
            continue;
          }
          const visibleLine = toPlainChatProse(line);
          if (/^(?:sim|não|nao)\.$/i.test(visibleLine)) {
            continue;
          }
          this.writeToken(response, `${visibleLine}\n`);
        }
      }
      if (!clientClosed && pendingLine && !pendingLine.trim().startsWith("REFS:")) {
        const visibleLine = toPlainChatProse(pendingLine);
        if (!/^(?:sim|não|nao)\.$/i.test(visibleLine)) {
          this.writeToken(response, visibleLine);
        }
      }
      const parsedAnswer = splitReferences(toPlainChatProse(raw));
      const references = resolveSegmentReferences(
        parsedAnswer.segmentIds,
        segments.map((segment) => ({ id: segment.publicId, startMs: segment.startMs, endMs: segment.endMs })),
      );
      if (clientClosed) {
        await this.prisma.message.update({
          where: { id: assistant.id },
          data: { status: "incomplete", content: parsedAnswer.text, segmentRefs: references, model: runtimeConfig.openaiChatModel },
        });
        if (!response.writableEnded) {
          response.end();
        }
        return;
      }
      await this.finishAssistant(assistant.id, parsedAnswer.text, references);
      this.writeDone(response, assistant.id, references);
      await this.prisma.usageEvent.create({
        data: { userId, videoId: video.id, eventType: "chat.message", metadata: { messageId: assistant.id } },
      });
    } catch (error) {
      logger.error({ conversationId, code: "chat_failed" }, "Falha ao gerar resposta");
      await this.prisma.message.update({
        where: { id: assistant.id },
        data: { status: "incomplete" },
      });
      const message = error instanceof ApiError ? error.message : "Nao foi possivel concluir a resposta.";
      if (!response.writableEnded) {
        response.write(`event: error\ndata: ${JSON.stringify({ code: "chat_failed", message })}\n\n`);
        response.end();
      }
    }
  }

  private async retrieveSegments(
    client: OpenAI,
    videoId: string,
    ownerId: string,
    question: string,
    segments: Array<{ publicId: string; position: number; startMs: number; endMs: number; originalText: string }>,
    detectedLanguage: string | null,
  ): Promise<{ limited: boolean; segments: Array<{ id: string; startMs: number; endMs: number; text: string }> }> {
    if (transcriptFitsInChatContext(segments)) {
      return contextFromSegments(segments);
    }
    const directMatch = await this.searchTranscriptChunks(client, videoId, ownerId, question, segments);
    if (!directMatch.limited) {
      return directMatch;
    }
    const questionInDetectedLanguage = await this.translateQuestionIntoDetectedLanguage(client, question, detectedLanguage);
    if (!questionInDetectedLanguage) {
      return directMatch;
    }
    return this.searchTranscriptChunks(client, videoId, ownerId, questionInDetectedLanguage, segments);
  }

  private async searchTranscriptChunks(
    client: OpenAI,
    videoId: string,
    ownerId: string,
    question: string,
    segments: Array<{ publicId: string; position: number; startMs: number; endMs: number; originalText: string }>,
  ): Promise<{ limited: boolean; segments: Array<{ id: string; startMs: number; endMs: number; text: string }> }> {
    const embedding = await client.embeddings.create({
      model: runtimeConfig.openaiEmbeddingModel ?? "",
      input: question,
      dimensions: runtimeConfig.openaiEmbeddingDimensions,
    });
    const vector = embedding.data[0]?.embedding;
    if (!vector) {
      throw new ApiError(502, "embedding_failed", "Nao foi possivel consultar os trechos do video.");
    }
    const vectorLiteral = toVectorLiteral(vector);
    const rows = await this.prisma.$queryRaw<Array<{ segmentIds: string[]; similarity: number }>>`
      SELECT c."segmentIds" AS "segmentIds",
             1 - (c.embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM "TranscriptChunk" c
      INNER JOIN "Video" v ON v.id = c."videoId"
      WHERE c."videoId" = ${videoId}
        AND v."ownerId" = ${ownerId}
        AND c.version = v.version
        AND v."deletedAt" IS NULL
        AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT 5
    `;
    const bestSimilarity = rows.reduce((best, row) => Math.max(best, Number(row.similarity)), 0);
    if (rows.length === 0 || bestSimilarity < runtimeConfig.chatSimilarityThreshold) {
      return { limited: true, segments: [] };
    }
    const selected = new Set(rows.flatMap((row) => row.segmentIds));
    const expanded = new Map<string, (typeof segments)[number]>();
    for (const segment of segments) {
      if (!selected.has(segment.publicId)) {
        continue;
      }
      for (const candidate of segments) {
        if (Math.abs(candidate.position - segment.position) <= 1) {
          expanded.set(candidate.publicId, candidate);
        }
      }
    }
    const ordered = [...expanded.values()].sort((left, right) => left.position - right.position);
    return contextFromSegments(ordered);
  }

  private async translateQuestionIntoDetectedLanguage(
    client: OpenAI,
    question: string,
    detectedLanguage: string | null,
  ): Promise<string | null> {
    const normalizedDetectedLanguage = detectedLanguage?.trim();
    if (!normalizedDetectedLanguage || !runtimeConfig.openaiChatModel) {
      return null;
    }
    try {
      const response = await client.chat.completions.create({
        model: runtimeConfig.openaiChatModel,
        messages: [
          {
            role: "system",
            content: `Traduza a pergunta para o idioma ${normalizedDetectedLanguage}. Responda apenas com a traducao.`,
          },
          { role: "user", content: question },
        ],
      });
      const translatedQuestion = response.choices[0]?.message?.content?.trim();
      if (!translatedQuestion || translatedQuestion.toLocaleLowerCase() === question.trim().toLocaleLowerCase()) {
        return null;
      }
      return translatedQuestion.slice(0, 2000);
    } catch {
      logger.error({ code: "question_translation_failed" }, "Falha ao traduzir a pergunta para a busca");
      return null;
    }
  }

  private openAiClient(): OpenAI {
    if (!runtimeConfig.openaiApiKey || !runtimeConfig.openaiChatModel || !runtimeConfig.openaiEmbeddingModel) {
      throw new ApiError(503, "chat_unavailable", "O chat esta indisponivel porque o modelo nao foi configurado.");
    }
    return new OpenAI({ apiKey: runtimeConfig.openaiApiKey });
  }

  private async finishAssistant(
    messageId: string,
    content: string,
    references: Array<{ segmentId: string; startMs: number; endMs: number }>,
  ) {
    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: "complete",
        content,
        segmentRefs: references,
        model: runtimeConfig.openaiChatModel,
      },
    });
  }

  private writeReplay(response: Response, content: string, references: unknown): void {
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.flushHeaders();
    this.writeToken(response, content);
    response.write(`event: done\ndata: ${JSON.stringify({ references: references ?? [], replayed: true })}\n\n`);
    response.end();
  }

  private writeToken(response: Response, text: string): void {
    response.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
  }

  private writeDone(
    response: Response,
    messageId: string,
    references: Array<{ segmentId: string; startMs: number; endMs: number }>,
  ): void {
    response.write(`event: done\ndata: ${JSON.stringify({ messageId, references })}\n\n`);
    response.end();
  }

  private async ownedConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) {
      throw new ApiError(404, "not_found", "Conversa nao encontrada.");
    }
    assertOwner(conversation.ownerId, userId);
    const video = await this.prisma.video.findUnique({ where: { id: conversation.videoId } });
    if (!video || video.deletedAt || video.deletionRequestedAt) {
      throw new ApiError(404, "not_found", "Conversa nao encontrada.");
    }
    return conversation;
  }

  private async ownedVideo(userId: string, videoId: string) {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.deletedAt || video.status === "deleted") {
      throw new ApiError(404, "not_found", "Video nao encontrado.");
    }
    assertOwner(video.ownerId, userId);
    return video;
  }
}

function presentMessage(message: {
  id: string;
  role: string;
  content: string;
  status: string;
  segmentRefs: unknown;
  createdAt: Date;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    references: message.segmentRefs ?? [],
    createdAt: message.createdAt,
  };
}

function splitReferences(content: string): { text: string; segmentIds: string[] } {
  const lines = content.split("\n");
  let refIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]?.trim().startsWith("REFS:")) {
      refIndex = index;
      break;
    }
  }
  if (refIndex < 0) {
    return { text: content.trim(), segmentIds: [] };
  }
  const segmentIds = (lines[refIndex] ?? "").replace("REFS:", "").trim().split(/\s+/).filter(Boolean);
  const text = lines.filter((_, index) => index !== refIndex).join("\n").trim();
  return { text, segmentIds };
}

function transcriptFitsInChatContext(
  segments: Array<{ originalText: string }>,
): boolean {
  const transcriptCharacters = contextCharacterCount(segments);
  return transcriptCharacters > 0 && transcriptCharacters <= maximumChatContextCharacters;
}

function contextFromSegments(
  segments: Array<{ publicId: string; startMs: number; endMs: number; originalText: string }>,
): { limited: boolean; segments: Array<{ id: string; startMs: number; endMs: number; text: string }> } {
  const context: Array<{ id: string; startMs: number; endMs: number; text: string }> = [];
  let characters = 0;
  for (const segment of segments) {
    const text = segment.originalText.trim();
    if (!text) {
      continue;
    }
    const charactersWithSegment = characters > 0 ? characters + 1 + text.length : text.length;
    if (characters > 0 && charactersWithSegment > maximumChatContextCharacters) {
      break;
    }
    context.push({
      id: segment.publicId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.originalText,
    });
    characters = charactersWithSegment;
  }
  if (context.length === 0) {
    return { limited: true, segments: [] };
  }
  return { limited: false, segments: context };
}

function contextCharacterCount(segments: Array<{ originalText: string }>): number {
  let characters = 0;
  for (const segment of segments) {
    const text = segment.originalText.trim();
    if (!text) {
      continue;
    }
    characters += characters > 0 ? text.length + 1 : text.length;
  }
  return characters;
}

function toVectorLiteral(values: number[]): string {
  if (values.length !== runtimeConfig.openaiEmbeddingDimensions || values.some((value) => !Number.isFinite(value))) {
    throw new ApiError(502, "embedding_invalid", "O vetor de busca tem dimensao inesperada.");
  }
  return `[${values.join(",")}]`;
}
