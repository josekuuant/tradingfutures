import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "TradingFutures",
  description: "Private NQ/MNQ Trading Signals Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans">
        <Sidebar />
        <div className="min-h-screen lg:ml-60">
          <Header />
          <main className="p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
