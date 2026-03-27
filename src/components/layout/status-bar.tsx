interface ConnectionDot {
  label: string;
  status: "connected" | "disconnected" | "idle";
}

const CONNECTIONS: ConnectionDot[] = [
  { label: "Databento", status: "idle" },
  { label: "Tradovate", status: "idle" },
  { label: "Claude", status: "idle" },
];

const STATUS_COLORS = {
  connected: "bg-success",
  disconnected: "bg-danger",
  idle: "bg-muted-foreground/40",
} as const;

export function StatusBar() {
  return (
    <div className="flex items-center gap-4">
      {CONNECTIONS.map((conn) => (
        <div key={conn.label} className="flex items-center gap-1.5">
          <div
            className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[conn.status]}`}
          />
          <span className="text-xs text-muted-foreground">{conn.label}</span>
        </div>
      ))}
    </div>
  );
}
