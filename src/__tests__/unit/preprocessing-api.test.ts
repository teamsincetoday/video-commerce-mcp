// Unit tests for preprocessTranscript, preprocessTranscriptWithOptions, preprocessBatchWithKnowledge
import { describe, it, expect } from "vitest";
import {
  preprocessTranscript,
  preprocessTranscriptWithOptions,
} from "../../transcript/advanced-preprocessor.js";
import { preprocessBatchWithKnowledge } from "../../transcript/knowledge-preprocessor.js";

const GARDENING_TEXT =
  "Today we're planting lavender and roses in the garden. " +
  "I'll show you the best trowel and pruning shears for the job. " +
  "The Heuchera and Salvia look beautiful this time of year.";

describe("preprocessTranscript", () => {
  it("returns a PreprocessingResult with required fields", async () => {
    const result = await preprocessTranscript(GARDENING_TEXT, "vid123");
    expect(result.originalText).toBe(GARDENING_TEXT);
    expect(result.processedText).toBeDefined();
    expect(typeof result.processedText).toBe("string");
    expect(result.stages).toBeInstanceOf(Array);
    expect(result.stages.length).toBeGreaterThan(0);
    expect(result.metadata).toBeDefined();
  });

  it("populates metadata processingTime and botanicalTermsFound", async () => {
    const result = await preprocessTranscript(GARDENING_TEXT);
    expect(result.metadata.processingTime).toBeGreaterThanOrEqual(0);
    expect(result.metadata.botanicalTermsFound).toBeInstanceOf(Array);
  });

  it("handles empty transcript without throwing", async () => {
    const result = await preprocessTranscript("");
    expect(result.originalText).toBe("");
    expect(result.processedText).toBe("");
    expect(result.originalLength).toBe(0);
    expect(result.stages).toBeInstanceOf(Array);
  });

  it("reduces length for a long transcript", async () => {
    // Use >10 000 chars so Stage 6 maxLength cap (8000) is guaranteed to fire
    const longText = GARDENING_TEXT.repeat(65); // ~11 310 chars
    const result = await preprocessTranscript(longText);
    expect(result.processedLength).toBeLessThan(result.originalLength);
    expect(result.reductionPercentage).toBeGreaterThan(0);
  });
});

describe("preprocessTranscriptWithOptions", () => {
  it("respects maxLength option", async () => {
    // Stage 6 appends "..." (3 chars) when truncating, so maxLength: 97 → output ≤ 100
    const result = await preprocessTranscriptWithOptions(
      GARDENING_TEXT.repeat(50),
      { maxLength: 97 },
    );
    expect(result.processedText.length).toBeLessThanOrEqual(100);
  });

  it("works with enableAggressiveFiltering=false", async () => {
    // With aggressive filtering disabled Stage 3 entity culling is skipped;
    // short texts can expand slightly due to sentence-boundary normalisation in Stage 2.
    const result = await preprocessTranscriptWithOptions(GARDENING_TEXT, {
      enableAggressiveFiltering: false,
    });
    expect(result.stages).toBeInstanceOf(Array);
    expect(result.processedText).toBeDefined();
    expect(typeof result.processedLength).toBe("number");
  });
});

describe("preprocessBatchWithKnowledge", () => {
  it("returns empty Map for empty input array", async () => {
    const result = await preprocessBatchWithKnowledge([]);
    expect(result.size).toBe(0);
  });

  it("returns a Map with one entry per input transcript", async () => {
    const input = [
      { id: "v1", text: GARDENING_TEXT },
      { id: "v2", text: "hello world" },
    ];
    const result = await preprocessBatchWithKnowledge(input);
    expect(result.size).toBe(2);
    expect(result.has("v1")).toBe(true);
    expect(result.has("v2")).toBe(true);
  });

  it("each entry has processedText and knowledgeSources", async () => {
    const result = await preprocessBatchWithKnowledge([
      { id: "v1", text: GARDENING_TEXT },
    ]);
    const r = result.get("v1");
    expect(r).toBeDefined();
    expect(typeof r!.processedText).toBe("string");
    expect(r!.knowledgeSources).toBeDefined();
    expect(typeof r!.knowledgeSources.plantDictionary).toBe("boolean");
  });
});
