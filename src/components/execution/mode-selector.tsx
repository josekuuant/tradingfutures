"use client";

import { cn } from "@/lib/utils";
import type { ExecutionMode } from "@/types/execution";
import {
  ShieldOff,
  Eye,
  FlaskConical,
  UserCheck,
  Zap,
  Bot,
} from "lucide-react";

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
    value: "dry_run",
    label: "Dry Run",
    description: "Simulates orders, logs but doesn't send",
    icon: FlaskConical,
    color: "text-warning",
  },
  {
    value: "manual_approval",
    label: "Manual Approval",
    description: "Queues orders, requires your confirmation",
    icon: UserCheck,
    color: "text-warning",
  },
  {
    value: "semi_auto",
    label: "Semi-Auto",
    description: "Executes if all guardrails pass",
    icon: Zap,
    color: "text-danger",
  },
  {
    value: "full_auto",
    label: "Full Auto",
    description: "Automatic execution — use with caution",
    icon: Bot,
    color: "text-danger",
  },
];

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Execution Mode
      </p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {MODES.map((m) => {
          const isActive = mode === m.value;
          const Icon = m.icon;
          const isDangerous =
            m.value === "semi_auto" || m.value === "full_auto";

          return (
            <button
              key={m.value}
              onClick={() => onChange(m.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                isActive && isDangerous
                  ? "border-danger/40 bg-danger/5"
                  : isActive
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
