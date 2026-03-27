import { AlertTriangle } from "lucide-react";

interface MockDataBannerProps {
  adapterName: string;
}

export function MockDataBanner({ adapterName }: MockDataBannerProps) {
  if (adapterName !== "mock") return null;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <div>
        <p className="text-xs font-medium text-warning">
          Mock Data Active
        </p>
        <p className="text-[10px] text-muted-foreground">
          Market data is simulated. Connect Databento in API Connections for
          real prices.
        </p>
      </div>
    </div>
  );
}
