import { describe, it, expect } from "vitest";
import {
  calibrateConfidence,
  assessContextQuality,
  calculateSpecificityLevel,
  batchCalibrateConfidence,
} from "../../ner/confidence-calibration.js";
import type { CalibrationFactors } from "../../types.js";

const base = (): CalibrationFactors => ({
  patternMatch: false, existsInDictionary: false,
  multipleMentions: false, mentionCount: 1, totalDuration: 30,
  contextQuality: 0.5, contextLength: 50,
  hasVariety: false, specificityLevel: 0,
  mentionedWithKnownEntities: false, coOccurrenceCount: 0,
});

describe("calibrateConfidence", () => {
  it("returns medium reliability for baseline 0.7", () => {
    const r = calibrateConfidence(0.7, base());
    expect(r.originalConfidence).toBe(0.7);
    expect(r.reliability).toBe("medium");
  });
  it("applies +15% pattern bonus", () => {
    const r = calibrateConfidence(0.6, { ...base(), patternMatch: true });
    expect(r.confidenceBreakdown.patternBonus).toBeCloseTo(0.09, 3);
  });
  it("applies +20% dictionary bonus", () => {
    const r = calibrateConfidence(0.5, { ...base(), existsInDictionary: true });
    expect(r.confidenceBreakdown.dictionaryBonus).toBeCloseTo(0.1, 3);
  });
  it("warns when high-confidence entity absent from dictionary", () => {
    expect(calibrateConfidence(0.8, base()).warnings).toContain("Entity not found in canonical dictionary");
  });
  it("caps calibrated confidence at 1.0 even with all bonuses", () => {
    const r = calibrateConfidence(0.9, {
      ...base(), patternMatch: true, existsInDictionary: true,
      multipleMentions: true, mentionCount: 10, totalDuration: 200,
      visualConfirmation: true, tagMatch: true, topicMatch: true, descriptionMention: true,
    });
    expect(r.calibratedConfidence).toBeLessThanOrEqual(1.0);
  });
  it("assigns high reliability at 0.85+ with dict + multiple mentions", () => {
    const r = calibrateConfidence(0.8, {
      ...base(), existsInDictionary: true, multipleMentions: true, mentionCount: 5, totalDuration: 120,
    });
    expect(r.reliability).toBe("high");
  });
  it("applies auto-caption penalty and adds ASR warning", () => {
    const manual = calibrateConfidence(0.7, { ...base(), captionType: "manual" });
    const auto   = calibrateConfidence(0.7, { ...base(), captionType: "auto" });
    expect(auto.calibratedConfidence).toBeLessThan(manual.calibratedConfidence);
    expect(auto.warnings.some((w) => w.includes("ASR"))).toBe(true);
  });
});

describe("assessContextQuality", () => {
  it("scores below 0.5 for very short context", () => {
    expect(assessContextQuality("hi")).toBeLessThan(0.5);
  });
  it("scores above 0.7 for rich descriptive context", () => {
    expect(assessContextQuality("This beautiful plant thrives in full sun and grows very well outdoors")).toBeGreaterThan(0.7);
  });
  it("penalises vague phrases relative to plain context", () => {
    const plain = assessContextQuality("a nice plant that looks good here in the garden");
    const vague = assessContextQuality("this one is some kind of thing you know");
    expect(vague).toBeLessThan(plain);
  });
});

describe("calculateSpecificityLevel", () => {
  it("empty → 0, genus → 0.3, binomial → 0.6, subspecies → 0.8, variety → 1.0", () => {
    expect(calculateSpecificityLevel({})).toBe(0);
    expect(calculateSpecificityLevel({ genus: "Rosa" })).toBe(0.3);
    expect(calculateSpecificityLevel({ latinName: "Rosa canina" })).toBe(0.6);
    expect(calculateSpecificityLevel({ latinName: "Rosa canina", subspecies: "x" })).toBe(0.8);
    expect(calculateSpecificityLevel({ variety: "Queen Elizabeth" })).toBe(1.0);
  });
});

describe("batchCalibrateConfidence", () => {
  it("returns one result per entity with correct entity name", () => {
    const results = batchCalibrateConfidence([
      { entity: "Tomato", confidence: 0.7, timestamp: "00:30", context: "this tomato plant grows well in full sun" },
      { entity: "Basil",  confidence: 0.6, timestamp: "01:00", context: "fresh fragrant basil herb for cooking" },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]?.entity).toBe("Tomato");
  });
});
