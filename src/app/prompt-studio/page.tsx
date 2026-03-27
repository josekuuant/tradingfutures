import { PagePlaceholder } from "@/components/shared/page-placeholder";
import { MessageSquareCode } from "lucide-react";

export default function PromptStudioPage() {
  return (
    <PagePlaceholder
      icon={MessageSquareCode}
      title="Prompt Studio"
      subtitle="Design and test prompts for Claude analysis"
      cards={[
        {
          title: "Prompt Editor",
          description:
            "Full-featured editor with syntax highlighting and injectable variable chips.",
        },
        {
          title: "Variable Reference",
          description:
            "Available template variables: {{instrument}}, {{timeframe}}, {{ohlcv_data}}, {{current_price}}, etc.",
        },
        {
          title: "Prompt Tester",
          description:
            "Test prompts with sample market data before attaching them to a strategy.",
        },
      ]}
    />
  );
}
