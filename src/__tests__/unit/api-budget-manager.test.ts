/**
 * Unit tests for APIBudgetManager.
 *
 * Tests budget enforcement, usage tracking, and emergency stop —
 * critical for cost control in production.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { APIBudgetManager, createBudgetManager } from "../../ai/api-budget-manager.js";

describe("APIBudgetManager", () => {
  let manager: APIBudgetManager;

  beforeEach(() => {
    manager = new APIBudgetManager({
      openaiDailyBudget: 0.50,
      openaiMonthlyBudget: 10.00,
      openaiPerRequestLimit: 0.01,
      openaiAlertThreshold: 0.80,
      externalAPIDailyQuota: 100,
      externalAPIRateLimit: 10,
      emergencyStopEnabled: true,
    });
  });

  it("allows a request within budget", () => {
    expect(manager.canUseOpenAI(0.003).allowed).toBe(true);
  });

  it("rejects request exceeding per-request limit", () => {
    const result = manager.canUseOpenAI(0.02);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/per-request limit/);
  });

  it("rejects request that would exceed daily budget", () => {
    manager.trackOpenAIUsage(0.498, 1000, "gpt-4o-mini");
    const result = manager.canUseOpenAI(0.005); // 0.503 > 0.50
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/[Dd]aily budget/);
  });

  it("tracks usage counters and accumulated cost", () => {
    manager.trackOpenAIUsage(0.001, 200, "gpt-4o-mini");
    manager.trackOpenAIUsage(0.002, 400, "gpt-4o-mini");
    const stats = manager.getAllUsageStats().find((s) => s.service === "openai");
    expect(stats?.requestsToday).toBe(2);
    expect(stats?.costToday).toBeCloseTo(0.003, 5);
  });

  it("does not emergency-stop on fresh instance", () => {
    expect(manager.shouldEmergencyStop().stop).toBe(false);
  });

  it("triggers emergency stop when daily budget is exceeded", () => {
    manager.trackOpenAIUsage(0.51, 50000, "gpt-4o-mini");
    const result = manager.shouldEmergencyStop();
    expect(result.stop).toBe(true);
    expect(result.reason).toMatch(/[Dd]aily budget/);
  });

  it("respects emergencyStopEnabled: false", () => {
    const noStop = new APIBudgetManager({ openaiDailyBudget: 0.10, emergencyStopEnabled: false });
    noStop.trackOpenAIUsage(0.50, 10000, "gpt-4o-mini");
    expect(noStop.shouldEmergencyStop().stop).toBe(false);
  });

  it("estimates cost — positive and scales with length", () => {
    const shortCost = manager.estimateOpenAICost("short");
    const longCost = manager.estimateOpenAICost("a".repeat(10000));
    expect(shortCost).toBeGreaterThan(0);
    expect(longCost).toBeGreaterThan(shortCost);
  });

  it("canUseExternalAPI allows initially and rejects on quota exhaustion", () => {
    expect(manager.canUseExternalAPI("awin").allowed).toBe(true);
    for (let i = 0; i < 100; i++) manager.trackExternalAPIUsage("awin");
    expect(manager.canUseExternalAPI("awin").allowed).toBe(false);
  });

  it("resetAll clears counters and allows fresh usage", () => {
    manager.trackOpenAIUsage(0.49, 100000, "gpt-4o-mini");
    manager.resetAll();
    expect(manager.getAllUsageStats().length).toBe(0);
    expect(manager.canUseOpenAI(0.005).allowed).toBe(true);
  });

  it("createBudgetManager factory respects config overrides", () => {
    const m = createBudgetManager({ openaiPerRequestLimit: 0.001 });
    expect(m).toBeInstanceOf(APIBudgetManager);
    expect(m.canUseOpenAI(0.002).allowed).toBe(false);
  });
});
