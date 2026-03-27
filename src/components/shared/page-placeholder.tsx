import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type LucideIcon } from "lucide-react";

interface PlaceholderCard {
  title: string;
  description: string;
}

interface PagePlaceholderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  cards: PlaceholderCard[];
}

export function PagePlaceholder({
  icon: Icon,
  title,
  subtitle,
  cards,
}: PagePlaceholderProps) {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{card.title}</CardTitle>
                <Badge variant="muted">Pending</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
