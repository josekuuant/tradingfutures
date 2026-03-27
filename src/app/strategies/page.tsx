"use client";

import { useState, useEffect, useCallback } from "react";
import { Target, Plus, Loader2 } from "lucide-react";
import type { Strategy, StrategyFormData } from "@/types/strategy";
import { StrategyCard } from "@/components/strategies/strategy-card";
import { StrategyEditor } from "@/components/strategies/strategy-editor";

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);

  const fetchStrategies = useCallback(async () => {
    try {
      const res = await fetch("/api/strategies");
      if (res.ok) {
        const data = await res.json();
        setStrategies(data);
      }
    } catch (err) {
      console.error("Failed to fetch strategies:", err);
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

  const openEdit = async (id: string) => {
    const s = strategies.find((s) => s.id === id);
    if (s) {
      setEditingStrategy(s);
      setEditorOpen(true);
    }
  };

  const handleSave = async (data: StrategyFormData) => {
    if (editingStrategy) {
      const res = await fetch(`/api/strategies/${editingStrategy.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
    } else {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Create failed");
    }
    setEditorOpen(false);
    setEditingStrategy(null);
    await fetchStrategies();
  };

  const handleAction = async (
    id: string,
    action: "activate" | "deactivate" | "duplicate"
  ) => {
    await fetch(`/api/strategies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await fetchStrategies();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/strategies/${id}`, { method: "DELETE" });
    await fetchStrategies();
  };

  const activeStrategy = strategies.find((s) => s.isActive);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
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

        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New Strategy
        </button>
      </div>

      {/* ── Strategy list ───────────────────────────────────── */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : strategies.length === 0 ? (
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

      {/* ── Editor modal ────────────────────────────────────── */}
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
    </div>
  );
}
