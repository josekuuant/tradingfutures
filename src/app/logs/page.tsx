import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { ScrollText } from "lucide-react";

export default function LogsPage() {
  return (
    <PagePlaceholder
      icon={ScrollText}
      title="Logs"
      subtitle="System activity and debugging information"
      cards={[
        {
          title: "Activity Feed",
          description:
            "Chronological log of all system events: signals, API calls, errors, connections.",
        },
        {
          title: "Error Log",
          description:
            "Filtered view of errors and warnings with stack traces and context.",
        },
        {
          title: "API Usage",
          description:
            "Claude API token consumption, Databento data usage, and rate limit status.",
        },
      ]}
    />
  );
}
