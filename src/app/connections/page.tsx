"use client";

import { useState, useEffect, useCallback } from "react";
import { Plug, ShieldCheck } from "lucide-react";
import { ConnectionForm } from "@/components/connections/connection-form";
import {
  PROVIDER_CONFIGS,
  CATEGORY_LABELS,
  getProvidersByCategory,
  type ConnectionResponse,
  type ProviderCategory,
} from "@/types/connections";

const CATEGORIES: ProviderCategory[] = ["data", "ai", "execution"];

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      if (res.ok) setConnections(await res.json());
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const getConnection = (provider: string): ConnectionResponse | null =>
    connections.find((c) => c.provider === provider) ?? null;

  // Count connected providers
  const connectedCount = connections.filter(
    (c) => c.status === "connected" && c.isEnabled
  ).length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Plug className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">API Connections</h2>
            <p className="text-sm text-muted-foreground">
              {connectedCount}/{PROVIDER_CONFIGS.length} integrations active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Credentials encrypted locally
          </span>
        </div>
      </div>

      {/* Connection forms grouped by category */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {CATEGORIES.map((category) => {
            const providers = getProvidersByCategory(category);
            if (providers.length === 0) return null;

            return (
              <div key={category}>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <div className="space-y-4">
                  {providers.map((config) => (
                    <ConnectionForm
                      key={config.provider}
                      config={config}
                      connection={getConnection(config.provider)}
                      onSaved={fetchConnections}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
