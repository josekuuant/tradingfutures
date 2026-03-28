"use client";

import { useState, useEffect } from "react";

type ConnectionStatus = "connected" | "disconnected" | "idle";

interface ConnectionDot {
  label: string;
  status: ConnectionStatus;
}

const STATUS_COLORS = {
  connected: "bg-success",
  disconnected: "bg-danger",
  idle: "bg-muted-foreground/40",
} as const;

export function StatusBar() {
  const [connections, setConnections] = useState<ConnectionDot[]>([
    { label: "Databento", status: "idle" },
    { label: "Claude", status: "idle" },
    { label: "Tradovate", status: "idle" },
  ]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/connections");
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data)) return;

        const providerMap: Record<string, string> = {
          databento: "Databento",
          claude: "Claude",
          tradovate: "Tradovate",
          topstepx: "TopstepX",
          rithmic: "Rithmic",
          ninjatrader: "NinjaTrader",
          polymarket: "Polymarket",
        };

        const dots: ConnectionDot[] = data.map((c: { provider: string; status: string }) => ({
          label: providerMap[c.provider] ?? c.provider,
          status: c.status === "connected" ? "connected" as const
            : c.status === "error" ? "disconnected" as const
            : "idle" as const,
        }));

        // Always show Databento and Claude first, then configured providers
        const priority = ["Databento", "Claude"];
        dots.sort((a, b) => {
          const aIdx = priority.indexOf(a.label);
          const bIdx = priority.indexOf(b.label);
          if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
          if (aIdx >= 0) return -1;
          if (bIdx >= 0) return 1;
          return 0;
        });

        if (dots.length > 0) setConnections(dots);
      } catch {
        // keep defaults
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-4">
      {connections.map((conn) => (
        <div key={conn.label} className="flex items-center gap-1.5">
          <div
            className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[conn.status]}`}
          />
          <span className="text-xs text-muted-foreground">{conn.label}</span>
        </div>
      ))}
    </div>
  );
}
