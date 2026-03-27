import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { Play } from "lucide-react";

export default function ExecutionPage() {
  return (
    <PagePlaceholder
      icon={Play}
      title="Execution"
      subtitle="Order execution and position management via Tradovate"
      cards={[
        {
          title: "Open Positions",
          description:
            "View and manage current NQ/MNQ positions with real-time P&L.",
        },
        {
          title: "Order Entry",
          description:
            "Manual or signal-based order placement with configurable parameters.",
        },
        {
          title: "Order History",
          description:
            "Today's executed orders with fill prices, status, and timestamps.",
        },
      ]}
    />
  );
}
