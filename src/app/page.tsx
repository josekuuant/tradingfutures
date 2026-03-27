import { Zap, TrendingUp, Ban, Target } from "lucide-react";
import {
  ConnectionCard,
  LastSignalCard,
  MarketBiasCard,
  StrategyEngineCard,
  MetricCard,
  ActivityFeed,
  KeyLevelsCard,
  AlertsCard,
} from "@/components/dashboard";
import { MockDataBanner } from "@/components/shared/mock-data-banner";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* ── Mock data warning ──────────────────────────────────── */}
      <MockDataBanner />

      {/* ── Row 1: Connection Status ──────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ConnectionCard
          name="Databento"
          description="Market data feed"
          status="idle"
          detail="Configure API key in Settings → API Connections"
        />
        <ConnectionCard
          name="Claude API"
          description="AI analysis engine"
          status="idle"
          detail="Configure API key in Settings → API Connections"
        />
        <ConnectionCard
          name="Tradovate"
          description="Broker & execution"
          status="idle"
          detail="Configure credentials in Settings → API Connections"
        />
      </div>

      {/* ── Row 2: Signal + Bias + Engine ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LastSignalCard action={null} />
        </div>
        <div className="space-y-4">
          <MarketBiasCard bias={null} />
          <StrategyEngineCard
            isRunning={false}
            activeStrategy={undefined}
          />
        </div>
      </div>

      {/* ── Row 3: Metrics ────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Signals Today"
          value="0"
          icon={Zap}
          subtitle="No signals generated"
        />
        <MetricCard
          label="Win Rate"
          value="—"
          icon={TrendingUp}
          subtitle="Requires signal history"
        />
        <MetricCard
          label="No Trade"
          value="0"
          icon={Ban}
          subtitle="Skipped signals today"
        />
        <MetricCard
          label="Active Setups"
          value="0"
          icon={Target}
          subtitle="No strategies configured"
        />
      </div>

      {/* ── Row 4: Activity + Levels + Alerts ─────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ActivityFeed items={[]} />
        <KeyLevelsCard levels={[]} />
        <AlertsCard
          alerts={[
            {
              id: "1",
              severity: "info",
              message: "Databento API key not configured",
            },
            {
              id: "2",
              severity: "info",
              message: "Claude API key not configured",
            },
            {
              id: "3",
              severity: "info",
              message: "Tradovate credentials not configured",
            },
          ]}
        />
      </div>
    </div>
  );
}
