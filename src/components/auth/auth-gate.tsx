"use client";

import { useState, useEffect } from "react";
import { Activity, Lock, Eye, EyeOff } from "lucide-react";

const AUTH_KEY = "tf_authenticated";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(AUTH_KEY);
    if (stored === "true") setAuthenticated(true);
    setChecking(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);

    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (res.ok) {
      sessionStorage.setItem(AUTH_KEY, "true");
      setAuthenticated(true);
    } else {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
      setCode("");
    }
  };

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (authenticated) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div
        className={`w-full max-w-sm ${shaking ? "animate-shake" : ""}`}
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Activity className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            TradingFutures
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Private trading signals platform
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span>Enter access code</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(false);
                }}
                placeholder="Access code"
                autoFocus
                autoComplete="off"
                className={`w-full rounded-lg border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/50 ${
                  error
                    ? "border-danger focus:ring-danger/50"
                    : "border-border"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide code" : "Show code"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {error && (
              <p className="mt-2 text-xs text-danger">
                Invalid access code
              </p>
            )}

            <button
              type="submit"
              disabled={code.length === 0}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              Unlock
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-[10px] text-muted-foreground/30">
          Private platform · Single user only
        </p>
      </div>
    </div>
  );
}
