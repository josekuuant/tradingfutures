"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  STRATEGY_SECTIONS,
  type Strategy,
  type StrategyFormData,
  type StrategySectionField,
} from "@/types/strategy";
import {
  X,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface StrategyEditorProps {
  strategy: Strategy | null; // null = create mode
  onSave: (data: StrategyFormData) => Promise<void>;
  onClose: () => void;
}

const DEFAULT_VALUES: StrategyFormData = {
  name: "",
  description: "",
  tag: "",
  instrument: "NQ",
  timeframes: ["5m"],
  contextConditions: "",
  entryConditions: "",
  invalidation: "",
  tp1: "",
  tp2: "",
  minRR: 2,
  volatilityFilter: "",
  volumeFilter: "",
  scheduleFilter: "",
  newsFilter: "",
  noTradeRules: "",
  promptTemplate: "",
};

export function StrategyEditor({
  strategy,
  onSave,
  onClose,
}: StrategyEditorProps) {
  const isEdit = strategy !== null;
  const [form, setForm] = useState<StrategyFormData>(DEFAULT_VALUES);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["general"])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (strategy) {
      setForm({
        name: strategy.name,
        description: strategy.description,
        tag: strategy.tag,
        instrument: strategy.instrument,
        timeframes: strategy.timeframes,
        contextConditions: strategy.contextConditions,
        entryConditions: strategy.entryConditions,
        invalidation: strategy.invalidation,
        tp1: strategy.tp1,
        tp2: strategy.tp2,
        minRR: strategy.minRR,
        volatilityFilter: strategy.volatilityFilter,
        volumeFilter: strategy.volumeFilter,
        scheduleFilter: strategy.scheduleFilter,
        newsFilter: strategy.newsFilter,
        noTradeRules: strategy.noTradeRules,
        promptTemplate: strategy.promptTemplate,
      });
      // Open all sections that have data
      const filled = new Set(["general"]);
      if (strategy.contextConditions || strategy.entryConditions || strategy.invalidation)
        filled.add("conditions");
      if (strategy.tp1 || strategy.tp2) filled.add("risk");
      if (strategy.volatilityFilter || strategy.volumeFilter || strategy.scheduleFilter || strategy.newsFilter)
        filled.add("filters");
      if (strategy.noTradeRules) filled.add("notrade");
      if (strategy.promptTemplate) filled.add("prompt");
      setOpenSections(filled);
    }
  }, [strategy]);

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const updateField = useCallback(
    (key: keyof StrategyFormData, value: unknown) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setError(null);
    },
    []
  );

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Strategy name is required");
      return;
    }
    if (form.timeframes.length === 0) {
      setError("Select at least one timeframe");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-6">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">
            {isEdit ? "Edit Strategy" : "New Strategy"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Sections ────────────────────────────────────── */}
        <div className="max-h-[70vh] overflow-y-auto">
          {STRATEGY_SECTIONS.map((section) => {
            const isOpen = openSections.has(section.id);

            return (
              <div key={section.id} className="border-b border-border/50">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-accent/30"
                >
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {section.label}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {isOpen && (
                  <div className="space-y-4 px-5 pb-4">
                    {section.fields.map((field) => (
                      <FieldRenderer
                        key={field.key}
                        field={field}
                        value={form[field.key]}
                        onChange={(val) => updateField(field.key, val)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <div>
            {error && (
              <p className="text-xs text-danger">{error}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isEdit ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Field renderer ──────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: StrategySectionField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const baseInputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary";

  switch (field.type) {
    case "text":
      return (
        <div className="space-y-1.5">
          <Label field={field} />
          <input
            type="text"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={baseInputClass}
          />
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          <Label field={field} />
          <input
            type="number"
            value={(value as number) ?? ""}
            onChange={(e) => onChange(Number(e.target.value))}
            placeholder={field.placeholder}
            step="0.1"
            min="0"
            className={cn(baseInputClass, "w-32")}
          />
        </div>
      );

    case "textarea":
      return (
        <div className="space-y-1.5">
          <Label field={field} />
          <textarea
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={field.key === "promptTemplate" ? 8 : 3}
            className={cn(
              baseInputClass,
              "resize-y",
              field.key === "promptTemplate" && "font-mono text-xs"
            )}
          />
        </div>
      );

    case "select":
      return (
        <div className="space-y-1.5">
          <Label field={field} />
          <select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={cn(baseInputClass, "w-40")}
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );

    case "multiselect": {
      const selected = (value as string[]) ?? [];
      return (
        <div className="space-y-1.5">
          <Label field={field} />
          <div className="flex flex-wrap gap-1.5">
            {field.options?.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      onChange(selected.filter((v) => v !== opt.value));
                    } else {
                      onChange([...selected, opt.value]);
                    }
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

function Label({ field }: { field: StrategySectionField }) {
  return (
    <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      {field.label}
      {field.required && <span className="text-danger">*</span>}
    </label>
  );
}
