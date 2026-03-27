"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  type ProviderConfig,
  type ConnectionResponse,
  type ConnectionStatus,
  type Environment,
} from "@/types/connections";
import {
  Shield,
  TestTube,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Eye,
  EyeOff,
} from "lucide-react";

interface ConnectionFormProps {
  config: ProviderConfig;
  connection: ConnectionResponse | null;
  onSaved: () => void;
}

const STATUS_DISPLAY: Record<
  ConnectionStatus,
  { label: string; icon: typeof Circle; color: string; dot: string }
> = {
  untested: {
    label: "Not tested",
    icon: Circle,
    color: "text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
  connected: {
    label: "Connected",
    icon: CheckCircle2,
    color: "text-success",
    dot: "bg-success shadow-[0_0_6px_hsl(var(--success))]",
  },
  error: {
    label: "Error",
    icon: XCircle,
    color: "text-danger",
    dot: "bg-danger shadow-[0_0_6px_hsl(var(--danger))]",
  },
};

export function ConnectionForm({
  config,
  connection,
  onSaved,
}: ConnectionFormProps) {
  const [isEnabled, setIsEnabled] = useState(connection?.isEnabled ?? false);
  const [environment, setEnvironment] = useState<Environment>(
    connection?.environment ?? "sandbox"
  );
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of config.fields) {
      initial[f.key] = "";
    }
    return initial;
  });
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [testResult, setTestResult] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const status = connection?.status ?? "untested";
  const statusConfig = STATUS_DISPLAY[status];

  const handleFieldChange = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSaveMessage(null);
  }, []);

  const toggleReveal = useCallback((key: string) => {
    setRevealedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setTestResult(null);

    try {
      // Build credentials — only include non-empty fields
      // If a field is empty and we have existing masked data, the backend keeps old value
      const credentials: Record<string, unknown> = {};
      for (const f of config.fields) {
        const val = fields[f.key];
        if (val) {
          credentials[f.key] =
            f.type === "number" ? Number(val) : val;
        } else if (connection?.maskedCredentials[f.key]) {
          // Signal to keep existing value
          credentials[f.key] = `__KEEP__${connection.maskedCredentials[f.key]}`;
        }
      }

      const res = await fetch("/api/connections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          isEnabled,
          environment,
          credentials,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      setSaveMessage({ type: "success", text: "Configuration saved" });
      setFields(() => {
        const reset: Record<string, string> = {};
        for (const f of config.fields) reset[f.key] = "";
        return reset;
      });
      onSaved();
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: config.provider }),
      });

      const data = await res.json();
      setTestResult({
        type: data.success ? "success" : "error",
        text: data.message,
      });
      onSaved();
    } catch {
      setTestResult({ type: "error", text: "Test request failed" });
    } finally {
      setTesting(false);
    }
  };

  const hasExistingConfig = connection !== null;

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{config.name}</h3>
            <p className="text-xs text-muted-foreground">
              {config.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", statusConfig.dot)} />
            <span className={cn("text-xs font-medium", statusConfig.color)}>
              {statusConfig.label}
            </span>
          </div>

          {/* Enable toggle */}
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              isEnabled ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                isEnabled ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="space-y-4 p-5">
        {/* Environment selector */}
        {config.supportsEnvironment && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Environment
            </label>
            <div className="flex gap-2">
              {(["sandbox", "production"] as const).map((env) => (
                <button
                  key={env}
                  onClick={() => setEnvironment(env)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    environment === env
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {env.charAt(0).toUpperCase() + env.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Credential fields */}
        {config.fields.map((field) => {
          const isRevealed = revealedFields.has(field.key);
          const isPassword = field.type === "password";
          const existingMasked = connection?.maskedCredentials[field.key];

          return (
            <div key={field.key} className="space-y-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                {field.label}
                {field.required && <span className="text-danger">*</span>}
              </label>

              {field.type === "select" ? (
                <select
                  value={fields[field.key] || (existingMasked ?? "")}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="relative">
                  <input
                    type={isPassword && !isRevealed ? "password" : "text"}
                    value={fields[field.key]}
                    onChange={(e) =>
                      handleFieldChange(field.key, e.target.value)
                    }
                    placeholder={
                      existingMasked
                        ? `Current: ${existingMasked}`
                        : field.placeholder
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  {isPassword && (
                    <button
                      type="button"
                      onClick={() => toggleReveal(field.key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {isRevealed ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Last tested info */}
        {connection?.lastTestedAt && (
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Last tested:{" "}
              <span className="text-foreground/70">
                {new Date(connection.lastTestedAt).toLocaleString()}
              </span>
            </p>
            {connection.lastError && (
              <p className="mt-1 text-xs text-danger">
                {connection.lastError}
              </p>
            )}
          </div>
        )}

        {/* Feedback messages */}
        {saveMessage && (
          <div
            className={cn(
              "rounded-md px-3 py-2 text-xs",
              saveMessage.type === "success"
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger"
            )}
          >
            {saveMessage.text}
          </div>
        )}
        {testResult && (
          <div
            className={cn(
              "rounded-md px-3 py-2 text-xs",
              testResult.type === "success"
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger"
            )}
          >
            {testResult.text}
          </div>
        )}
      </div>

      {/* ── Footer actions ──────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          onClick={handleTest}
          disabled={testing || !hasExistingConfig}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <TestTube className="h-3.5 w-3.5" />
          )}
          Test Connection
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}
