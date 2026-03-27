"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, ExternalLink, Database, Activity, Loader2 } from "lucide-react";
import { APP_VERSION } from "@/lib/constants";
import type { EngineConfig } from "@/types/engine";

export default function SettingsPage() {
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [health, setHealth] = useState<{ uptime: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"success" | "error" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [configRes, healthRes] = await Promise.all([
        fetch("/api/engine/config"),
        fetch("/api/health"),
      ]);
      if (configRes.ok) setConfig(await configRes.json());
      else setError("Failed to load config");
      if (healthRes.ok) {
        const h = await healthRes.json();
        setHealth({ uptime: h.uptime, status: h.status });
      }
    } catch {
      setError("Connection error — could not load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/engine/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary w-full";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-muted-foreground">
            Platform configuration and engine parameters
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick links */}
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quick Links
            </p>
            <div className="space-y-2">
              <QuickLink href="/connections" label="API Connections" desc="Configure Databento, Claude, Tradovate" />
              <QuickLink href="/strategies" label="Strategies" desc="Create and manage trading strategies" />
              <QuickLink href="/prompt-studio" label="Prompt Studio" desc="Design prompts for Claude" />
              <QuickLink href="/execution" label="Execution" desc="Tradovate connection and order mode" />
            </div>
          </div>

          {/* System info */}
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              System Info
            </p>
            <div className="space-y-2.5">
              <InfoRow icon={Activity} label="Version" value={APP_VERSION} />
              <InfoRow icon={Activity} label="Status" value={health?.status ?? "—"} />
              <InfoRow icon={Activity} label="Uptime" value={health?.uptime ?? "—"} />
              <InfoRow icon={Database} label="Database" value="SQLite (WAL mode)" />
              <InfoRow icon={Database} label="Market Adapter" value="Mock (configure Databento for real data)" />
            </div>
          </div>

          {/* Engine config */}
          {config && (
            <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Engine Configuration
                </p>
                <div className="flex items-center gap-3">
                  {saveStatus === "success" && (
                    <span className="text-xs text-success">Saved</span>
                  )}
                  {saveStatus === "error" && (
                    <span className="text-xs text-danger">Save failed</span>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ConfigField
                  label="Cooldown (seconds)"
                  value={config.cooldownSeconds}
                  onChange={(v) => setConfig({ ...config, cooldownSeconds: v })}
                  inputClass={inputClass}
                />
                <ConfigField
                  label="Min Confidence"
                  value={config.minConfidence}
                  onChange={(v) => setConfig({ ...config, minConfidence: v })}
                  step={0.05}
                  inputClass={inputClass}
                />
                <ConfigField
                  label="Max Data Age (seconds)"
                  value={config.maxDataAgeSeconds}
                  onChange={(v) => setConfig({ ...config, maxDataAgeSeconds: v })}
                  inputClass={inputClass}
                />
                <ConfigField
                  label="Prompt Candle Count"
                  value={config.promptCandleCount}
                  onChange={(v) => setConfig({ ...config, promptCandleCount: v })}
                  inputClass={inputClass}
                />
                <ConfigField
                  label="Min Volatility (points)"
                  value={config.minVolatilityPoints}
                  onChange={(v) => setConfig({ ...config, minVolatilityPoints: v })}
                  inputClass={inputClass}
                />
                <ConfigField
                  label="Level Proximity Threshold"
                  value={config.levelProximityThreshold}
                  onChange={(v) => setConfig({ ...config, levelProximityThreshold: v })}
                  step={0.001}
                  inputClass={inputClass}
                />
                <ConfigField
                  label="Min Relative Volume"
                  value={config.minRelativeVolume}
                  onChange={(v) => setConfig({ ...config, minRelativeVolume: v })}
                  step={0.1}
                  inputClass={inputClass}
                />
                <ConfigField
                  label="Max Consecutive Same Signal"
                  value={config.maxConsecutiveSameSignal}
                  onChange={(v) => setConfig({ ...config, maxConsecutiveSameSignal: v })}
                  inputClass={inputClass}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuickLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2.5 transition-colors hover:bg-accent/30"
    >
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] text-muted-foreground">{desc}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40" />
    </a>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/40" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

function ConfigField({
  label,
  value,
  onChange,
  step = 1,
  inputClass,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  inputClass: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        className={inputClass}
      />
    </div>
  );
}
