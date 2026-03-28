"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Strategy } from "@/types/strategy";
import {
  Power,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";

interface StrategyCardProps {
  strategy: Strategy;
  onEdit: (id: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function StrategyCard({
  strategy,
  onEdit,
  onActivate,
  onDeactivate,
  onDuplicate,
  onDelete,
}: StrategyCardProps) {
  const [expanded, setExpanded] = useState(false);

  const filledSections = [
    strategy.contextConditions && "Context",
    strategy.entryConditions && "Entry",
    strategy.invalidation && "Invalidation",
    strategy.tp1 && "TP1",
    strategy.noTradeRules && "No-Trade",
    strategy.promptTemplate && "Prompt",
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-all",
        strategy.isActive
          ? "border-primary/30 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.15)]"
          : "border-border"
      )}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Active indicator */}
          <div
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              strategy.isActive
                ? "bg-primary shadow-[0_0_6px_hsl(var(--primary))]"
                : "bg-muted-foreground/30"
            )}
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">
                {strategy.name}
              </h3>
              {strategy.isActive && (
                <Badge variant="default">Active</Badge>
              )}
              {strategy.tag && (
                <Badge variant="muted">{strategy.tag}</Badge>
              )}
            </div>
            {strategy.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {strategy.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          {/* Instrument + timeframes */}
          <span className="mr-2 text-xs text-muted-foreground">
            {strategy.instrument} · {strategy.timeframes.join(", ")}
          </span>

          <ActionButton
            icon={Power}
            title={strategy.isActive ? "Deactivate" : "Activate"}
            onClick={() =>
              strategy.isActive
                ? onDeactivate(strategy.id)
                : onActivate(strategy.id)
            }
            className={strategy.isActive ? "text-primary" : ""}
          />
          <ActionButton
            icon={Pencil}
            title="Edit"
            onClick={() => onEdit(strategy.id)}
          />
          <ActionButton
            icon={Copy}
            title="Duplicate"
            onClick={() => onDuplicate(strategy.id)}
          />
          <ActionButton
            icon={Trash2}
            title="Delete"
            onClick={() => onDelete(strategy.id)}
            className="hover:text-danger"
          />

          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* ── Collapsed summary ───────────────────────────────── */}
      {!expanded && filledSections.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-5 py-2.5">
          {filledSections.map((s) => (
            <span
              key={s}
              className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {s}
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground/40">
            R:R ≥ {strategy.minRR}
          </span>
        </div>
      )}

      {/* ── Expanded detail ─────────────────────────────────── */}
      {expanded && (
        <div className="space-y-0 border-t border-border/50">
          <DetailSection label="Context Conditions" value={strategy.contextConditions} />
          <DetailSection label="Entry Conditions" value={strategy.entryConditions} />
          <DetailSection label="Invalidation" value={strategy.invalidation} />
          <div className="grid grid-cols-3 gap-0 divide-x divide-border/30">
            <DetailSection label="TP1" value={strategy.tp1} compact />
            <DetailSection label="TP2" value={strategy.tp2} compact />
            <DetailSection label="Min R:R" value={String(strategy.minRR)} compact />
          </div>
          <DetailSection label="Volatility Filter" value={strategy.volatilityFilter} />
          <DetailSection label="Volume Filter" value={strategy.volumeFilter} />
          <DetailSection label="Schedule Filter" value={strategy.scheduleFilter} />
          <DetailSection label="News Filter" value={strategy.newsFilter} />
          <DetailSection label="No-Trade Rules" value={strategy.noTradeRules} />
          {strategy.promptTemplate && (
            <DetailSection label="Claude Prompt (inline)" value={strategy.promptTemplate} mono />
          )}
          <div className="px-4 py-2 border-t border-border/30">
            <a
              href="/prompt-studio"
              className="text-[10px] text-primary hover:underline"
            >
              Edit prompts in detail →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function ActionButton({
  icon: Icon,
  title,
  onClick,
  className,
}: {
  icon: typeof Pencil;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function DetailSection({
  label,
  value,
  compact,
  mono,
}: {
  label: string;
  value: string;
  compact?: boolean;
  mono?: boolean;
}) {
  if (!value) {
    return (
      <div className={cn("px-5 py-2.5", compact && "px-4 py-2")}>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
          {label}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/30 italic">
          Not defined
        </p>
      </div>
    );
  }

  return (
    <div className={cn("px-5 py-2.5", compact && "px-4 py-2")}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80",
          mono && "font-mono text-[11px]"
        )}
      >
        {value}
      </p>
    </div>
  );
}
