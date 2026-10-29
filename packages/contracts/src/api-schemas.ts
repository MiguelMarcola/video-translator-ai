import { z } from "zod";

export const createVideoBodySchema = z.object({
  youtubeUrl: z.string().trim().min(1).max(500),
  targetLanguage: z.literal("pt-BR"),
});

export const createMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(2000),
  clientMessageId: z.string().trim().min(8).max(80),
});

export const retryBodySchema = z.object({
  stage: z.enum(["translate", "summarize", "index", "render"]),
});

export const usageEventBodySchema = z.object({
  eventType: z.enum(["timestamp.clicked", "summary.opened", "playback.started"]),
});

export const pythonResultSchema = z.object({
  contractVersion: z.literal("1.0.0"),
  command: z.string(),
  status: z.enum(["succeeded", "failed"]),
  artifacts: z
    .array(
      z.object({
        kind: z.string(),
        path: z.string(),
        contentType: z.string(),
        byteSize: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  segments: z
    .array(
      z.object({
        id: z.string(),
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().positive(),
        text: z.string(),
        translatedText: z.string().optional(),
      }),
    )
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      failureClass: z.enum(["permanent", "transient"]),
    })
    .optional(),
});

export const summaryResponseSchema = z.object({
  overview: z.string().min(1),
  topics: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      segmentIds: z.array(z.string()),
    }),
  ),
  conclusions: z.array(
    z.object({
      text: z.string(),
      segmentIds: z.array(z.string()),
    }),
  ),
});

export type PythonResult = z.infer<typeof pythonResultSchema>;
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;
