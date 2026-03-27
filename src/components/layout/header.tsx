"use client";

import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { StatusBar } from "./status-bar";

export function Header() {
  const pathname = usePathname();

  const currentPage =
    NAV_ITEMS.find((item) =>
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
    )?.label ?? "Dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <h1 className="text-sm font-semibold">{currentPage}</h1>
      <StatusBar />
    </header>
  );
}
