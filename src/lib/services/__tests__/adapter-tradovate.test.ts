import { describe, it, expect, vi, beforeEach } from "vitest";
import { TradovateAdapter } from "../execution/adapter-tradovate";

// Mock logger
vi.mock("@/lib/logger", () => ({
  log: { execution: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), critical: vi.fn() } },
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeAdapter(env: "demo" | "production" = "demo") {
  return new TradovateAdapter(
    { username: "testuser", password: "testpass", appId: "TestApp" },
    env
  );
}

describe("TradovateAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("connect", () => {
    it("returns ok on successful auth", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: "tok-123", userId: 42 }),
      });

      const adapter = makeAdapter();
      const result = await adapter.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("demo");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://demo.tradovateapi.com/v1/auth/accessTokenRequest",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("returns error on auth failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Invalid credentials",
      });

      const adapter = makeAdapter();
      const result = await adapter.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("auth failed");
    });

    it("uses production URL for production env", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: "tok-456" }),
      });

      const adapter = makeAdapter("production");
      await adapter.connect();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("live.tradovateapi.com"),
        expect.any(Object)
      );
    });
  });

  describe("getAccounts", () => {
    it("fetches and normalizes accounts", async () => {
      // Auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: "tok-789" }),
      });
      // Account list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 1, name: "Live Account", marginBalance: 50000, netLiq: 51000 },
        ],
      });

      const adapter = makeAdapter();
      await adapter.connect();
      const accounts = await adapter.getAccounts();

      expect(accounts).toHaveLength(1);
      expect(accounts[0].provider).toBe("tradovate");
      expect(accounts[0].id).toBe("1");
      expect(accounts[0].balance).toBe(50000);
    });
  });

  describe("placeOrder", () => {
    it("sends correct order payload", async () => {
      // Auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: "tok" }),
      });
      // Order
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 100,
          accountId: 1,
          action: "Buy",
          symbol: "NQ",
          orderQty: 1,
          orderType: "Market",
          ordStatus: "Filled",
          filledQty: 1,
          avgFillPrice: 19850,
        }),
      });

      const adapter = makeAdapter();
      await adapter.connect();
      const order = await adapter.placeOrder(
        { instrument: "NQ", side: "buy", type: "market", quantity: 1 },
        "1"
      );

      expect(order.side).toBe("buy");
      expect(order.instrument).toBe("NQ");
      expect(order.status).toBe("filled");
      expect(order.provider).toBe("tradovate");
    });
  });

  describe("getHealth", () => {
    it("reports healthy when token exists", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: "tok" }),
      });

      const adapter = makeAdapter();
      await adapter.connect();
      const health = await adapter.getHealth();

      expect(health.provider).toBe("tradovate");
      expect(health.status).toBe("healthy");
      expect(health.connected).toBe(true);
    });

    it("reports unknown when not connected", async () => {
      const adapter = makeAdapter();
      const health = await adapter.getHealth();

      expect(health.status).toBe("unknown");
      expect(health.connected).toBe(false);
    });
  });

  describe("disconnect", () => {
    it("clears token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: "tok" }),
      });

      const adapter = makeAdapter();
      await adapter.connect();
      await adapter.disconnect();

      const health = await adapter.getHealth();
      expect(health.connected).toBe(false);
    });
  });
});
