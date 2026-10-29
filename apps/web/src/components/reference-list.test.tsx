import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ReferenceList } from "@/components/reference-list";
import type { TemporalReference } from "@/lib/api";

function reference(segmentId: string, startSeconds: number, endSeconds: number): TemporalReference {
  return { segmentId, startMs: startSeconds * 1000, endMs: endSeconds * 1000 };
}

it("agrupa trechos contínuos em um intervalo", () => {
  const seen: number[] = [];
  render(
    <ReferenceList
      references={[
        reference("seg-0000", 94, 99),
        reference("seg-0001", 107, 112),
        reference("seg-0002", 120, 188),
      ]}
      onSeek={(startMs) => seen.push(startMs)}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "1:34–3:08" }));
  expect(seen).toEqual([94_000]);
  expect(screen.queryByRole("button", { name: "Ver trechos" })).toBeNull();
  expect(screen.queryByRole("button", { name: "1:47" })).toBeNull();
});

it("mostra um salto para cada momento distante", () => {
  render(
    <ReferenceList
      references={[
        reference("seg-0000", 10, 12),
        reference("seg-0001", 80, 82),
        reference("seg-0002", 160, 162),
        reference("seg-0003", 240, 242),
      ]}
      onSeek={() => undefined}
    />,
  );

  expect(screen.getByRole("button", { name: "0:10–0:12" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "1:20–1:22" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "2:40–2:42" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "4:00–4:02" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ver trechos" })).toBeNull();
});
