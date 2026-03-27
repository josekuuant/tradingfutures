import { cn } from "@/lib/utils";

type LevelType = "resistance" | "support" | "pivot";

interface KeyLevel {
  label: string;
  price: number;
  type: LevelType;
}

interface KeyLevelsCardProps {
  levels: KeyLevel[];
  currentPrice?: number;
}

const TYPE_STYLES: Record<LevelType, { dot: string; text: string }> = {
  resistance: { dot: "bg-danger/60", text: "text-danger" },
  support: { dot: "bg-success/60", text: "text-success" },
  pivot: { dot: "bg-primary/60", text: "text-primary" },
};

export function KeyLevelsCard({ levels, currentPrice }: KeyLevelsCardProps) {
  const sortedLevels = [...levels].sort((a, b) => b.price - a.price);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Key Levels
        </p>
        {currentPrice && (
          <span className="font-mono text-xs text-muted-foreground">
            Current:{" "}
            <span className="text-foreground">
              {currentPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </span>
          </span>
        )}
      </div>

      {sortedLevels.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">
            No levels defined yet
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {sortedLevels.map((level, i) => {
            const style = TYPE_STYLES[level.type];
            const isNearCurrent =
              currentPrice &&
              Math.abs(level.price - currentPrice) / currentPrice < 0.002;

            return (
              <div
                key={`${level.label}-${i}`}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 transition-colors",
                  isNearCurrent && "bg-accent/40"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn("h-1.5 w-1.5 rounded-full", style.dot)}
                  />
                  <span className="text-sm text-foreground/80">
                    {level.label}
                  </span>
                </div>
                <span
                  className={cn(
                    "font-mono text-sm font-medium",
                    style.text
                  )}
                >
                  {level.price.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
