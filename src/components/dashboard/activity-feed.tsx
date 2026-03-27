import { cn } from "@/lib/utils";

type ActivityType = "signal" | "connection" | "error" | "system";

interface ActivityItem {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
}

const TYPE_DOT: Record<ActivityType, string> = {
  signal: "bg-primary",
  connection: "bg-success",
  error: "bg-danger",
  system: "bg-muted-foreground/50",
};

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recent Activity
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">
            No activity recorded yet
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/30"
            >
              <div
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  TYPE_DOT[item.type]
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground/90">{item.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground/60">
                  {item.timestamp}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
