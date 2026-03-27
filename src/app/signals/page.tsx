import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { Zap } from "lucide-react";

export default function SignalsPage() {
  return (
    <PagePlaceholder
      icon={Zap}
      title="Signals"
      subtitle="History of all generated trading signals"
      cards={[
        {
          title: "Signal History",
          description:
            "Complete table of BUY/SELL/NO_TRADE signals with filters by date, action, and confidence.",
        },
        {
          title: "Signal Detail",
          description:
            "Expandable view showing Claude's full reasoning, entry, SL, TP, and R:R ratio.",
        },
        {
          title: "Performance Stats",
          description:
            "Win rate, average confidence, signals per day, and accuracy tracking.",
        },
      ]}
    />
  );
}
