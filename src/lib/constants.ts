import {
  LayoutDashboard,
  BarChart3,
  Zap,
  Target,
  MessageSquareCode,
  Plug,
  Play,
  FlaskConical,
  ScrollText,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

// ─── Navigation ──────────────────────────────────────────────
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Market Feed", href: "/market", icon: BarChart3 },
  { label: "Signals", href: "/signals", icon: Zap },
  { label: "Strategies", href: "/strategies", icon: Target },
  { label: "Prompts", href: "/prompt-studio", icon: MessageSquareCode },
  { label: "API Connections", href: "/connections", icon: Plug },
  { label: "Execution", href: "/execution", icon: Play },
  { label: "Polymarket", href: "/polymarket", icon: TrendingUp },
  { label: "Backtests", href: "/backtests", icon: FlaskConical },
  { label: "Logs", href: "/logs", icon: ScrollText },
  { label: "Settings", href: "/settings", icon: Settings },
];

// ─── App ─────────────────────────────────────────────────────
export const APP_NAME = "TradingFutures";
export const APP_VERSION = "0.1.0";
