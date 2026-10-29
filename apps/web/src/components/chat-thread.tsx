import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { TemporalReference } from "@/lib/api";

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  status: string;
  references: TemporalReference[];
};

type PendingExchange = {
  question: string;
  answer: string;
  references: TemporalReference[];
  failed: boolean;
};

export function ChatThread({
  conversationId,
  messages,
}: {
  conversationId: string;
  messages: ChatMessage[];
}) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingExchange, setPendingExchange] = useState<PendingExchange | null>(null);
  const sendInProgress = useRef(false);
  const thread = useRef<HTMLDivElement>(null);
  const storedQuestionIndex = pendingExchange ? lastMatchingUserMessageIndex(messages, pendingExchange.question) : -1;
  const visibleMessages = messages.filter((message, index) => {
    if (message.role === "assistant" && message.status === "streaming" && message.content.trim().length === 0) {
      return false;
    }
    if (storedQuestionIndex >= 0 && (index === storedQuestionIndex || index === storedQuestionIndex + 1)) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    const messageList = thread.current;
    if (!messageList) {
      return;
    }
    messageList.scrollTop = messageList.scrollHeight;
  }, [visibleMessages.length, pendingExchange?.question, pendingExchange?.answer]);

  const sendQuestion = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = question.trim();
    if (!conversationId || !content || sendInProgress.current) {
      return;
    }
    sendInProgress.current = true;
    setSending(true);
    setQuestion("");
    setPendingExchange({ question: content, answer: "", references: [], failed: false });
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Dev-User-Id": window.localStorage.getItem("videoTranslateDevUserId") ?? "local-dev",
          },
          body: JSON.stringify({
            content,
            clientMessageId: `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          }),
        },
      );
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setPendingExchange({
          question: content,
          answer: payload?.message ?? "Nao foi possivel enviar a pergunta.",
          references: [],
          failed: true,
        });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const eventName = event.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
          const dataLine = event.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (!dataLine) {
            continue;
          }
          const data = JSON.parse(dataLine) as { text?: string; references?: TemporalReference[]; message?: string };
          if (eventName === "token" && data.text) {
            setPendingExchange((current) =>
              current ? { ...current, answer: current.answer + data.text } : current,
            );
          }
          if (eventName === "done") {
            setPendingExchange((current) => (current ? { ...current, references: data.references ?? [] } : current));
          }
          if (eventName === "error") {
            setPendingExchange((current) =>
              current
                ? { ...current, answer: data.message ?? "A resposta foi interrompida.", failed: true }
                : current,
            );
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      setPendingExchange((current) => (current?.failed ? current : null));
    } catch {
      setPendingExchange({
        question: content,
        answer: "Nao foi possivel enviar a pergunta.",
        references: [],
        failed: true,
      });
    } finally {
      sendInProgress.current = false;
      setSending(false);
    }
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
        {visibleMessages.length === 0 && !pendingExchange ? (
          <p className="m-auto text-sm text-muted">Nenhuma pergunta ainda.</p>
        ) : null}
        {visibleMessages.map((message) => (
          <ChatBubble key={message.id} role={message.role} content={message.content} />
        ))}
        {pendingExchange ? (
          <>
            <ChatBubble role="user" content={pendingExchange.question} />
            <ChatBubble
              role="assistant"
              content={pendingExchange.answer}
              pending={!pendingExchange.failed && pendingExchange.answer.length === 0}
              failed={pendingExchange.failed}
            />
          </>
        ) : null}
      </div>
      <form className="mt-3 flex items-end gap-2 border-t border-border pt-3" onSubmit={(event) => void sendQuestion(event)}>
        <Textarea
          id="question"
          aria-label="Pergunta sobre a fala do vídeo"
          placeholder="Escreva uma pergunta"
          value={question}
          disabled={sending}
          rows={2}
          className="min-h-12 flex-1"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={submitOnEnter}
        />
        <Button type="submit" disabled={sending || question.trim().length === 0} aria-busy={sending}>
          {sending ? "Enviando" : "Enviar"}
        </Button>
      </form>
    </div>
  );
}

function lastMatchingUserMessageIndex(messages: ChatMessage[], question: string): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && message.content === question) {
      return index;
    }
  }
  return -1;
}

function ChatBubble({
  role,
  content,
  pending = false,
  failed = false,
}: {
  role: string;
  content: string;
  pending?: boolean;
  failed?: boolean;
}) {
  const fromUser = role === "user";
  return (
    <article className={fromUser ? "ml-8 flex flex-col items-end" : "mr-8 flex flex-col items-start"}>
      <p className="mb-1 text-xs font-medium text-muted">{fromUser ? "Você" : "Assistente"}</p>
      <div
        className={
          fromUser
            ? "max-w-full rounded-2xl rounded-br-md bg-foreground px-3 py-2 text-sm leading-6 text-background"
            : "max-w-full rounded-2xl rounded-bl-md bg-accent px-3 py-2 text-sm leading-6"
        }
      >
        {pending ? (
          <p role="status" className="flex h-6 items-center">
            <span className="sr-only">Respondendo</span>
            <span className="inline-flex items-end gap-1" aria-hidden="true">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
          </p>
        ) : (
          <p className={failed ? "text-destructive" : "whitespace-pre-wrap"}>{content}</p>
        )}
      </div>
    </article>
  );
}
