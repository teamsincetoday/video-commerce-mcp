import { describe, it, expect } from "vitest";
import { AutonomousCategoryDiscovery } from "../../market-intelligence/autonomous-discovery.js";

describe("AutonomousCategoryDiscovery", () => {
  const discovery = new AutonomousCategoryDiscovery();

  describe("extractKeywords", () => {
    it("lowercases and splits words", () => {
      expect(discovery.extractKeywords("Organic Tomato Seeds")).toEqual(["organic", "tomato", "seeds"]);
    });

    it("filters stop words (pack, the, for) and tokens ≤2 chars", () => {
      const r = discovery.extractKeywords("Pack of seeds for growing");
      expect(r).not.toContain("pack");
      expect(r).not.toContain("for");
      expect(r).toContain("seeds");
      expect(discovery.extractKeywords("a go led lamp")).toEqual(["led", "lamp"]);
    });

    it("removes special characters", () => {
      expect(discovery.extractKeywords("Rose (50cm)!")).toEqual(["rose", "50cm"]);
    });

    it("returns empty for stop-word-only or empty input", () => {
      expect(discovery.extractKeywords("the and for with")).toEqual([]);
      expect(discovery.extractKeywords("")).toEqual([]);
    });
  });

  describe("mapCandidateToCategory", () => {
    it("maps plant/seed/tool/book substrings to correct category", () => {
      expect(discovery.mapCandidateToCategory("garden plants")).toBe("PLANT");
      expect(discovery.mapCandidateToCategory("tomato seeds")).toBe("SEEDS");
      expect(discovery.mapCandidateToCategory("gardening tools")).toBe("TOOLS");
      expect(discovery.mapCandidateToCategory("gardening books")).toBe("BOOKS");
    });

    it("maps material/structure and returns OTHER for unknowns", () => {
      expect(discovery.mapCandidateToCategory("building materials")).toBe("MATERIALS");
      expect(discovery.mapCandidateToCategory("raised bed structures")).toBe("STRUCTURES");
      expect(discovery.mapCandidateToCategory("mystery item")).toBe("OTHER");
    });
  });

  describe("validateCandidates", () => {
    it("returns validated=true with computed scores for high-volume candidate", () => {
      const results = discovery.validateCandidates([{
        candidateKey: "tools", candidateName: "Gardening Tools",
        productMentionCount: 200, videoMentionCount: 50,
        avgConfidence: 0.9, affiliateProgramCount: 5,
      }]);
      expect(results[0]!.validated).toBe(true);
      expect(results[0]!.convergenceScore).toBeGreaterThan(0);
      expect(results[0]!.demandScore).toBeDefined();
    });

    it("returns validated=false when commission score is zero", () => {
      const results = discovery.validateCandidates([{
        candidateKey: "low", candidateName: "Low",
        productMentionCount: 1, videoMentionCount: 1,
        avgConfidence: 0.0, affiliateProgramCount: 0,
      }]);
      expect(results[0]!.validated).toBe(false);
    });

    it("returns empty array for empty input", () => {
      expect(discovery.validateCandidates([])).toEqual([]);
    });
  });

  describe("runPatternDetection", () => {
    it("returns empty clusters + debug log when list is empty", () => {
      const { clusters, debugLog } = discovery.runPatternDetection([]);
      expect(clusters).toHaveLength(0);
      expect(debugLog.length).toBeGreaterThan(0);
    });

    it("skips clustering when below minProductMentions (default 50)", () => {
      const products = Array.from({ length: 10 }, (_, i) => ({
        id: String(i), name: "Test Product", videoId: `v${i}`, confidence: 0.8,
      }));
      expect(discovery.runPatternDetection(products).clusters).toHaveLength(0);
    });
  });
});
