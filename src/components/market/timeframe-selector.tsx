"use client";

import { cn } from "@/lib/utils";
import type { Timeframe } from "@/types/market";

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1H" },
  { value: "1D", label: "1D" },
];

interface TimeframeSelectorProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
}

export function TimeframeSelector({ value, onChange }: TimeframeSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf.value}
          onClick={() => onChange(tf.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-all",
            value === tf.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}
