import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { FlaskConical } from "lucide-react";

export default function BacktestsPage() {
  return (
    <PagePlaceholder
      icon={FlaskConical}
      title="Backtests"
      subtitle="Test strategies against historical data"
      cards={[
        {
          title: "Run Backtest",
          description:
            "Select a strategy and date range to simulate signal generation on historical data.",
        },
        {
          title: "Results",
          description:
            "Performance metrics: win rate, profit factor, max drawdown, Sharpe ratio.",
        },
        {
          title: "History",
          description:
            "Past backtest runs with saved configurations and results for comparison.",
        },
      ]}
    />
  );
}
