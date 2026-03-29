/**
 * Tests for intelligence module pure functions:
 *   - editorial-quality: determineEditorialTier, getDefaultScores
 *   - objective-extraction: selectTopSectionsForAI
 */
import { describe, it, expect } from "vitest";
import {
  determineEditorialTier,
  getDefaultScores,
} from "../../intelligence/editorial-quality.js";
import { selectTopSectionsForAI } from "../../intelligence/objective-extraction.js";

// ── determineEditorialTier ───────────────────────────────────────────────────

describe("determineEditorialTier", () => {
  it("FEATURED at boundary 70", () => expect(determineEditorialTier(70)).toBe("FEATURED"));
  it("FEATURED at 100", () => expect(determineEditorialTier(100)).toBe("FEATURED"));
  it("FEATURED mid-range 85", () => expect(determineEditorialTier(85)).toBe("FEATURED"));
  it("SUPPORTING at lower boundary 60", () => expect(determineEditorialTier(60)).toBe("SUPPORTING"));
  it("SUPPORTING at upper boundary 69", () => expect(determineEditorialTier(69)).toBe("SUPPORTING"));
  it("ARCHIVE just below SUPPORTING (59)", () => expect(determineEditorialTier(59)).toBe("ARCHIVE"));
  it("ARCHIVE at 0", () => expect(determineEditorialTier(0)).toBe("ARCHIVE"));
  it("ARCHIVE at 30", () => expect(determineEditorialTier(30)).toBe("ARCHIVE"));
});

// ── getDefaultScores ─────────────────────────────────────────────────────────

describe("getDefaultScores", () => {
  it("all 6 dimensions score 50", () => {
    const s = getDefaultScores();
    expect(s.visualQuality).toBe(50);
    expect(s.contentDepth).toBe(50);
    expect(s.seasonalRelevance).toBe(50);
    expect(s.designContext).toBe(50);
    expect(s.narrativeStructure).toBe(50);
    expect(s.botanicalLiteracy).toBe(50);
  });
  it("overallScore is 50", () => expect(getDefaultScores().overallScore).toBe(50));
  it("editorialTier is SUPPORTING", () => expect(getDefaultScores().editorialTier).toBe("SUPPORTING"));
  it("editorialNotes is non-empty", () => expect(getDefaultScores().editorialNotes.length).toBeGreaterThan(0));
  it("recommendedSections is empty", () => expect(getDefaultScores().recommendedSections).toEqual([]));
});

// ── selectTopSectionsForAI ───────────────────────────────────────────────────

const mkSections = (scores: number[]) =>
  scores.map((q, i) => ({ id: `s${i}`, text: `t${i}`, videoTitle: `v${i}`, keyConcepts: ["c"], qualityScore: q }));

describe("selectTopSectionsForAI", () => {
  it("sorts descending by qualityScore", () => {
    const result = selectTopSectionsForAI(mkSections([30, 80, 50]), 3);
    expect(result.map((r) => r.id)).toEqual(["s1", "s2", "s0"]);
  });
  it("respects topN limit", () => {
    expect(selectTopSectionsForAI(mkSections([90, 80, 70, 60, 50]), 3).length).toBe(3);
  });
  it("returns empty array for empty input", () => {
    expect(selectTopSectionsForAI([], 10)).toEqual([]);
  });
  it("strips qualityScore from output but preserves id, text, videoTitle, keyConcepts", () => {
    const result = selectTopSectionsForAI(mkSections([75]), 1);
    expect(result[0]).not.toHaveProperty("qualityScore");
    expect(result[0]).toHaveProperty("id", "s0");
    expect(result[0]).toHaveProperty("keyConcepts");
  });
  it("default topN is 100", () => {
    const sections = mkSections(Array.from({ length: 150 }, (_, i) => i));
    expect(selectTopSectionsForAI(sections).length).toBe(100);
  });
});
