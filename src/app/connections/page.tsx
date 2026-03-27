import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { Plug } from "lucide-react";

export default function ConnectionsPage() {
  return (
    <PagePlaceholder
      icon={Plug}
      title="API Connections"
      subtitle="Manage external service connections"
      cards={[
        {
          title: "Databento",
          description:
            "Market data feed connection. Configure API key, subscription, and data parameters.",
        },
        {
          title: "Tradovate",
          description:
            "Broker connection for account data, positions, and order execution.",
        },
        {
          title: "Claude API",
          description:
            "AI analysis engine. Configure API key, model selection, and token limits.",
        },
      ]}
    />
  );
}
