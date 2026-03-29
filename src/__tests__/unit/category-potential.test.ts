import { describe, it, expect } from "vitest";
import {
  scoreCategoryPotential, batchScoreCandidates, getTopPriorityCandidates,
  type CategoryCandidate,
} from "../../intelligence/category-potential.js";

const OLD = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
const RECENT = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
const RICH = ["greenhouse kit","irrigation","buy","review","best","recommend","beginner","propagate","care","houseplant","pruning","how to"];
const mkC = (o: Partial<CategoryCandidate> = {}): CategoryCandidate => ({
  id: "c1", candidateName: "Test Category",
  keywords: { primary: [], secondary: [] },
  affiliateProgramCount: 0, videoMentionCount: 0, firstDetected: OLD, ...o,
});

describe("scoreCategoryPotential", () => {
  it("returns required fields", () => {
    const r = scoreCategoryPotential(mkC());
    expect(r).toHaveProperty("candidateId");
    expect(r).toHaveProperty("overallPotential");
    expect(r).toHaveProperty("recommendedAction");
  });

  it("high-value tools → commercialPotential > 50 and pricePointScore = 30", () => {
    const r = scoreCategoryPotential(mkC({
      keywords: { primary: ["greenhouse kit", "irrigation"], secondary: ["buy"] },
      affiliateProgramCount: 3,
    }));
    expect(r.commercialPotential).toBeGreaterThan(50);
    expect(r.pricePointScore).toBe(30);
  });

  it("seed keywords → pricePointScore 15", () => {
    const r = scoreCategoryPotential(mkC({ keywords: { primary: ["seed packet", "bulb"], secondary: [] } }));
    expect(r.pricePointScore).toBe(15);
  });

  it("non-high-value 4 affiliates → affiliateAvailability 30", () => {
    expect(scoreCategoryPotential(mkC({ affiliateProgramCount: 4 })).affiliateAvailability).toBe(30);
  });

  it("skill progression keywords → skillProgressionScore > 0", () => {
    const r = scoreCategoryPotential(mkC({ keywords: { primary: ["beginner basics", "care maintain", "propagate"], secondary: [] } }));
    expect(r.skillProgressionScore).toBeGreaterThan(0);
  });

  it("evergreen keywords → evergreenScore > 0", () => {
    expect(scoreCategoryPotential(mkC({
      keywords: { primary: ["houseplant care", "indoor pruning"], secondary: [] },
    })).evergreenScore).toBeGreaterThan(0);
  });

  it("minimal keywords → reject", () => {
    expect(scoreCategoryPotential(mkC({ candidateName: "xyz" })).recommendedAction).toBe("reject");
  });

  it("recent discovery → noveltyBonus ≥ 5", () => {
    expect(scoreCategoryPotential(mkC({ firstDetected: RECENT })).noveltyBonus).toBeGreaterThanOrEqual(5);
  });

  it("unique → higher noveltyBonus than existing-similar", () => {
    const c = mkC({ firstDetected: RECENT });
    expect(scoreCategoryPotential(c, []).noveltyBonus).toBeGreaterThanOrEqual(
      scoreCategoryPotential(c, [{ categoryKey: "test-category" }]).noveltyBonus,
    );
  });

  it("rich candidate → priority", () => {
    const r = scoreCategoryPotential(mkC({
      keywords: { primary: RICH, secondary: [] },
      affiliateProgramCount: 4, videoMentionCount: 10, firstDetected: RECENT,
    }));
    expect(r.recommendedAction).toBe("priority");
  });
});

describe("batchScoreCandidates", () => {
  it("sorted descending by overallPotential", () => {
    const res = batchScoreCandidates([
      mkC({ id: "a", candidateName: "xyz" }),
      mkC({ id: "b", keywords: { primary: RICH, secondary: [] }, affiliateProgramCount: 4, videoMentionCount: 10, firstDetected: RECENT }),
    ]);
    expect(res[0].overallPotential).toBeGreaterThanOrEqual(res[1].overallPotential);
  });
  it("empty → empty", () => { expect(batchScoreCandidates([])).toEqual([]); });
});


describe("getTopPriorityCandidates", () => {
  const p = mkC({ id: "p", keywords: { primary: RICH, secondary: [] }, affiliateProgramCount: 4, videoMentionCount: 10, firstDetected: RECENT });
  it("returns only priority candidates", () => {
    getTopPriorityCandidates([p, mkC({ id: "q", candidateName: "xyz" })]).forEach(
      (r) => expect(r.recommendedAction).toBe("priority"),
    );
  });
  it("respects limit", () => {
    expect(getTopPriorityCandidates(Array.from({ length: 5 }, (_, i) => ({ ...p, id: String(i) })), [], 2).length).toBeLessThanOrEqual(2);
  });
});
