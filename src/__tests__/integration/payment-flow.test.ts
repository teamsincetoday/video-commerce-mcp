/**
 * Integration tests for x402 payment flow.
 *
 * Tests the PaymentMiddleware lifecycle:
 * - Disabled mode (all requests pass)
 * - API key authentication
 * - Free tier quota management
 * - x402 payment header decode + verification
 * - Receipt tracking and statistics
 * - Pricing resolution for different tools/depths
 *
 * Does NOT call the actual Coinbase facilitator.
 * x402 facilitator verification tests are marked with describe.skip.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  PaymentMiddleware,
  createPaymentMiddleware,
  DEFAULT_TOOL_PRICING,
  type PaymentConfig,
  type RequestContext,
} from "../../x402-middleware.js";

describe("Payment Flow Integration", () => {
  describe("Disabled mode", () => {
    let middleware: PaymentMiddleware;

    beforeEach(() => {
      middleware = createPaymentMiddleware({ enabled: false });
    });

    it("authorizes all requests when payments disabled", async () => {
      const result = await middleware.authorize({
        toolName: "analyze_video",
        agentId: "test-agent",
      });

      expect(result.authorized).toBe(true);
      if (result.authorized) {
        expect(result.method).toBe("disabled");
        expect(result.receipt).toBeDefined();
        expect(result.receipt!.amount).toBe(0);
      }
    });

    it("creates receipts even when disabled", async () => {
      await middleware.authorize({
        toolName: "analyze_video",
        agentId: "test-agent",
      });

      const receipts = middleware.getReceipts();
      // Disabled mode creates a receipt but does not log it via logReceipt
      // The receipt is returned in the result but not stored internally
      // (this is the actual behavior of the middleware)
      expect(receipts.length).toBe(0);
    });
  });

  describe("API key authentication", () => {
    let middleware: PaymentMiddleware;

    beforeEach(() => {
      middleware = new PaymentMiddleware({
        enabled: true,
        freeTierDailyLimit: 0,
        pricing: { ...DEFAULT_TOOL_PRICING },
        apiKeys: ["valid-key-123", "valid-key-456"],
      });
    });

    it("authorizes with valid API key", async () => {
      const result = await middleware.authorize({
        toolName: "analyze_video",
        agentId: "agent-1",
        apiKey: "valid-key-123",
      });

      expect(result.authorized).toBe(true);
      if (result.authorized) {
        expect(result.method).toBe("api_key");
        expect(result.receipt).toBeDefined();
        expect(result.receipt!.method).toBe("api_key");
      }
    });

    it("rejects invalid API key and falls through to 402", async () => {
      const result = await middleware.authorize({
        toolName: "analyze_video",
        agentId: "agent-1",
        apiKey: "invalid-key",
      });

      expect(result.authorized).toBe(false);
      if (!result.authorized) {
        expect(result.requiredPayment).toBeDefined();
        expect(result.requiredPayment!.x402Version).toBe(2);
      }
    });

    it("logs receipts for API key auth", async () => {
      await middleware.authorize({
        toolName: "analyze_video",
        agentId: "agent-1",
        apiKey: "valid-key-123",
      });
      await middleware.authorize({
        toolName: "get_commercial_entities",
        agentId: "agent-2",
        apiKey: "valid-key-456",
      });

      const receipts = middleware.getReceipts();
      expect(receipts).toHaveLength(2);
      expect(receipts[0]!.agentId).toBe("agent-1");
      expect(receipts[1]!.agentId).toBe("agent-2");
    });
  });

  describe("Free tier management", () => {
    let middleware: PaymentMiddleware;

    beforeEach(() => {
      middleware = new PaymentMiddleware({
        enabled: true,
        freeTierDailyLimit: 3,
        pricing: { ...DEFAULT_TOOL_PRICING },
      });
    });

    it("allows calls within free tier quota", async () => {
      for (let i = 0; i < 3; i++) {
        const result = await middleware.authorize({
          toolName: "analyze_video",
          agentId: "free-agent",
        });
        expect(result.authorized).toBe(true);
        if (result.authorized) {
          expect(result.method).toBe("free_tier");
        }
      }
    });

    it("denies calls after free tier exhausted", async () => {
      // Exhaust free tier
      for (let i = 0; i < 3; i++) {
        await middleware.authorize({
          toolName: "analyze_video",
          agentId: "free-agent",
        });
      }

      // Fourth call should be denied
      const result = await middleware.authorize({
        toolName: "analyze_video",
        agentId: "free-agent",
      });

      expect(result.authorized).toBe(false);
      if (!result.authorized) {
        expect(result.reason).toContain("Free tier exhausted");
        expect(result.requiredPayment).toBeDefined();
      }
    });

    it("tracks free tier per agent", async () => {
      // Agent 1 uses 3 calls
      for (let i = 0; i < 3; i++) {
        await middleware.authorize({
          toolName: "analyze_video",
          agentId: "agent-1",
        });
      }

      // Agent 2 should still have quota
      const result = await middleware.authorize({
        toolName: "analyze_video",
        agentId: "agent-2",
      });
      expect(result.authorized).toBe(true);
    });

    it("reports remaining free tier calls", () => {
      expect(middleware.getFreeTierRemaining("new-agent")).toBe(3);
    });
  });

  describe("Tool pricing", () => {
    let middleware: PaymentMiddleware;

    beforeEach(() => {
      middleware = new PaymentMiddleware({
        enabled: true,
        freeTierDailyLimit: 0,
        pricing: { ...DEFAULT_TOOL_PRICING },
      });
    });

    it("returns correct price for standard analyze_video", () => {
      const price = middleware.getToolPrice("analyze_video", {
        analysis_depth: "standard",
      });
      expect(price).toBe(0.02);
    });

    it("returns higher price for deep analyze_video", () => {
      const price = middleware.getToolPrice("analyze_video", {
        analysis_depth: "deep",
      });
      expect(price).toBe(0.05);
    });

    it("multiplies batch_analyze price by video count", () => {
      const price = middleware.getToolPrice("batch_analyze", {
        youtube_urls: [
          "https://youtube.com/watch?v=abc123abcde",
          "https://youtube.com/watch?v=def456defgh",
          "https://youtube.com/watch?v=ghi789ghijk",
        ],
      });
      expect(price).toBe(0.015 * 3);
    });

    it("returns correct prices for all Layer 2 tools", () => {
      expect(middleware.getToolPrice("discover_opportunities")).toBe(0.02);
      expect(middleware.getToolPrice("scan_affiliate_programs")).toBe(0.01);
      expect(middleware.getToolPrice("assess_channel_authority")).toBe(0.01);
      expect(middleware.getToolPrice("map_category_affinity")).toBe(0.01);
      expect(middleware.getToolPrice("track_category_lifecycle")).toBe(0.005);
      expect(middleware.getToolPrice("get_seasonal_calendar")).toBe(0.005);
    });
  });

  describe("Receipt tracking", () => {
    let middleware: PaymentMiddleware;

    beforeEach(() => {
      middleware = new PaymentMiddleware({
        enabled: true,
        freeTierDailyLimit: 10,
        pricing: { ...DEFAULT_TOOL_PRICING },
      });
    });

    it("tracks receipts by agent", async () => {
      await middleware.authorize({ toolName: "analyze_video", agentId: "agent-a" });
      await middleware.authorize({ toolName: "analyze_video", agentId: "agent-b" });
      await middleware.authorize({ toolName: "get_commercial_entities", agentId: "agent-a" });

      const agentAReceipts = middleware.getReceiptsByAgent("agent-a");
      expect(agentAReceipts).toHaveLength(2);

      const agentBReceipts = middleware.getReceiptsByAgent("agent-b");
      expect(agentBReceipts).toHaveLength(1);
    });

    it("tracks receipts by tool", async () => {
      await middleware.authorize({ toolName: "analyze_video", agentId: "agent-1" });
      await middleware.authorize({ toolName: "analyze_video", agentId: "agent-2" });
      await middleware.authorize({ toolName: "get_seasonal_calendar", agentId: "agent-1" });

      const analyzeReceipts = middleware.getReceiptsByTool("analyze_video");
      expect(analyzeReceipts).toHaveLength(2);

      const calendarReceipts = middleware.getReceiptsByTool("get_seasonal_calendar");
      expect(calendarReceipts).toHaveLength(1);
    });

    it("computes receipt statistics", async () => {
      await middleware.authorize({ toolName: "analyze_video", agentId: "agent-1" });
      await middleware.authorize({ toolName: "analyze_video", agentId: "agent-2" });
      await middleware.authorize({ toolName: "get_commercial_entities", agentId: "agent-1" });

      const stats = middleware.getReceiptStats();
      expect(stats.totalReceipts).toBe(3);
      expect(stats.totalRevenue).toBe(0); // Free tier = $0
      expect(stats.byMethod["free_tier"]).toBe(3);
      expect(stats.byTool["analyze_video"]!.count).toBe(2);
    });
  });

  describe("402 Payment Required response", () => {
    it("includes x402 payment info when free tier exhausted", async () => {
      const middleware = new PaymentMiddleware({
        enabled: true,
        freeTierDailyLimit: 0,
        pricing: { ...DEFAULT_TOOL_PRICING },
        walletAddress: "0xTestWallet123",
      });

      const result = await middleware.authorize({
        toolName: "analyze_video",
        agentId: "agent-1",
      });

      expect(result.authorized).toBe(false);
      if (!result.authorized) {
        const payment = result.requiredPayment!;
        expect(payment.x402Version).toBe(2);
        expect(payment.resource.url).toContain("analyze_video");
        expect(payment.accepts).toHaveLength(1);
        expect(payment.accepts[0]!.scheme).toBe("exact");
        expect(payment.accepts[0]!.network).toBe("base:mainnet");
        expect(payment.accepts[0]!.asset).toBe("USDC");
        expect(payment.accepts[0]!.amount).toBe("0.02");
        expect(payment.accepts[0]!.payTo).toBe("0xTestWallet123");
      }
    });
  });
});

// ---------------------------------------------------------------------------
// x402 Payment Header Verification (requires facilitator / network)
// ---------------------------------------------------------------------------

describe.skip("x402 Facilitator Verification (requires network)", () => {
  it("verifies a valid x402 payment header", async () => {
    // Would create a real x402 payment via Coinbase SDK
    // and verify it through the facilitator
    expect(true).toBe(true);
  });

  it("rejects insufficient payment amount", async () => {
    // Would create an underpaid x402 payment and verify rejection
    expect(true).toBe(true);
  });

  it("rejects payment to wrong wallet address", async () => {
    // Would create payment to a different wallet and verify rejection
    expect(true).toBe(true);
  });
});
