"use client";

import { useState, useEffect } from "react";
import type { Prompt, PromptTestRun } from "@/types/prompt";
import { TEMPLATE_VARIABLES } from "@/types/prompt";
import { X, Play, Loader2, Clock } from "lucide-react";

interface TestPanelProps {
  prompt: Prompt;
  onClose: () => void;
}

export function TestPanel({ prompt, onClose }: TestPanelProps) {
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testRuns, setTestRuns] = useState<PromptTestRun[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Load test history
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/prompts/${prompt.id}?include=testRuns`);
        if (res.ok) {
          const data = await res.json();
          setTestRuns(data.testRuns ?? []);
        }
      } catch {
        setHistoryError("Failed to load test history");
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [prompt.id]);

  // Detect which variables are used in the template
  const usedVars = TEMPLATE_VARIABLES.filter(
    (v) =>
      prompt.userPromptTemplate.includes(`{{${v.key}}}`) ||
      prompt.systemPrompt.includes(`{{${v.key}}}`)
  );

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`/api/prompts/${prompt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", variables }),
      });
      if (res.ok) {
        const run: PromptTestRun = await res.json();
        setTestRuns((prev) => [run, ...prev]);
        setTestError(null);
      } else {
        setTestError("Test failed — check Claude API configuration");
      }
    } catch {
      setTestError("Test failed — connection error");
    } finally {
      setTesting(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-6" role="dialog" aria-modal="true" aria-label="Prompt test">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Test: {prompt.name}</h2>
            <p className="text-xs text-muted-foreground">
              Render prompt with sample variables and preview output
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto">
          {/* Variables input */}
          <div className="border-b border-border/50 px-5 py-4">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Template Variables ({usedVars.length} detected)
            </p>

            {usedVars.length === 0 ? (
              <p className="text-xs text-muted-foreground/50">
                No template variables detected in prompt
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {usedVars.map((v) => (
                  <div key={v.key} className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">
                      <code>{`{{${v.key}}}`}</code>
                    </label>
                    <input
                      type="text"
                      value={variables[v.key] ?? ""}
                      onChange={(e) =>
                        setVariables((prev) => ({
                          ...prev,
                          [v.key]: e.target.value,
                        }))
                      }
                      placeholder={v.description}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleTest}
              disabled={testing}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Run Test
            </button>
          </div>

          {/* Error display */}
          {testError && (
            <div className="mx-5 rounded bg-danger/10 px-3 py-2 text-xs text-danger">{testError}</div>
          )}

          {/* Test history */}
          <div className="px-5 py-4">
            <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Test History
            </p>

            {loadingHistory ? (
              <div className="flex h-20 items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : historyError ? (
              <p className="text-xs text-danger">{historyError}</p>
            ) : testRuns.length === 0 ? (
              <p className="text-xs text-muted-foreground/50">No test runs yet</p>
            ) : (
              <div className="space-y-3">
                {testRuns.map((run) => (
                  <TestRunCard key={run.id} run={run} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TestRunCard({ run }: { run: PromptTestRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border/50 bg-muted/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-3">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-xs text-foreground/80">
            {new Date(run.createdAt).toLocaleString()}
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            {run.durationMs}ms
          </span>
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border/30 px-4 py-3">
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground/50">
              Rendered Prompt
            </p>
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground/70">
              {run.renderedPrompt}
            </pre>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground/50">
              Response
            </p>
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground/70">
              {run.response}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
