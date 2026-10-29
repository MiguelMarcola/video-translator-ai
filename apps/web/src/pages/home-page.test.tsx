import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it } from "vitest";
import { HomePage } from "@/pages/home-page";
import { TimestampButton } from "@/components/timestamp-button";

function renderHome() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("mostra apenas portugues do Brasil e o limite da fala transcrita", () => {
  renderHome();
  expect(screen.getByLabelText("URL do vídeo")).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Português (Brasil)" })).toBeInTheDocument();
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByText(/fala transcrita/i)).toBeInTheDocument();
});

it("move o player pelo timestamp informado", () => {
  const seen: number[] = [];
  render(<TimestampButton startMs={12500} onSeek={(startMs) => seen.push(startMs)} />);
  screen.getByRole("button", { name: "0:12" }).click();
  expect(seen).toEqual([12500]);
});
