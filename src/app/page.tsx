import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Minus,
  DollarSign,
  BarChart3,
  Zap,
  Clock,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <LayoutDashboard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            NQ/MNQ trading signals overview
          </p>
        </div>
      </div>

      {/* Active Signal */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Active Signal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
                <Minus className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground">
                  NO SIGNAL
                </p>
                <p className="text-sm text-muted-foreground">
                  Run analysis to generate a signal
                </p>
              </div>
            </div>
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Analyze Now
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>NQ Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold tabular-nums">--</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold tabular-nums">0</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold tabular-nums">--</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily P&amp;L</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold tabular-nums">--</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent signals & chart placeholders */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Price Chart</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                Chart will render here with Databento data
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Signals</CardTitle>
              <Badge variant="muted">0 today</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                No signals generated yet
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
