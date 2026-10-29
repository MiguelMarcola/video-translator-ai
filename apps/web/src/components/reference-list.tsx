import { TimestampButton } from "@/components/timestamp-button";
import type { TemporalReference } from "@/lib/api";
import { formatReferenceMoment, groupReferencesIntoMoments } from "@/lib/reference-moments";

export function ReferenceList({
  references,
  onSeek,
}: {
  references: TemporalReference[];
  onSeek: (startMs: number) => void;
}) {
  const moments = groupReferencesIntoMoments(references);
  if (moments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {moments.map((moment) => (
        <TimestampButton
          key={`${moment.startMs}-${moment.endMs}`}
          startMs={moment.startMs}
          label={formatReferenceMoment(moment)}
          onSeek={onSeek}
        />
      ))}
    </div>
  );
}
