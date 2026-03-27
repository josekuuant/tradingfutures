import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { Target } from "lucide-react";

export default function StrategiesPage() {
  return (
    <PagePlaceholder
      icon={Target}
      title="Strategies"
      subtitle="Manage your trading strategies and their activation rules"
      cards={[
        {
          title: "Strategy List",
          description:
            "All configured strategies with name, description, and active/inactive toggle.",
        },
        {
          title: "Strategy Editor",
          description:
            "Create and edit strategies with timeframe, instrument, and activation conditions.",
        },
        {
          title: "Active Strategy",
          description:
            "Only one strategy can be active at a time. The active strategy drives signal generation.",
        },
      ]}
    />
  );
}
