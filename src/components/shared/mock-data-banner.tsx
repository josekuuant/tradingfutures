"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Wifi } from "lucide-react";

export function MockDataBanner() {
  const [adapterName, setAdapterName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/market-data/adapter")
      .then((res) => res.json())
      .then((data) => setAdapterName(data.adapter))
      .catch(() => setAdapterName("unknown"));
  }, []);

  if (adapterName === null) return null; // Loading

  if (adapterName === "databento") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-success/20 bg-success/5 px-4 py-2.5">
        <Wifi className="h-4 w-4 shrink-0 text-success" />
        <div>
          <p className="text-xs font-medium text-success">Databento Connected</p>
          <p className="text-[10px] text-muted-foreground">
            Live market data active for NQ/MNQ futures
          </p>
        </div>
      </div>
    );
  }

  if (adapterName === "mock") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <div>
          <p className="text-xs font-medium text-warning">Mock Data Active</p>
          <p className="text-[10px] text-muted-foreground">
            Market data is simulated. Connect Databento in API Connections for
            real prices.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
