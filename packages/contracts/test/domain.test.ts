import { describe, expect, it } from "vitest";
import { assertAuthConfiguration, AuthConfigurationError, parseDevUserId } from "../src/auth-policy";
import { AccessDeniedError, assertOwner, buildChatMessages, buildChatTranscriptContext, buildPythonArguments, buildTranscriptChunks, canWriteArtifacts, classifyStageFailure, isInsideDirectory, isPermanentExitCode, nextStages, resolveSegmentReferences, toPlainChatProse } from "../src/domain";
import { requestFingerprint } from "../src/idempotency";
import { normalizeYouTubeUrl } from "../src/youtube-url";

describe("normalizeYouTubeUrl", () => {
  it("aceita um video e descarta parametros de playlist", () => {
    const result = normalizeYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123");
    expect(result).toEqual({
      ok: true,
      videoId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("aceita youtu.be e shorts", () => {
    expect(normalizeYouTubeUrl("https://youtu.be/dQw4w9WgXcQ").ok).toBe(true);
    expect(normalizeYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ").ok).toBe(true);
  });

  it("rejeita playlist, host externo e destino interno", () => {
    expect(normalizeYouTubeUrl("https://www.youtube.com/playlist?list=PL123").code).toBe("playlist");
    expect(normalizeYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ").code).toBe("unsupported_host");
    expect(normalizeYouTubeUrl("http://127.0.0.1/watch?v=dQw4w9WgXcQ").code).toBe("unsupported_host");
    expect(normalizeYouTubeUrl("https://169.254.169.254/latest/meta-data").code).toBe("unsupported_host");
  });
});

describe("autenticacao e autorizacao", () => {
  it("recusa identidade de desenvolvimento em producao", () => {
    expect(() =>
      assertAuthConfiguration({
        nodeEnv: "production",
        authMode: "development",
        allowDevIdentity: "true",
      }),
    ).toThrow(AuthConfigurationError);
  });

  it("exige a flag explicita no ambiente local", () => {
    expect(
      assertAuthConfiguration({
        nodeEnv: "development",
        authMode: "development",
        allowDevIdentity: "true",
      }).mode,
    ).toBe("development");
    expect(parseDevUserId("local-dev")).toBe("local-dev");
    expect(parseDevUserId("../etc")).toBeNull();
  });

  it("nega acesso quando o dono e outro", () => {
    expect(() => assertOwner("user-a", "user-b")).toThrow(AccessDeniedError);
    expect(() => assertOwner("user-a", "user-a")).not.toThrow();
  });
});

describe("retomada, exclusao, referencias e chat", () => {
  it("encadeia etapas e libera resumo sem bloquear a midia", () => {
    expect(nextStages("translate")).toEqual(["write_subtitles"]);
    expect(nextStages("write_subtitles")).toEqual(["summarize", "index"]);
  });

  it("impede gravacao depois da exclusao", () => {
    expect(canWriteArtifacts({ deletionRequestedAt: null, deletedAt: null })).toBe(true);
    expect(canWriteArtifacts({ deletionRequestedAt: new Date(), deletedAt: null })).toBe(false);
  });

  it("resolve apenas segmentos existentes", () => {
    const resolved = resolveSegmentReferences(
      ["seg-0001", "invented", "seg-0001"],
      [
        { id: "seg-0000", startMs: 0, endMs: 1000 },
        { id: "seg-0001", startMs: 1000, endMs: 2000 },
      ],
    );
    expect(resolved).toEqual([{ segmentId: "seg-0001", startMs: 1000, endMs: 2000 }]);
  });

  it("recusa contexto de chat sem trechos da transcricao", () => {
    expect(() => buildChatTranscriptContext([])).toThrow(/transcricao/);
    const context = buildChatTranscriptContext([
      { id: "seg-0000", startMs: 0, endMs: 500, text: "Hello there" },
    ]);
    expect(context).toBe("Hello there");
    expect(context).not.toContain("seg-0000");
  });

  it("mantem argumentos do Python separados", () => {
    expect(buildPythonArguments("python", "/tmp/request.json", "/tmp/result.json")).toEqual([
      "python",
      "-m",
      "media_worker",
      "run",
      "--request",
      "/tmp/request.json",
      "--result",
      "/tmp/result.json",
    ]);
    expect(isPermanentExitCode(4)).toBe(true);
    expect(isPermanentExitCode(10)).toBe(false);
    expect(classifyStageFailure({ exitCode: 10, attempt: 1, maxAttempts: 3, failureClass: "transient" })).toBe("retry");
    expect(classifyStageFailure({ exitCode: 4, attempt: 1, maxAttempts: 3, failureClass: "permanent" })).toBe("fail");
    expect(classifyStageFailure({ exitCode: 10, attempt: 3, maxAttempts: 3, failureClass: "transient" })).toBe("fail");
  });

  it("recusa caminho que escapa do diretorio de trabalho", () => {
    expect(isInsideDirectory("/var/work/video", "/var/work/video/audio.wav")).toBe(true);
    expect(isInsideDirectory("/var/work/video", "/var/work/video/../secret.wav")).toBe(false);
    expect(isInsideDirectory("/var/work/video", "/var/work/video-evil/audio.wav")).toBe(false);
  });

  it("divide a transcricao inteira em blocos e monta o chat com esses trechos", () => {
    const segments = Array.from({ length: 4 }, (_, index) => ({
      id: `seg-${index}`,
      startMs: index * 1000,
      endMs: index * 1000 + 500,
      text: "palavra ".repeat(80),
    }));
    const chunks = buildTranscriptChunks(segments, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flatMap((chunk) => chunk.segmentIds)).toEqual(segments.map((segment) => segment.id));
    const context = buildChatTranscriptContext(segments.map((segment) => ({ ...segment, text: segment.text.trim() })));
    const messages = buildChatMessages({
      targetLanguage: "pt-BR",
      transcriptContext: context,
      history: [{ role: "user", content: "Pergunta anterior" }],
      question: "O que foi dito no final?",
    });
    expect(messages[0]?.content).toContain("palavra");
    expect(messages[0]?.content).toContain("ponto focal");
    expect(messages[0]?.content).toContain("proprio conhecimento");
    expect(messages[0]?.content).toContain("prosa corrida");
    expect(messages[0]?.content).toContain("sem aviso separado");
    expect(messages[0]?.content).not.toContain("somente a transcricao");
    expect(messages[0]?.content).not.toContain("REFS:");
    expect(messages[0]?.content).not.toContain("seg-0");
    expect(messages.at(-1)?.content).toBe("O que foi dito no final?");
  });

  it("tira markdown e marcadores da resposta do chat", () => {
    const plainAnswer = toPlainChatProse(
      "Sim.\n\n- **Custos inesperados:** recursos esquecidos.\n- **Falhas de segurança:** configuracoes incorretas.",
    );
    expect(plainAnswer).not.toContain("**");
    expect(plainAnswer).not.toMatch(/^Sim\./);
    expect(plainAnswer).not.toContain("\n- ");
    expect(plainAnswer).toContain("Custos inesperados: recursos esquecidos.");
  });

  it("estabiliza a chave de idempotencia", () => {
    const first = requestFingerprint({ youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", targetLanguage: "pt-BR" });
    const second = requestFingerprint({ youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", targetLanguage: "pt-BR" });
    expect(first).toBe(second);
  });
});
