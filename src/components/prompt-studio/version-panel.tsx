"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { PromptVersion } from "@/types/prompt";
import { X, RotateCcw, Loader2, ChevronDown, ChevronUp } from "lucide-react";

interface VersionPanelProps {
  promptId: string;
  currentVersion: number;
  onRestore: (versionId: string) => Promise<void>;
  onClose: () => void;
}

export function VersionPanel({
  promptId,
  currentVersion,
  onRestore,
  onClose,
}: VersionPanelProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/prompts/${promptId}?include=versions`);
        if (res.ok) {
          const data = await res.json();
          setVersions(data.versions ?? []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [promptId]);

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId);
    try {
      await onRestore(versionId);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Version History</h2>
            <p className="text-xs text-muted-foreground">
              Current: v{currentVersion}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground/50">No versions found</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {versions.map((v) => {
                const isCurrent = v.version === currentVersion;
                const isExpanded = expandedId === v.id;

                return (
                  <div key={v.id}>
                    <div className="flex items-center justify-between px-5 py-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : v.id)}
                        className="flex items-center gap-3 text-left"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <div>
                          <span className={cn("text-sm font-medium", isCurrent && "text-primary")}>
                            v{v.version}
                          </span>
                          {isCurrent && (
                            <span className="ml-2 text-[10px] text-primary">current</span>
                          )}
                          <p className="text-xs text-muted-foreground/60">
                            {new Date(v.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </button>

                      {!isCurrent && (
                        <button
                          onClick={() => handleRestore(v.id)}
                          disabled={restoringId === v.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                        >
                          {restoringId === v.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Restore
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="space-y-2 bg-muted/30 px-5 py-3">
                        {v.systemPrompt && (
                          <VersionField label="System" value={v.systemPrompt} />
                        )}
                        <VersionField label="User Prompt" value={v.userPromptTemplate} />
                        {v.outputSchema && (
                          <VersionField label="Output Schema" value={v.outputSchema} />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {label}
      </p>
      <pre className="mt-0.5 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/70">
        {value}
      </pre>
    </div>
  );
}
