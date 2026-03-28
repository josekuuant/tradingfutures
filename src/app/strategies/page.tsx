"use client";

import { useState, useEffect, useCallback } from "react";
import { Target, Plus, Loader2, Wand2 } from "lucide-react";
import type { Strategy, StrategyFormData } from "@/types/strategy";
import { StrategyCard } from "@/components/strategies/strategy-card";
import { StrategyEditor } from "@/components/strategies/strategy-editor";
import { AIStrategyDesigner } from "@/components/strategies/ai-designer";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToast } from "@/hooks/use-toast";

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const { toasts, show, dismiss } = useToast();

  const fetchStrategies = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/strategies");
      if (res.ok) {
        setStrategies(await res.json());
      } else {
        setError("Failed to load strategies");
      }
    } catch {
      setError("Connection error — could not load strategies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  const openCreate = () => {
    setEditingStrategy(null);
    setEditorOpen(true);
  };

  const openEdit = (id: string) => {
    const s = strategies.find((s) => s.id === id);
    if (s) {
      setEditingStrategy(s);
      setEditorOpen(true);
    }
  };

  const handleSave = async (data: StrategyFormData) => {
    try {
      if (editingStrategy) {
        const res = await fetch(`/api/strategies/${editingStrategy.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Update failed");
        show("success", "Strategy updated");
      } else {
        const res = await fetch("/api/strategies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Create failed");
        show("success", "Strategy created");
      }
      setEditorOpen(false);
      setEditingStrategy(null);
      await fetchStrategies();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Failed to save strategy");
    }
  };

  const handleAction = async (
    id: string,
    action: "activate" | "deactivate" | "duplicate"
  ) => {
    try {
      const res = await fetch(`/api/strategies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`${action} failed`);
      show("success", `Strategy ${action}d`);
      await fetchStrategies();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleDelete = async (id: string) => {
    const strategy = strategies.find((s) => s.id === id);
    if (!window.confirm(`Delete "${strategy?.name ?? "this strategy"}"? This cannot be undone.`)) {
      return;
    }
    try {
      await fetch(`/api/strategies/${id}`, { method: "DELETE" });
      show("success", "Strategy deleted");
      await fetchStrategies();
    } catch {
      show("error", "Failed to delete strategy");
    }
  };

  const activeStrategy = strategies.find((s) => s.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Strategies</h2>
            <p className="text-sm text-muted-foreground">
              {activeStrategy
                ? `Active: ${activeStrategy.name}`
                : "No active strategy"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDesignerOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <Wand2 className="h-3.5 w-3.5" />
            AI Design
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            New Strategy
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={fetchStrategies} className="ml-2 underline">
            Retry
          </button>
        </div>
      )}

      {/* Strategy list */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : strategies.length === 0 && !error ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">No strategies yet</p>
          <button
            onClick={openCreate}
            className="mt-3 text-xs font-medium text-primary hover:underline"
          >
            Create your first strategy
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => (
            <StrategyCard
              key={s.id}
              strategy={s}
              onEdit={openEdit}
              onActivate={(id) => handleAction(id, "activate")}
              onDeactivate={(id) => handleAction(id, "deactivate")}
              onDuplicate={(id) => handleAction(id, "duplicate")}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <StrategyEditor
          strategy={editingStrategy}
          onSave={handleSave}
          onClose={() => {
            setEditorOpen(false);
            setEditingStrategy(null);
          }}
        />
      )}

      {designerOpen && (
        <AIStrategyDesigner
          onClose={() => setDesignerOpen(false)}
          onApply={async (result) => {
            try {
              // Normalize strategy before saving
              const strat = result.strategy as Record<string, unknown>;
              // Ensure timeframes is an array
              if (typeof strat.timeframes === "string") strat.timeframes = [strat.timeframes];
              if (!Array.isArray(strat.timeframes)) strat.timeframes = ["5m"];
              // Ensure minRR is a number
              if (typeof strat.minRR === "string") strat.minRR = parseFloat(strat.minRR) || 2;

              // Save strategy
              const stratRes = await fetch("/api/strategies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(strat),
              });
              if (!stratRes.ok) {
                const errData = await stratRes.json().catch(() => ({}));
                throw new Error(errData.error ?? "Failed to save strategy");
              }
              const savedStrategy = await stratRes.json();

              // Save prompt
              const promptRes = await fetch("/api/prompts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result.prompt),
              });
              if (!promptRes.ok) throw new Error("Failed to save prompt");

              // Activate both
              await fetch(`/api/strategies/${savedStrategy.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "activate" }),
              });

              const savedPrompt = await promptRes.json();
              await fetch(`/api/prompts/${savedPrompt.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "activate" }),
              });

              show("success", `Strategy "${savedStrategy.name}" + prompt created and activated`);
              setDesignerOpen(false);
              await fetchStrategies();
            } catch (err) {
              show("error", err instanceof Error ? err.message : "Failed to save");
            }
          }}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
