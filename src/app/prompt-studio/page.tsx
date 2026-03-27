"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquareCode, Plus, Loader2 } from "lucide-react";
import type { Prompt, PromptFormData } from "@/types/prompt";
import { PromptCard } from "@/components/prompt-studio/prompt-card";
import { PromptEditor } from "@/components/prompt-studio/prompt-editor";
import { VersionPanel } from "@/components/prompt-studio/version-panel";
import { TestPanel } from "@/components/prompt-studio/test-panel";
import { ToastContainer } from "@/components/ui/toast-container";
import { useToast } from "@/hooks/use-toast";

type ModalState =
  | { type: "none" }
  | { type: "editor"; prompt: Prompt | null }
  | { type: "versions"; prompt: Prompt }
  | { type: "test"; prompt: Prompt };

export default function PromptStudioPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const { toasts, show, dismiss } = useToast();

  const fetchPrompts = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/prompts");
      if (res.ok) setPrompts(await res.json());
      else setError("Failed to load prompts");
    } catch {
      setError("Connection error — could not load prompts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const findPrompt = (id: string) => prompts.find((p) => p.id === id) ?? null;

  const handleSave = async (data: PromptFormData) => {
    try {
      const editing = modal.type === "editor" ? modal.prompt : null;
      if (editing) {
        const res = await fetch(`/api/prompts/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Update failed");
        show("success", "Prompt updated");
      } else {
        const res = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Create failed");
        show("success", "Prompt created");
      }
      setModal({ type: "none" });
      await fetchPrompts();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Failed to save prompt");
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/prompts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`${action} failed`);
      show("success", `Prompt ${action}d`);
      await fetchPrompts();
    } catch (err) {
      show("error", err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleDelete = async (id: string) => {
    const prompt = prompts.find((p) => p.id === id);
    if (!window.confirm(`Delete "${prompt?.name ?? "this prompt"}"? All versions and test runs will be lost.`)) {
      return;
    }
    try {
      await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      show("success", "Prompt deleted");
      await fetchPrompts();
    } catch {
      show("error", "Failed to delete prompt");
    }
  };

  const handleRestore = async (promptId: string, versionId: string) => {
    if (!window.confirm("Restore this version? Current prompt content will be overwritten.")) {
      return;
    }
    try {
      await fetch(`/api/prompts/${promptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", versionId }),
      });
      show("success", "Version restored");
      setModal({ type: "none" });
      await fetchPrompts();
    } catch {
      show("error", "Failed to restore version");
    }
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

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
          <button onClick={fetchPrompts} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Prompt list */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : prompts.length === 0 && !error ? (
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

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
