"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Prompt } from "@/types/prompt";
import {
  Power,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  History,
  TestTube,
} from "lucide-react";

interface PromptCardProps {
  prompt: Prompt;
  onEdit: (id: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onViewVersions: (id: string) => void;
  onTest: (id: string) => void;
}

export function PromptCard({
  prompt,
  onEdit,
  onActivate,
  onDeactivate,
  onDuplicate,
  onDelete,
  onViewVersions,
  onTest,
}: PromptCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-all",
        prompt.isActive
          ? "border-primary/30 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.15)]"
          : "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              prompt.isActive
                ? "bg-primary shadow-[0_0_6px_hsl(var(--primary))]"
                : "bg-muted-foreground/30"
            )}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{prompt.name}</h3>
              {prompt.isActive && <Badge variant="default">Active</Badge>}
              {prompt.tag && <Badge variant="muted">{prompt.tag}</Badge>}
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                v{prompt.version}
              </span>
            </div>
            {prompt.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {prompt.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-4">
          <ActionBtn icon={TestTube} title="Test" onClick={() => onTest(prompt.id)} />
          <ActionBtn icon={History} title="Versions" onClick={() => onViewVersions(prompt.id)} />
          <ActionBtn
            icon={Power}
            title={prompt.isActive ? "Deactivate" : "Activate"}
            onClick={() => prompt.isActive ? onDeactivate(prompt.id) : onActivate(prompt.id)}
            className={prompt.isActive ? "text-primary" : ""}
          />
          <ActionBtn icon={Pencil} title="Edit" onClick={() => onEdit(prompt.id)} />
          <ActionBtn icon={Copy} title="Duplicate" onClick={() => onDuplicate(prompt.id)} />
          <ActionBtn icon={Trash2} title="Delete" onClick={() => onDelete(prompt.id)} className="hover:text-danger" />
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Summary chips */}
      {!expanded && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/50 px-5 py-2.5">
          {prompt.systemPrompt && <Chip label="System" />}
          <Chip label="User Prompt" active />
          {prompt.outputSchema && <Chip label="Output Schema" />}
          {prompt.outputValidationRules && <Chip label="Validation" />}
        </div>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border/50">
          <PromptSection label="System Prompt" value={prompt.systemPrompt} mono />
          <PromptSection label="User Prompt Template" value={prompt.userPromptTemplate} mono />
          <PromptSection label="Output Schema" value={prompt.outputSchema} mono />
          <PromptSection label="Validation Rules" value={prompt.outputValidationRules} />
        </div>
      )}
    </div>
  );
}

function ActionBtn({
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

function Chip({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-0.5 text-[10px] font-medium",
        active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

function PromptSection({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="px-5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {label}
      </p>
      {value ? (
        <pre
          className={cn(
            "mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80",
            mono && "font-mono text-[11px]"
          )}
        >
          {value}
        </pre>
      ) : (
        <p className="mt-1 text-xs italic text-muted-foreground/30">Not defined</p>
      )}
    </div>
  );
}
