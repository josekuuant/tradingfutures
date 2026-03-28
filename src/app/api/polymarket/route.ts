import { NextRequest, NextResponse } from "next/server";

const GAMMA_BASE = "https://gamma-api.polymarket.com";
const CLOB_BASE = "https://clob.polymarket.com";
const TIMEOUT = 10_000;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "markets";

  try {
    switch (action) {
      case "markets": {
        const limit = searchParams.get("limit") ?? "25";
        const offset = searchParams.get("offset") ?? "0";
        const tag = searchParams.get("tag") ?? "";
        const query = searchParams.get("q") ?? "";

        let url = `${GAMMA_BASE}/markets?limit=${limit}&offset=${offset}&closed=false`;
        if (tag) url += `&tag=${encodeURIComponent(tag)}`;

        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
        if (!res.ok) throw new Error(`Gamma API ${res.status}`);
        const markets = await res.json();

        // Client-side search filter if query provided
        const filtered = query
          ? markets.filter((m: { question?: string }) =>
              m.question?.toLowerCase().includes(query.toLowerCase())
            )
          : markets;

        return NextResponse.json(filtered);
      }

      case "book": {
        const tokenId = searchParams.get("token_id");
        if (!tokenId) return NextResponse.json({ error: "token_id required" }, { status: 400 });

        const res = await fetch(`${CLOB_BASE}/book?token_id=${tokenId}`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });
        if (!res.ok) throw new Error(`CLOB API ${res.status}`);
        return NextResponse.json(await res.json());
      }

      case "price": {
        const tokenId = searchParams.get("token_id");
        if (!tokenId) return NextResponse.json({ error: "token_id required" }, { status: 400 });

        const [priceRes, midRes] = await Promise.all([
          fetch(`${CLOB_BASE}/price?token_id=${tokenId}&side=buy`, { signal: AbortSignal.timeout(TIMEOUT) }),
          fetch(`${CLOB_BASE}/midpoint?token_id=${tokenId}`, { signal: AbortSignal.timeout(TIMEOUT) }),
        ]);

        const price = priceRes.ok ? await priceRes.json() : null;
        const midpoint = midRes.ok ? await midRes.json() : null;

        return NextResponse.json({ price: price?.price, midpoint: midpoint?.mid });
      }

      case "history": {
        const tokenId = searchParams.get("token_id");
        if (!tokenId) return NextResponse.json({ error: "token_id required" }, { status: 400 });

        const res = await fetch(`${CLOB_BASE}/prices-history?market=${tokenId}&interval=all&fidelity=60`, {
          signal: AbortSignal.timeout(TIMEOUT),
        });
        if (!res.ok) throw new Error(`CLOB API ${res.status}`);
        return NextResponse.json(await res.json());
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Polymarket API error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
