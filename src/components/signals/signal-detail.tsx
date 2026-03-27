"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Signal } from "@/types/signal";
import {
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Target,
  FileCode2,
} from "lucide-react";

interface SignalDetailProps {
  signal: Signal;
  onClose: () => void;
}

const ACTION_STYLES = {
  BUY: { text: "text-success", bg: "bg-success/10", border: "border-success/20" },
  SELL: { text: "text-danger", bg: "bg-danger/10", border: "border-danger/20" },
  NO_TRADE: { text: "text-muted-foreground", bg: "bg-muted", border: "border-border" },
} as const;

type Section = "levels" | "reasoning" | "context" | "prompt" | "response" | "audit";

export function SignalDetail({ signal, onClose }: SignalDetailProps) {
  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set<Section>(["levels", "reasoning"])
  );
  const style = ACTION_STYLES[signal.action];
  const confidence = Math.round(signal.confidence * 100);

  const toggle = (s: Section) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-6">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-24 items-center justify-center rounded-md text-sm font-bold",
                style.bg,
                style.text,
                style.border,
                "border"
              )}
            >
              {signal.action.replace("_", " ")}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {signal.instrument} · {signal.timeframe}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(signal.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Confidence + meta strip */}
        <div className="flex items-center gap-6 border-b border-border/50 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Confidence</span>
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    confidence >= 70 ? "bg-success" : confidence >= 40 ? "bg-warning" : "bg-muted-foreground/40"
                  )}
                  style={{ width: `${confidence}%` }}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums">
                {confidence}%
              </span>
            </div>
          </div>

          <MetaChip icon={Target} label={signal.strategyName} />
          <MetaChip icon={FileCode2} label={signal.promptName} />
          <MetaChip icon={Cpu} label={signal.claudeModel} />
          <MetaChip icon={Clock} label={`${signal.durationMs}ms`} />
        </div>

        {/* Sections */}
        <div className="max-h-[65vh] overflow-y-auto">
          {/* Price levels */}
          <Accordion
            label="Price Levels"
            isOpen={openSections.has("levels")}
            onToggle={() => toggle("levels")}
          >
            {signal.action !== "NO_TRADE" && signal.entryPrice ? (
              <div className="grid grid-cols-4 gap-3">
                <LevelBox label="Entry" value={signal.entryPrice} />
                <LevelBox label="Stop Loss" value={signal.stopLoss} variant="danger" />
                <LevelBox label="Take Profit" value={signal.takeProfit} variant="success" />
                <LevelBox label="R:R" value={signal.riskRewardRatio} suffix="x" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50">
                No price levels — {signal.action === "NO_TRADE" ? "no trade signal" : "not provided"}
              </p>
            )}
            {signal.invalidation && (
              <div className="mt-3">
                <p className="text-[10px] font-medium uppercase text-muted-foreground/50">
                  Invalidation
                </p>
                <p className="mt-0.5 text-xs text-foreground/70">
                  {signal.invalidation}
                </p>
              </div>
            )}
            <div className="mt-3">
              <p className="text-[10px] font-medium uppercase text-muted-foreground/50">
                Price at signal
              </p>
              <p className="mt-0.5 font-mono text-xs text-foreground/70">
                {typeof signal.currentPrice === "number"
                  ? signal.currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })
                  : signal.currentPrice}
              </p>
            </div>
          </Accordion>

          {/* Reasoning */}
          <Accordion
            label="Reasoning"
            isOpen={openSections.has("reasoning")}
            onToggle={() => toggle("reasoning")}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
              {signal.reasoning}
            </p>
          </Accordion>

          {/* Market context */}
          <Accordion
            label="Market Context"
            isOpen={openSections.has("context")}
            onToggle={() => toggle("context")}
          >
            {signal.marketContext ? (
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/70">
                {signal.marketContext}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/50">
                No market context provided
              </p>
            )}
          </Accordion>

          {/* User prompt sent */}
          <Accordion
            label="Prompt Sent"
            isOpen={openSections.has("prompt")}
            onToggle={() => toggle("prompt")}
          >
            {signal.systemPromptSent && (
              <div className="mb-3">
                <p className="text-[10px] font-medium uppercase text-muted-foreground/50">
                  System Prompt
                </p>
                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground/60">
                  {signal.systemPromptSent}
                </pre>
              </div>
            )}
            <div>
              <p className="text-[10px] font-medium uppercase text-muted-foreground/50">
                User Prompt
              </p>
              <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground/60">
                {signal.userPromptSent}
              </pre>
            </div>
          </Accordion>

          {/* Raw Claude response */}
          <Accordion
            label="Claude Raw Response"
            isOpen={openSections.has("response")}
            onToggle={() => toggle("response")}
          >
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground/60">
              {signal.rawResponse}
            </pre>
          </Accordion>

          {/* Audit info */}
          <Accordion
            label="Audit"
            isOpen={openSections.has("audit")}
            onToggle={() => toggle("audit")}
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <AuditRow label="Signal ID" value={signal.id} mono />
              <AuditRow label="Strategy ID" value={signal.strategyId} mono />
              <AuditRow label="Prompt ID" value={signal.promptId} mono />
              <AuditRow label="Claude Model" value={signal.claudeModel} />
              <AuditRow label="Duration" value={`${signal.durationMs}ms`} />
              <AuditRow label="Created" value={new Date(signal.createdAt).toISOString()} />
            </div>
          </Accordion>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function MetaChip({
  icon: Icon,
  label,
}: {
  icon: typeof Clock;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-muted-foreground/40" />
      <span className="text-[10px] text-muted-foreground/70 truncate max-w-24">
        {label}
      </span>
    </div>
  );
}

function LevelBox({
  label,
  value,
  variant,
  suffix,
}: {
  label: string;
  value: number | null;
  variant?: "success" | "danger";
  suffix?: string;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      <p className="text-[10px] text-muted-foreground/50">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-sm font-medium tabular-nums",
          variant === "success" && "text-success",
          variant === "danger" && "text-danger",
          !variant && "text-foreground/80"
        )}
      >
        {value != null
          ? `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix ?? ""}`
          : "—"}
      </p>
    </div>
  );
}

function Accordion({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/30">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-accent/20"
      >
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

function AuditRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground/50">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-xs text-foreground/70 truncate",
          mono && "font-mono text-[10px]"
        )}
      >
        {value}
      </p>
    </div>
  );
}
