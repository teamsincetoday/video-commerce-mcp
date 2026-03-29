/**
 * Unit tests for PaymentMiddleware (x402-middleware.ts).
 * Covers in-memory paths only — no network calls required.
 */

import { describe, it, expect } from "vitest";
import {
  PaymentMiddleware,
  DEFAULT_TOOL_PRICING,
} from "../../x402-middleware.js";

const BASE_CONFIG = {
  enabled: true,
  walletAddress: "0xtest",
  freeTierDailyLimit: 3,
  pricing: {},
  apiKeys: ["valid-key-abc"],
};

describe("PaymentMiddleware", () => {
  describe("disabled mode", () => {
    it("authorizes all requests when enabled=false", async () => {
      const mw = new PaymentMiddleware({ ...BASE_CONFIG, enabled: false });
      const result = await mw.authorize({ toolName: "analyze_video" });
      expect(result.authorized).toBe(true);
      expect((result as { method: string }).method).toBe("disabled");
    });
  });

  describe("API key auth", () => {
    it("authorizes valid API key", async () => {
      const mw = new PaymentMiddleware(BASE_CONFIG);
      const result = await mw.authorize({ toolName: "analyze_video", apiKey: "valid-key-abc" });
      expect(result.authorized).toBe(true);
      expect((result as { method: string }).method).toBe("api_key");
    });

    it("falls through to free tier on invalid API key", async () => {
      const mw = new PaymentMiddleware(BASE_CONFIG);
      const result = await mw.authorize({ toolName: "analyze_video", apiKey: "wrong-key" });
      expect(result.authorized).toBe(true);
      expect((result as { method: string }).method).toBe("free_tier");
    });
  });

  describe("free tier", () => {
    it("grants full quota to fresh agent", () => {
      const mw = new PaymentMiddleware(BASE_CONFIG);
      expect(mw.getFreeTierRemaining("agent-1")).toBe(3);
    });

    it("depletes quota on each authorized call", async () => {
      const mw = new PaymentMiddleware(BASE_CONFIG);
      await mw.authorize({ toolName: "discover_opportunities", agentId: "agent-x" });
      await mw.authorize({ toolName: "discover_opportunities", agentId: "agent-x" });
      expect(mw.getFreeTierRemaining("agent-x")).toBe(1);
    });

    it("returns unauthorized with requiredPayment after exhaustion", async () => {
      const mw = new PaymentMiddleware({ ...BASE_CONFIG, freeTierDailyLimit: 1 });
      await mw.authorize({ toolName: "analyze_video", agentId: "agent-z" });
      const result = await mw.authorize({ toolName: "analyze_video", agentId: "agent-z" });
      expect(result.authorized).toBe(false);
      expect((result as { requiredPayment?: unknown }).requiredPayment).toBeDefined();
    });
  });

  describe("getToolPrice", () => {
    it("returns default pricing for analyze_video", () => {
      const mw = new PaymentMiddleware(BASE_CONFIG);
      expect(mw.getToolPrice("analyze_video")).toBe(DEFAULT_TOOL_PRICING["analyze_video"]);
    });

    it("returns deep pricing for analyze_video:deep", () => {
      const mw = new PaymentMiddleware(BASE_CONFIG);
      const price = mw.getToolPrice("analyze_video", { analysis_depth: "deep" });
      expect(price).toBe(DEFAULT_TOOL_PRICING["analyze_video:deep"]);
    });

    it("multiplies per-video for batch_analyze", () => {
      const mw = new PaymentMiddleware(BASE_CONFIG);
      const price = mw.getToolPrice("batch_analyze", { youtube_urls: ["a", "b", "c"] });
      expect(price).toBeCloseTo(DEFAULT_TOOL_PRICING["batch_analyze"]! * 3);
    });
  });

  describe("getReceiptStats", () => {
    it("aggregates receipt counts and method breakdown", async () => {
      const mw = new PaymentMiddleware({ ...BASE_CONFIG, freeTierDailyLimit: 5 });
      await mw.authorize({ toolName: "analyze_video", agentId: "stat-agent" });
      await mw.authorize({ toolName: "get_seasonal_calendar", agentId: "stat-agent" });
      const stats = mw.getReceiptStats();
      expect(stats.totalReceipts).toBe(2);
      expect(stats.byMethod["free_tier"]).toBe(2);
      expect(stats.byTool["analyze_video"]?.count).toBe(1);
    });
  });
});
