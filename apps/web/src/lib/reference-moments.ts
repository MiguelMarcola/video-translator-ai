import type { TemporalReference } from "@/lib/api";
import { formatTimestamp } from "@/lib/utils";

const maximumSilenceBetweenMomentsMs = 20_000;

export type ReferenceMoment = {
  startMs: number;
  endMs: number;
  references: TemporalReference[];
};

export function groupReferencesIntoMoments(references: TemporalReference[]): ReferenceMoment[] {
  const orderedReferences = [...references].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const moments: ReferenceMoment[] = [];
  for (const reference of orderedReferences) {
    const currentMoment = moments.at(-1);
    const silenceBeforeReferenceMs = currentMoment ? reference.startMs - currentMoment.endMs : 0;
    if (!currentMoment || silenceBeforeReferenceMs > maximumSilenceBetweenMomentsMs) {
      moments.push({
        startMs: reference.startMs,
        endMs: Math.max(reference.startMs, reference.endMs),
        references: [reference],
      });
      continue;
    }
    currentMoment.endMs = Math.max(currentMoment.endMs, reference.endMs);
    currentMoment.references.push(reference);
  }
  return moments;
}

export function formatReferenceMoment(moment: ReferenceMoment): string {
  const startLabel = formatTimestamp(moment.startMs);
  const endLabel = formatTimestamp(moment.endMs);
  if (startLabel === endLabel) {
    return startLabel;
  }
  return `${startLabel}–${endLabel}`;
}
