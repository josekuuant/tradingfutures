"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Prompt, PromptFormData } from "@/types/prompt";
import { TEMPLATE_VARIABLES, DEFAULT_OUTPUT_SCHEMA } from "@/types/prompt";
import {
  X,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
  Variable,
  FileCode2,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";

interface PromptEditorProps {
  prompt: Prompt | null;
  onSave: (data: PromptFormData) => Promise<void>;
  onClose: () => void;
}

const DEFAULT_VALUES: PromptFormData = {
  name: "",
  description: "",
  tag: "",
  systemPrompt: "",
  userPromptTemplate: "",
  outputSchema: DEFAULT_OUTPUT_SCHEMA,
  outputValidationRules: "",
};

type Section = "meta" | "system" | "user" | "output" | "variables";

export function PromptEditor({ prompt, onSave, onClose }: PromptEditorProps) {
  const isEdit = prompt !== null;
  const [form, setForm] = useState<PromptFormData>(DEFAULT_VALUES);
  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set<Section>(["meta", "user"])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prompt) {
      setForm({
        name: prompt.name,
        description: prompt.description,
        tag: prompt.tag,
        systemPrompt: prompt.systemPrompt,
        userPromptTemplate: prompt.userPromptTemplate,
        outputSchema: prompt.outputSchema,
        outputValidationRules: prompt.outputValidationRules,
      });
      const open = new Set<Section>(["meta", "user"]);
      if (prompt.systemPrompt) open.add("system");
      if (prompt.outputSchema || prompt.outputValidationRules) open.add("output");
      setOpenSections(open);
    }
  }, [prompt]);

  const toggle = useCallback((s: Section) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }, []);

  const update = useCallback((key: keyof PromptFormData, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const insertVariable = useCallback(
    (varKey: string) => {
      update(
        "userPromptTemplate",
        form.userPromptTemplate + `{{${varKey}}}`
      );
    },
    [form.userPromptTemplate, update]
  );

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.userPromptTemplate.trim()) { setError("User prompt is required"); return; }
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

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-6">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              {isEdit ? "Edit Prompt" : "New Prompt"}
            </h2>
            {isEdit && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                v{prompt.version}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto">
          {/* ── Meta ──────────────────────────────────────── */}
          <AccordionSection
            label="General"
            icon={MessageSquare}
            isOpen={openSections.has("meta")}
            onToggle={() => toggle("meta")}
          >
            <div className="space-y-3">
              <Field label="Name" required>
                <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. NQ Signal Generator v2" className={inputClass} />
              </Field>
              <Field label="Description">
                <input type="text" value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Brief purpose of this prompt..." className={inputClass} />
              </Field>
              <Field label="Tag">
                <input type="text" value={form.tag} onChange={(e) => update("tag", e.target.value)} placeholder="e.g. signals, analysis, bias" className={cn(inputClass, "w-48")} />
              </Field>
            </div>
          </AccordionSection>

          {/* ── System Prompt ─────────────────────────────── */}
          <AccordionSection
            label="System Prompt"
            icon={ShieldCheck}
            isOpen={openSections.has("system")}
            onToggle={() => toggle("system")}
          >
            <Field label="System instructions for Claude" hint="Sets the AI's role and behavior constraints">
              <textarea
                value={form.systemPrompt}
                onChange={(e) => update("systemPrompt", e.target.value)}
                placeholder="You are an expert NQ/MNQ futures analyst..."
                rows={6}
                className={cn(inputClass, "resize-y font-mono text-xs leading-relaxed")}
              />
            </Field>
          </AccordionSection>

          {/* ── User Prompt Template ──────────────────────── */}
          <AccordionSection
            label="User Prompt Template"
            icon={FileCode2}
            isOpen={openSections.has("user")}
            onToggle={() => toggle("user")}
          >
            <Field label="Prompt template with injectable variables" required hint="Use {{variable_name}} syntax">
              <textarea
                value={form.userPromptTemplate}
                onChange={(e) => update("userPromptTemplate", e.target.value)}
                placeholder={`Analyze the current {{instrument}} market on the {{timeframe}} timeframe.\n\nCurrent price: {{current_price}}\nVWAP: {{vwap}}\n\nRecent candles:\n{{ohlcv_data}}\n\nBased on the strategy conditions:\n{{context_conditions}}\n{{entry_conditions}}\n\nProvide a trading signal...`}
                rows={12}
                className={cn(inputClass, "resize-y font-mono text-xs leading-relaxed")}
              />
            </Field>
          </AccordionSection>

          {/* ── Variables Reference ───────────────────────── */}
          <AccordionSection
            label="Variable Reference"
            icon={Variable}
            isOpen={openSections.has("variables")}
            onToggle={() => toggle("variables")}
          >
            <div className="grid grid-cols-2 gap-1">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => insertVariable(v.key)}
                  className="flex items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50"
                >
                  <code className="text-xs text-primary">{`{{${v.key}}}`}</code>
                  <span className="ml-2 text-[10px] text-muted-foreground/60 truncate">
                    {v.description}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground/40">
              Click a variable to insert it at the end of the user prompt
            </p>
          </AccordionSection>

          {/* ── Output Schema ─────────────────────────────── */}
          <AccordionSection
            label="Expected Output"
            icon={FileCode2}
            isOpen={openSections.has("output")}
            onToggle={() => toggle("output")}
          >
            <div className="space-y-3">
              <Field label="Output JSON Schema" hint="The JSON structure Claude should return">
                <textarea
                  value={form.outputSchema}
                  onChange={(e) => update("outputSchema", e.target.value)}
                  placeholder={DEFAULT_OUTPUT_SCHEMA}
                  rows={8}
                  className={cn(inputClass, "resize-y font-mono text-xs leading-relaxed")}
                />
              </Field>
              <Field label="Validation Rules" hint="Rules to validate Claude's response">
                <textarea
                  value={form.outputValidationRules}
                  onChange={(e) => update("outputValidationRules", e.target.value)}
                  placeholder="- action must be BUY, SELL, or NO_TRADE&#10;- confidence must be between 0 and 1&#10;- reasoning must be non-empty&#10;- if action is BUY or SELL, entry_price/stop_loss/take_profit are required"
                  rows={4}
                  className={cn(inputClass, "resize-y text-xs")}
                />
              </Field>
            </div>
          </AccordionSection>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <div>{error && <p className="text-xs text-danger">{error}</p>}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {isEdit ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function AccordionSection({
  label,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  icon: typeof MessageSquare;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/50">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-accent/30"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
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

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {label}
          {required && <span className="text-danger">*</span>}
        </label>
        {hint && (
          <p className="text-[10px] text-muted-foreground/50">{hint}</p>
        )}
      </div>
      {children}
    </div>
  );
}
