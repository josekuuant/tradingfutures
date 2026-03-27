import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <PagePlaceholder
      icon={Settings}
      title="Settings"
      subtitle="Platform configuration and preferences"
      cards={[
        {
          title: "API Keys",
          description:
            "Manage API keys for Databento, Tradovate, and Claude with masked display.",
        },
        {
          title: "Analysis Preferences",
          description:
            "Auto-analysis interval, default timeframe, notification preferences.",
        },
        {
          title: "System Info",
          description:
            "App version, database status, uptime, and system health overview.",
        },
      ]}
    />
  );
}
