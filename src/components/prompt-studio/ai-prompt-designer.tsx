"use client";

import { useState } from "react";
import { Wand2, Loader2, Check, ArrowRight, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface DesignedPrompt {
  name: string;
  description: string;
  tag: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: string;
  outputValidationRules: string;
}

interface AIPromptDesignerProps {
  onApply: (prompt: DesignedPrompt) => void;
  onClose: () => void;
}

const EXAMPLES = [
  "Analiza la estructura del mercado NQ en 5 minutos y determina si hay un setup de breakout válido basado en la relación con VWAP, overnight levels y volumen. Solo da señal si el riesgo es menor al 2% y el R:R es al menos 1:3.",
  "Evalúa si NQ está en un pullback válido dentro de una tendencia alcista mirando la secuencia de higher lows, la posición respecto al VWAP y la acción del precio en el opening range. Si el contexto no es claro, NO_TRADE.",
  "Determina el bias direccional usando prev day close, overnight range y los primeros 30 minutos de sesión. Si hay divergencia entre estos niveles, marca NO_TRADE. Si hay confluencia, identifica la zona de entrada óptima.",
  "Actúa como un scalper institucional. Busca setups de continuación de momentum solo cuando ATR es alto, el spread es tight, y el precio acaba de romper un rango de consolidación con volumen. Targets cortos, stops ajustados.",
];

export function AIPromptDesigner({ onApply, onClose }: AIPromptDesignerProps) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DesignedPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  const handleDesign = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/prompts/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Design failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-6" role="dialog" aria-modal="true" aria-label="AI Prompt Designer">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Wand2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">AI Prompt Designer</h2>
              <p className="text-xs text-muted-foreground">
                Describe what Claude should analyze — it designs the prompt
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">
            Cancel
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!result ? (
            <>
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  What should Claude analyze and decide?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Analiza si hay un breakout válido basado en VWAP, overnight levels y volumen..."
                  rows={5}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/30 focus:border-primary focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>

              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Examples
                </p>
                <div className="grid gap-2">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setDescription(ex)}
                      className="rounded-md border border-border/50 px-3 py-2 text-left text-xs text-muted-foreground/70 hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

              <button
                onClick={handleDesign}
                disabled={loading || description.trim().length < 10}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Designing prompt...</>
                ) : (
                  <><Sparkles className="h-4 w-4" /> Design with Claude</>
                )}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-success">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">Prompt designed</span>
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h3 className="text-sm font-semibold">{result.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{result.description}</p>
                {result.tag && (
                  <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    {result.tag}
                  </span>
                )}
              </div>

              {/* Full prompt preview */}
              <div className="rounded-lg border border-border">
                <button
                  onClick={() => setShowFullPrompt(!showFullPrompt)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    User Prompt Template
                  </span>
                  {showFullPrompt ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <div className={cn(
                  "overflow-hidden transition-all",
                  showFullPrompt ? "max-h-[500px]" : "max-h-24"
                )}>
                  <pre className="overflow-auto whitespace-pre-wrap px-4 pb-4 text-xs text-foreground/70 font-mono leading-relaxed">
                    {result.userPromptTemplate}
                  </pre>
                </div>
              </div>

              {/* Variables used */}
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Variables used
                </p>
                <div className="flex flex-wrap gap-1">
                  {(result.userPromptTemplate.match(/\{\{(\w+)\}\}/g) ?? [])
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .map((v) => (
                      <span key={v} className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-mono text-primary">
                        {v}
                      </span>
                    ))}
                </div>
              </div>

              {/* Output schema if defined */}
              {result.outputSchema && (
                <div className="rounded-md border border-border/50 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase text-muted-foreground/50">Custom Output Schema</p>
                  <pre className="mt-1 text-[10px] text-foreground/60 font-mono">{result.outputSchema.slice(0, 200)}</pre>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setResult(null); setDescription(""); }}
                  className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent"
                >
                  Start Over
                </button>
                <button
                  onClick={() => onApply(result)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Save & Activate Prompt
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
