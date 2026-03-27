"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquareCode, Plus, Loader2 } from "lucide-react";
import type { Prompt, PromptFormData } from "@/types/prompt";
import { PromptCard } from "@/components/prompt-studio/prompt-card";
import { PromptEditor } from "@/components/prompt-studio/prompt-editor";
import { VersionPanel } from "@/components/prompt-studio/version-panel";
import { TestPanel } from "@/components/prompt-studio/test-panel";

type ModalState =
  | { type: "none" }
  | { type: "editor"; prompt: Prompt | null }
  | { type: "versions"; prompt: Prompt }
  | { type: "test"; prompt: Prompt };

export default function PromptStudioPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) setPrompts(await res.json());
    } catch (err) {
      console.error("Failed to fetch prompts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const findPrompt = (id: string) => prompts.find((p) => p.id === id) ?? null;

  const handleSave = async (data: PromptFormData) => {
    const editing = modal.type === "editor" ? modal.prompt : null;
    if (editing) {
      const res = await fetch(`/api/prompts/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Update failed");
    } else {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Create failed");
    }
    setModal({ type: "none" });
    await fetchPrompts();
  };

  const handleAction = async (id: string, action: string) => {
    await fetch(`/api/prompts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await fetchPrompts();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    await fetchPrompts();
  };

  const handleRestore = async (promptId: string, versionId: string) => {
    await fetch(`/api/prompts/${promptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", versionId }),
    });
    setModal({ type: "none" });
    await fetchPrompts();
  };

  const activePrompt = prompts.find((p) => p.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <MessageSquareCode className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Prompt Studio</h2>
            <p className="text-sm text-muted-foreground">
              {activePrompt
                ? `Active: ${activePrompt.name} (v${activePrompt.version})`
                : "No active prompt"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setModal({ type: "editor", prompt: null })}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          New Prompt
        </button>
      </div>

      {/* Prompt list */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : prompts.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">No prompts yet</p>
          <button
            onClick={() => setModal({ type: "editor", prompt: null })}
            className="mt-3 text-xs font-medium text-primary hover:underline"
          >
            Create your first prompt
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {prompts.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              onEdit={(id) => setModal({ type: "editor", prompt: findPrompt(id)! })}
              onActivate={(id) => handleAction(id, "activate")}
              onDeactivate={(id) => handleAction(id, "deactivate")}
              onDuplicate={(id) => handleAction(id, "duplicate")}
              onDelete={handleDelete}
              onViewVersions={(id) => setModal({ type: "versions", prompt: findPrompt(id)! })}
              onTest={(id) => setModal({ type: "test", prompt: findPrompt(id)! })}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal.type === "editor" && (
        <PromptEditor
          prompt={modal.prompt}
          onSave={handleSave}
          onClose={() => setModal({ type: "none" })}
        />
      )}
      {modal.type === "versions" && (
        <VersionPanel
          promptId={modal.prompt.id}
          currentVersion={modal.prompt.version}
          onRestore={(versionId) => handleRestore(modal.prompt.id, versionId)}
          onClose={() => setModal({ type: "none" })}
        />
      )}
      {modal.type === "test" && (
        <TestPanel
          prompt={modal.prompt}
          onClose={() => setModal({ type: "none" })}
        />
      )}
    </div>
  );
}
