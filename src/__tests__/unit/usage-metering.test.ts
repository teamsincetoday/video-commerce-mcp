/**
 * Unit tests for UsageMetering — rate limiting, record, stats, cleanup, factory.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { UsageMetering, createUsageMetering } from "../../usage-metering.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

describe("UsageMetering", () => {
  let metering: UsageMetering;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), "mcp-metering-test-"));
    metering = new UsageMetering({ dbPath: resolve(tempDir, "test.db") });
  });
  afterEach(() => {
    metering.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("checkRateLimit allows first request with full remaining quota", () => {
    const r = metering.checkRateLimit("a1");
    expect(r.allowed).toBe(true);
    expect(r.remaining.perMinute).toBe(30);
    expect(r.remaining.perHour).toBe(500);
    expect(r.remaining.perDay).toBe(5000);
  });

  it("checkRateLimit blocks when per-minute limit is exceeded", () => {
    const m = new UsageMetering({
      dbPath: resolve(tempDir, "limit.db"),
      rateLimits: { perMinute: 2, perHour: 100, perDay: 1000 },
    });
    m.record({ agentId: "b1", toolName: "t", paymentMethod: "free_tier" });
    m.record({ agentId: "b1", toolName: "t", paymentMethod: "free_tier" });
    const r = m.checkRateLimit("b1");
    expect(r.allowed).toBe(false);
    expect(r.limitExceeded).toBe("per_minute");
    expect(r.retryAfterSeconds).toBe(60);
    m.close();
  });

  it("record increments totalCalls in getAgentStats", () => {
    metering.record({ agentId: "a2", toolName: "analyze_video", paymentMethod: "free_tier" });
    metering.record({ agentId: "a2", toolName: "analyze_video", paymentMethod: "free_tier" });
    const stats = metering.getAgentStats("a2");
    expect(stats.totalCalls).toBe(2);
    expect(stats.agentId).toBe("a2");
  });

  it("record tracks revenue from x402 calls", () => {
    metering.record({ agentId: "a3", toolName: "t", paymentMethod: "x402", amountUsd: 0.01 });
    metering.record({ agentId: "a3", toolName: "t", paymentMethod: "x402", amountUsd: 0.01 });
    expect(metering.getAgentStats("a3").totalRevenue).toBeCloseTo(0.02);
  });

  it("record tracks error rate via success flag", () => {
    metering.record({ agentId: "a4", toolName: "t", paymentMethod: "free_tier", success: false });
    metering.record({ agentId: "a4", toolName: "t", paymentMethod: "free_tier", success: true });
    expect(metering.getAgentStats("a4").errorRate).toBeCloseTo(0.5);
  });

  it("getAgentStats returns zeros for unknown agent", () => {
    const stats = metering.getAgentStats("nobody");
    expect(stats.totalCalls).toBe(0);
    expect(stats.totalRevenue).toBe(0);
    expect(stats.errorRate).toBe(0);
  });

  it("getOverviewStats returns zeros on empty database", () => {
    const stats = metering.getOverviewStats();
    expect(stats.totalCalls).toBe(0);
    expect(stats.totalRevenue).toBe(0);
    expect(stats.uniqueAgents).toBe(0);
  });

  it("getOverviewStats counts unique agents across calls", () => {
    metering.record({ agentId: "x", toolName: "t", paymentMethod: "free_tier" });
    metering.record({ agentId: "y", toolName: "t", paymentMethod: "free_tier" });
    metering.record({ agentId: "x", toolName: "t", paymentMethod: "free_tier" });
    expect(metering.getOverviewStats().uniqueAgents).toBe(2);
  });

  it("cleanup returns 0 when no records exceed retention period", () => {
    metering.record({ agentId: "c1", toolName: "t", paymentMethod: "free_tier" });
    expect(metering.cleanup(90)).toBe(0);
  });

  it("createUsageMetering factory creates a working instance", () => {
    const m = createUsageMetering({ dbPath: resolve(tempDir, "factory.db") });
    expect(m.checkRateLimit("test").allowed).toBe(true);
    m.close();
  });
});
