import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChatThread } from "@/components/chat-thread";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderThread() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatThread conversationId="conversation-1" messages={[]} />
    </QueryClientProvider>,
  );
}

it("mostra a pergunta na hora e ignora um segundo envio", () => {
  const fetchMock = vi.fn(() => new Promise(() => undefined));
  vi.stubGlobal("fetch", fetchMock);
  renderThread();

  fireEvent.change(screen.getByRole("textbox", { name: "Pergunta sobre a fala do vídeo" }), {
    target: { value: "Quem fez a jogada?" },
  });
  const sendButton = screen.getByRole("button", { name: "Enviar" });
  fireEvent.click(sendButton);
  fireEvent.click(screen.getByRole("button", { name: "Enviando" }));

  expect(screen.getByText("Quem fez a jogada?")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Respondendo");
  expect(screen.getByRole("button", { name: "Enviando" })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("envia com Enter e preserva a quebra com Shift+Enter", () => {
  const fetchMock = vi.fn(() => new Promise(() => undefined));
  vi.stubGlobal("fetch", fetchMock);
  renderThread();
  const questionField = screen.getByRole("textbox", { name: "Pergunta sobre a fala do vídeo" });

  fireEvent.change(questionField, { target: { value: "Primeira linha" } });
  fireEvent.keyDown(questionField, { key: "Enter", shiftKey: true });
  expect(fetchMock).not.toHaveBeenCalled();

  fireEvent.keyDown(questionField, { key: "Enter" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
