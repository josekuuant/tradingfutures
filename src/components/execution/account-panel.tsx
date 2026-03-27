import { cn } from "@/lib/utils";
import type { NormalizedAccount } from "@/types/execution";
import { DollarSign } from "lucide-react";

interface AccountPanelProps {
  account: NormalizedAccount | null;
}

export function AccountPanel({ account }: AccountPanelProps) {
  if (!account) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Account
        </p>
        <div className="mt-4 flex h-20 items-center justify-center">
          <p className="text-sm text-muted-foreground/50">Not connected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Account
        </p>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {account.environment}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <DollarSign className="h-4 w-4 text-muted-foreground/40" />
        <span className="text-2xl font-bold tabular-nums">
          {fmt(account.netLiq)}
        </span>
        <span className="text-xs text-muted-foreground">Net Liq</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Balance" value={fmt(account.balance)} />
        <Stat label="Cash" value={fmt(account.cashBalance)} />
        <Stat
          label="Realized P&L"
          value={fmtPnl(account.realizedPnl)}
          color={account.realizedPnl >= 0 ? "success" : "danger"}
        />
        <Stat
          label="Unrealized P&L"
          value={fmtPnl(account.unrealizedPnl)}
          color={account.unrealizedPnl >= 0 ? "success" : "danger"}
        />
        <Stat label="Margin Used" value={fmt(account.marginUsed)} />
        <Stat label="Account ID" value={account.id} mono />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
  mono,
}: {
  label: string;
  value: string;
  color?: "success" | "danger";
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground/50">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-medium tabular-nums",
          color === "success" && "text-success",
          color === "danger" && "text-danger",
          !color && "text-foreground/80",
          mono && "font-mono text-xs"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function fmtPnl(n: number): string {
  const prefix = n >= 0 ? "+" : "";
  return `${prefix}${fmt(n)}`;
}
