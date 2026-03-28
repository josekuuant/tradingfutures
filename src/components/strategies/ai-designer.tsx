"use client";

import { useState } from "react";
import { Wand2, Loader2, Check, ArrowRight, Sparkles } from "lucide-react";

interface DesignResult {
  strategy: Record<string, unknown>;
  prompt: Record<string, unknown>;
}

interface AIStrategyDesignerProps {
  onApply: (result: DesignResult) => void;
  onClose: () => void;
}

const EXAMPLES = [
  "Quiero una estrategia de breakout cuando NQ rompe el overnight high con volumen fuerte, con stop debajo del OR low y target en sesion high anterior",
  "Pullback al VWAP en tendencia alcista cuando el precio respeta la estructura de higher lows en 5m, con confirmación de volumen",
  "Reversal en el session low cuando hay divergencia de momentum y el precio ha hecho un sweep de liquidez por debajo del low previo",
  "Scalp de continuación de momentum cuando NQ rompe un rango de compresión de 15 minutos con spread tight y ATR > 10 puntos",
];

export function AIStrategyDesigner({ onApply, onClose }: AIStrategyDesignerProps) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DesignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDesign = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/strategies/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Design failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-label="AI Strategy Designer"
    >
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Wand2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">AI Strategy Designer</h2>
              <p className="text-xs text-muted-foreground">
                Describe your strategy — Claude designs everything
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            Cancel
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!result ? (
            <>
              {/* Input */}
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  Describe your trading strategy in your own words
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Quiero una estrategia de breakout cuando NQ rompe el overnight high con volumen fuerte..."
                  rows={5}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/30 focus:border-primary focus:ring-1 focus:ring-primary"
                  autoFocus
                />
              </div>

              {/* Examples */}
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Examples (click to use)
                </p>
                <div className="grid gap-2">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setDescription(ex)}
                      className="rounded-md border border-border/50 px-3 py-2 text-left text-xs text-muted-foreground/70 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
                  {error}
                </div>
              )}

              {/* Action */}
              <button
                onClick={handleDesign}
                disabled={loading || description.trim().length < 10}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Designing strategy...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Design with Claude
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Result preview */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-success">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">Strategy designed</span>
                </div>

                {/* Strategy summary */}
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <h3 className="text-sm font-semibold">
                    {(result.strategy.name as string) ?? "Strategy"}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(result.strategy.description as string) ?? ""}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <Detail label="Instrument" value={result.strategy.instrument as string} />
                    <Detail label="Timeframes" value={JSON.stringify(result.strategy.timeframes)} />
                    <Detail label="Min R:R" value={String(result.strategy.minRR)} />
                    <Detail label="Tag" value={result.strategy.tag as string} />
                  </div>
                </div>

                {/* Key sections */}
                <div className="grid gap-3">
                  <Section title="Context Conditions" content={result.strategy.contextConditions as string} />
                  <Section title="Entry Conditions" content={result.strategy.entryConditions as string} />
                  <Section title="Invalidation" content={result.strategy.invalidation as string} />
                  <Section title="No-Trade Rules" content={result.strategy.noTradeRules as string} />
                </div>

                {/* Prompt preview */}
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    Prompt: {(result.prompt.name as string) ?? "Prompt"}
                  </h4>
                  <p className="mt-1 text-[10px] text-muted-foreground/60 line-clamp-3">
                    {(result.prompt.userPromptTemplate as string)?.slice(0, 200)}...
                  </p>
                </div>
              </div>

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
                  Save Strategy & Prompt
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground/50">{label}: </span>
      <span className="font-medium text-foreground/70">{value}</span>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  if (!content) return null;
  return (
    <div className="rounded-md border border-border/50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {title}
      </p>
      <p className="mt-1 text-xs text-foreground/70">{content}</p>
    </div>
  );
}
