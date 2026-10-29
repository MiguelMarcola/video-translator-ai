import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("h-12 w-full rounded-xl border border-border bg-background px-3 text-base outline-none", className)}
      {...props}
    />
  );
}
