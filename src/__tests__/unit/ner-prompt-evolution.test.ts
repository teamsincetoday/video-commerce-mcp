import { describe, it, expect } from "vitest";
import {
  getDefaultPrompt,
  getActivePromptVersion,
  createPromptVersion,
  analyzePromptPerformance,
  calculateQualityScore,
  comparePromptVersions,
} from "../../ai/ner-prompt-evolution.js";
import type { PromptVersionRecord, PromptMetric } from "../../ai/ner-prompt-evolution.js";

const metric = (entities: number, genusOnly: number, corrections: number, confidence: number): PromptMetric =>
  ({ date: new Date("2026-01-01"), entitiesExtracted: entities, genusOnlyEntities: genusOnly, correctionsMade: corrections, avgConfidence: confidence });
const version = (v: string, traffic: number, active = true): PromptVersionRecord =>
  ({ version: v, promptTemplate: `t-${v}`, systemMessage: "sys", temperature: 0.3, maxTokens: 4000, modelName: "gpt-4o-mini", focusAreas: [], trafficPercentage: traffic, isActive: active });
const fiveOf = (e: number, g: number, c: number, conf: number) => Array.from({ length: 5 }, () => metric(e, g, c, conf));

describe("getDefaultPrompt", () => {
  it("returns expected metadata and gpt-4o-mini model", () => {
    const p = getDefaultPrompt();
    expect(p.version).toBe("v1.0-default");
    expect(p.modelName).toBe("gpt-4o-mini");
    expect(p.temperature).toBe(0.3);
    expect(p.maxTokens).toBe(4000);
    expect(p.promptTemplate).toContain("{{transcript}}");
  });
});

describe("getActivePromptVersion", () => {
  it("falls back to default with no args or empty array", () => {
    expect(getActivePromptVersion().version).toBe("v1.0-default");
    expect(getActivePromptVersion([]).version).toBe("v1.0-default");
  });
  it("falls back to default when no active versions", () => {
    expect(getActivePromptVersion([version("v2", 100, false)]).version).toBe("v1.0-default");
  });
  it("returns active version at 100% traffic", () => {
    expect(getActivePromptVersion([version("v2", 100)]).version).toBe("v2");
  });
});

describe("createPromptVersion", () => {
  const v = createPromptVersion({ version: "v2", promptTemplate: "t", systemMessage: "s", changeDescription: "c", focusAreas: ["f"] });
  it("inactive by default with zero traffic and correct defaults", () => {
    expect(v.isActive).toBe(false);
    expect(v.trafficPercentage).toBe(0);
    expect(v.temperature).toBe(0.3);
    expect(v.maxTokens).toBe(4000);
  });
});

describe("analyzePromptPerformance", () => {
  it("returns null with fewer than 5 metrics", () => {
    expect(analyzePromptPerformance(version("v1", 100), [metric(10, 1, 0, 0.9)])).toBeNull();
  });
  it("detects high_genus_only_rate weakness (>15%)", () => {
    expect(analyzePromptPerformance(version("v1", 100), fiveOf(100, 20, 0, 0.9))!.weaknesses).toContain("high_genus_only_rate");
  });
  it("detects low_genus_only_rate strength (<5%)", () => {
    expect(analyzePromptPerformance(version("v1", 100), fiveOf(100, 2, 1, 0.9))!.strengths).toContain("low_genus_only_rate");
  });
  it("detects low_confidence weakness (<0.7)", () => {
    expect(analyzePromptPerformance(version("v1", 100), fiveOf(100, 3, 2, 0.5))!.weaknesses).toContain("low_confidence");
  });
  it("detects high_confidence strength (>0.85)", () => {
    expect(analyzePromptPerformance(version("v1", 100), fiveOf(100, 2, 1, 0.95))!.strengths).toContain("high_confidence");
  });
});

describe("calculateQualityScore", () => {
  it("returns 100 for perfect inputs", () => {
    expect(calculateQualityScore(0, 0, 1)).toBe(100);
  });
  it("clamps to >= 0 for extreme inputs", () => {
    expect(calculateQualityScore(1, 1, 0)).toBeGreaterThanOrEqual(0);
  });
  it("higher confidence improves score", () => {
    expect(calculateQualityScore(0.05, 0.03, 0.9)).toBeGreaterThan(calculateQualityScore(0.05, 0.03, 0.5));
  });
});

describe("comparePromptVersions", () => {
  const good = fiveOf(100, 2, 1, 0.95);
  const bad = fiveOf(100, 30, 20, 0.5);
  it("declares A winner when A clearly outperforms B", () => {
    expect(comparePromptVersions("A", good, "B", bad).winner).toBe("A");
  });
  it("declares B winner when B clearly outperforms A", () => {
    expect(comparePromptVersions("A", bad, "B", good).winner).toBe("B");
  });
  it("returns tie for identical metrics", () => {
    expect(comparePromptVersions("A", good, "B", good).winner).toBe("tie");
  });
});
