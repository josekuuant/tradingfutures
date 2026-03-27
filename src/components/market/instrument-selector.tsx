"use client";

import { cn } from "@/lib/utils";
import type { Instrument } from "@/types/market";

const INSTRUMENTS: { value: Instrument; label: string; sub: string }[] = [
  { value: "NQ", label: "NQ", sub: "E-mini Nasdaq" },
  { value: "MNQ", label: "MNQ", sub: "Micro Nasdaq" },
];

interface InstrumentSelectorProps {
  value: Instrument;
  onChange: (i: Instrument) => void;
}

export function InstrumentSelector({
  value,
  onChange,
}: InstrumentSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {INSTRUMENTS.map((inst) => (
        <button
          key={inst.value}
          onClick={() => onChange(inst.value)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all",
            value === inst.value
              ? "border-primary/50 bg-primary/5"
              : "border-border hover:border-border/80 hover:bg-accent/30"
          )}
        >
          <span
            className={cn(
              "text-sm font-semibold",
              value === inst.value
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            {inst.label}
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {inst.sub}
          </span>
        </button>
      ))}
    </div>
  );
}
