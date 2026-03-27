"use client";

import { cn } from "@/lib/utils";
import type { ExecutionMode } from "@/types/execution";
import { ShieldOff, Eye, FileText, UserCheck } from "lucide-react";

interface ModeSelectorProps {
  mode: ExecutionMode;
  onChange: (mode: ExecutionMode) => void;
}

const MODES: {
  value: ExecutionMode;
  label: string;
  description: string;
  icon: typeof Eye;
  color: string;
}[] = [
  {
    value: "disabled",
    label: "Disabled",
    description: "No execution capabilities",
    icon: ShieldOff,
    color: "text-muted-foreground",
  },
  {
    value: "monitor",
    label: "Monitor",
    description: "Read-only: account, positions, orders",
    icon: Eye,
    color: "text-primary",
  },
  {
    value: "paper",
    label: "Paper",
    description: "Simulated orders, no real execution",
    icon: FileText,
    color: "text-warning",
  },
  {
    value: "manual_confirm",
    label: "Manual Confirm",
    description: "Orders require explicit confirmation",
    icon: UserCheck,
    color: "text-danger",
  },
];

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Execution Mode
      </p>
      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m) => {
          const isActive = mode === m.value;
          const Icon = m.icon;
          return (
            <button
              key={m.value}
              onClick={() => onChange(m.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                isActive
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-accent/20"
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  isActive ? m.color : "text-muted-foreground/40"
                )}
              />
              <div>
                <p
                  className={cn(
                    "text-xs font-semibold",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {m.label}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                  {m.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
