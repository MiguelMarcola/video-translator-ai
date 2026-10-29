import { formatTimestamp } from "@/lib/utils";

export function TimestampButton({
  startMs,
  label,
  onSeek,
}: {
  startMs: number;
  label?: string;
  onSeek: (startMs: number) => void;
}) {
  return (
    <button
      type="button"
      className="rounded-full bg-accent px-2.5 py-1 text-sm font-medium text-primary"
      onClick={() => onSeek(startMs)}
    >
      {label ?? formatTimestamp(startMs)}
    </button>
  );
}
