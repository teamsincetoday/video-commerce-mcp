/** Unit tests: detectVertical keyword path (no LLM) and LLM fallback paths. */
import { describe, it, expect, vi } from "vitest";
import { detectVertical } from "../../ai/vertical-detector.js";
import type OpenAI from "openai";

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function mockLLM(response?: string): OpenAI {
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue({
      choices: [{ message: { content: response ?? "{}" } }],
    }) } },
  } as unknown as OpenAI;
}

function failLLM(): OpenAI {
  return {
    chat: { completions: { create: vi.fn().mockRejectedValue(new Error("err")) } },
  } as unknown as OpenAI;
}

describe("detectVertical", () => {
  it("returns registered vertical when keyword density > 15%", async () => {
    const kws = ["garden", "plant", "soil", "grow", "seed", "prune", "fertilizer", "compost", "mulch", "water"];
    const map = new Map([["gardening", kws]]);
    const result = await detectVertical(kws.join(" "), failLLM(), map, mockLogger);
    expect(result.verticalId).toBe("gardening");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.detectedCategory).toBe("gardening");
  });

  it("picks vertical with highest keyword density", async () => {
    const map = new Map([
      ["cooking", ["cook", "recipe", "ingredient", "pan", "oven"]],
      ["gardening", ["garden", "plant", "soil", "grow", "seed", "prune", "compost", "mulch"]],
    ]);
    const result = await detectVertical("garden plant soil grow seed prune compost mulch", failLLM(), map, mockLogger);
    expect(result.verticalId).toBe("gardening");
  });

  it("normalizes confidence to max 0.95 on full keyword match", async () => {
    const kws = ["aa", "bb", "cc", "dd", "ee", "ff", "gg", "hh", "ii", "jj"];
    const map = new Map([["test", kws]]);
    const result = await detectVertical(kws.join(" "), failLLM(), map, mockLogger);
    expect(result.confidence).toBe(0.95); // score=1.0 → min(1.0 * 3, 0.95)
  });

  it("score at exactly 0.15 falls through to LLM path", async () => {
    const kws = ["zoo","bar","fox","cat","dog","elk","ant","bee","cow","dam","eel","fly","gnu","hen","ibis","jay","koi","lynx","mole","newt"];
    const map = new Map([["animals", kws]]);
    const llm = JSON.stringify({ category: "other", confidence: 0.1, matchedVertical: "unknown" });
    const result = await detectVertical("zoo bar fox", mockLLM(llm), map, mockLogger);
    expect(result.verticalId).toBe("unknown"); // 3/20 = 0.15 — not > 0.15
  });

  it("returns unknownResult on LLM failure", async () => {
    const map = new Map<string, string[]>();
    const result = await detectVertical("hello world", failLLM(), map, mockLogger);
    expect(result.verticalId).toBe("unknown");
    expect(result.confidence).toBe(0);
    expect(result.detectedCategory).toBe("unknown");
  });

  it("returns matched vertical from LLM response", async () => {
    const map = new Map([["gardening", ["unrelated1", "unrelated2", "unrelated3", "unrelated4"]]]);
    const llm = JSON.stringify({
      category: "cooking", confidence: 0.8, matchedVertical: "cooking",
      primaryEntityType: "dish", primaryEntityTypePlural: "dishes",
      inclusionKeywords: ["cook", "recipe"], displayName: "Cooking",
    });
    const result = await detectVertical("some food text", mockLLM(llm), map, mockLogger);
    expect(result.verticalId).toBe("cooking");
    expect(result.confidence).toBe(0.8);
    expect(result.detectedCategory).toBe("cooking");
    expect(result.suggestedConfig.displayName).toBe("Cooking");
  });

  it("returns unknownResult when LLM response contains no JSON", async () => {
    const map = new Map<string, string[]>();
    const result = await detectVertical("hello", mockLLM("no json here"), map, mockLogger);
    expect(result.verticalId).toBe("unknown");
  });

  it("sets verticalId to unknown when LLM matchedVertical is unknown", async () => {
    const map = new Map<string, string[]>();
    const llm = JSON.stringify({ category: "tech", confidence: 0.7, matchedVertical: "unknown" });
    const result = await detectVertical("code gadget", mockLLM(llm), map, mockLogger);
    expect(result.verticalId).toBe("unknown");
    expect(result.detectedCategory).toBe("tech");
  });

  it("handles empty registeredKeywords map", async () => {
    const map = new Map<string, string[]>();
    const result = await detectVertical("garden plant", failLLM(), map, mockLogger);
    expect(result.verticalId).toBe("unknown");
  });
});
