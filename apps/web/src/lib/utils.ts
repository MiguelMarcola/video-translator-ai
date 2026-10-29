import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(timeMs: number): string {
  const bounded = Math.max(0, Math.floor(timeMs / 1000));
  const hours = Math.floor(bounded / 3600);
  const minutes = Math.floor((bounded % 3600) / 60);
  const seconds = bounded % 60;
  const minuteText = String(minutes).padStart(2, "0");
  const secondText = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minuteText}:${secondText}`;
  }
  return `${minutes}:${secondText}`;
}
