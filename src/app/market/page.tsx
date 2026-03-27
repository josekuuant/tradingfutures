import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { BarChart3 } from "lucide-react";

export default function MarketPage() {
  return (
    <PagePlaceholder
      icon={BarChart3}
      title="Market Feed"
      subtitle="Real-time NQ/MNQ price data from Databento"
      cards={[
        {
          title: "Price Chart",
          description:
            "Interactive candlestick chart with multiple timeframes (1m, 5m, 15m, 1h).",
        },
        {
          title: "Market Stats",
          description:
            "Current price, volume, high/low of day, spread, and session info.",
        },
        {
          title: "Data Feed Status",
          description:
            "Databento connection status, latency, and data quality indicators.",
        },
      ]}
    />
  );
}
