"use client";

import { useState, useEffect, useCallback } from "react";
import { Plug, ShieldCheck } from "lucide-react";
import { ConnectionForm } from "@/components/connections/connection-form";
import {
  PROVIDER_CONFIGS,
  type ConnectionResponse,
} from "@/types/connections";

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const getConnection = (provider: string): ConnectionResponse | null => {
    return connections.find((c) => c.provider === provider) ?? null;
  };

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
              Configure and manage external service integrations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Credentials stored locally
          </span>
        </div>
      </div>

      {/* Connection forms */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {PROVIDER_CONFIGS.map((config) => (
            <ConnectionForm
              key={config.provider}
              config={config}
              connection={getConnection(config.provider)}
              onSaved={fetchConnections}
            />
          ))}
        </div>
      )}
    </div>
  );
}
