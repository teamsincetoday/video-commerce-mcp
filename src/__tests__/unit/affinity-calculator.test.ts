import { describe, it, expect } from "vitest";
import {
  calculateKeywordOverlap,
  determineRelationshipType,
  calculateAffinity,
  calculateAllAffinities,
  type CategoryAffinityInput,
  type OverlapData,
} from "../../market-intelligence/affinity-calculator.js";

const cat = (id: string, parentId: string | null = null, primary: string[] = [], secondary: string[] = []): CategoryAffinityInput => ({
  categoryId: id, categoryKey: id, displayName: id, parentCategoryId: parentId, primaryKeywords: primary, secondaryKeywords: secondary,
});
const overlap = (video = 0, commerce = 0, creator = 0, audience: number | null = null): OverlapData =>
  ({ videoOverlap: video, commerceOverlap: commerce, creatorOverlap: creator, audienceOverlap: audience });

describe("calculateKeywordOverlap", () => {
  it("identical sets → 100%", () => {
    expect(calculateKeywordOverlap(["a", "b"], ["a", "b"], [], [])).toBe(100);
  });
  it("disjoint sets → 0%", () => {
    expect(calculateKeywordOverlap(["a"], ["b"], [], [])).toBe(0);
  });
  it("partial Jaccard — 1 of 3 keywords shared", () => {
    const result = calculateKeywordOverlap(["x", "y"], ["y", "z"], [], []);
    expect(result).toBeCloseTo((1 / 3) * 100, 5);
  });
  it("empty both → 0%", () => {
    expect(calculateKeywordOverlap([], [], [], [])).toBe(0);
  });
  it("case-insensitive", () => {
    expect(calculateKeywordOverlap(["Rose"], ["rose"], [], [])).toBe(100);
  });
  it("secondary keywords included in union", () => {
    const result = calculateKeywordOverlap(["a"], ["b"], ["shared"], ["shared"]);
    expect(result).toBeGreaterThan(0);
  });
});

describe("determineRelationshipType", () => {
  it("A's parent is B → parent_child", () => {
    expect(determineRelationshipType(cat("a", "b"), cat("b"), 0)).toBe("parent_child");
  });
  it("B's parent is A → parent_child", () => {
    expect(determineRelationshipType(cat("a"), cat("b", "a"), 0)).toBe("parent_child");
  });
  it("same parent → sibling", () => {
    expect(determineRelationshipType(cat("a", "p"), cat("b", "p"), 0)).toBe("sibling");
  });
  it("no hierarchy, high affinity → adjacent", () => {
    expect(determineRelationshipType(cat("a"), cat("b"), 60)).toBe("adjacent");
  });
  it("no hierarchy, low affinity → unrelated", () => {
    expect(determineRelationshipType(cat("a"), cat("b"), 30)).toBe("unrelated");
  });
});

describe("calculateAffinity", () => {
  it("weighted formula with all dimensions", () => {
    const result = calculateAffinity(cat("a", null, ["x"], []), cat("b", null, ["x"], []), overlap(40, 20, 10, 30));
    // keyword=100, video=40, commerce=20, creator=10, audience=30
    const expected = 40 * 0.3 + 100 * 0.25 + 30 * 0.2 + 20 * 0.15 + 10 * 0.1;
    expect(result.affinityScore).toBeCloseTo(expected, 5);
  });
  it("null audienceOverlap treated as 0", () => {
    const withNull = calculateAffinity(cat("a"), cat("b"), overlap(50, 50, 50, null));
    const withZero = calculateAffinity(cat("a"), cat("b"), overlap(50, 50, 50, 0));
    expect(withNull.affinityScore).toBeCloseTo(withZero.affinityScore, 5);
  });
  it("sampleSize = sum of video+commerce+creator overlaps", () => {
    const result = calculateAffinity(cat("a"), cat("b"), overlap(30, 20, 10));
    expect(result.sampleSize).toBe(60);
  });
  it("confidenceScore capped at 1.0", () => {
    const result = calculateAffinity(cat("a"), cat("b"), overlap(100, 100, 100));
    expect(result.confidenceScore).toBe(1.0);
  });
});

describe("calculateAllAffinities", () => {
  it("3 categories → 3 pairs", () => {
    const cats = [cat("a"), cat("b"), cat("c")];
    const results = calculateAllAffinities(cats, () => overlap());
    expect(results).toHaveLength(3);
  });
  it("1 category → 0 pairs", () => {
    const results = calculateAllAffinities([cat("a")], () => overlap());
    expect(results).toHaveLength(0);
  });
});
