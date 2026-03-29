/**
 * Unit tests for AwinProgramScanner.inferRegionFromCountry + generateReport.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  AwinProgramScanner,
  type DiscoveredProgram,
} from "../../market-intelligence/awin-scanner.js";

const BASE_VERTICALS = {
  supportsPlants: false, supportsSeeds: false, supportsTools: false,
  supportsMaterials: false, supportsBooks: false, supportsMedia: false,
  supportsCourses: false, supportsEvents: false, supportsGardenShows: false,
};

const makeProgram = (
  overrides: Partial<DiscoveredProgram> = {},
): DiscoveredProgram => ({
  advertiserId: 1,
  advertiserName: "Test Garden Co",
  relevanceScore: 75,
  relevanceReason: "Relevant",
  verticals: { ...BASE_VERTICALS },
  commission: { min: 5, max: 10 },
  cookieDuration: 30,
  ...overrides,
});

describe("AwinProgramScanner", () => {
  let scanner: AwinProgramScanner;

  beforeEach(() => {
    scanner = new AwinProgramScanner({ awinApiKey: "test-key" });
  });

  describe("inferRegionFromCountry", () => {
    it("returns OTHER for undefined", () => {
      expect(scanner.inferRegionFromCountry(undefined)).toBe("OTHER");
    });
    it("maps United Kingdom to UK", () => {
      expect(scanner.inferRegionFromCountry("United Kingdom")).toBe("UK");
    });
    it("maps England to UK", () => {
      expect(scanner.inferRegionFromCountry("England")).toBe("UK");
    });
    it("maps Wales to UK", () => {
      expect(scanner.inferRegionFromCountry("Wales")).toBe("UK");
    });
    it("maps Germany to EU", () => {
      expect(scanner.inferRegionFromCountry("Germany")).toBe("EU");
    });
    it("maps france (lowercase) to EU", () => {
      expect(scanner.inferRegionFromCountry("france")).toBe("EU");
    });
    it("maps United States to NA", () => {
      expect(scanner.inferRegionFromCountry("United States")).toBe("NA");
    });
    it("maps Canada to NA", () => {
      expect(scanner.inferRegionFromCountry("Canada")).toBe("NA");
    });
    it("maps Australia to AU", () => {
      expect(scanner.inferRegionFromCountry("Australia")).toBe("AU");
    });
    it("maps New Zealand to AU", () => {
      expect(scanner.inferRegionFromCountry("New Zealand")).toBe("AU");
    });
    it("returns OTHER for unrecognized country", () => {
      expect(scanner.inferRegionFromCountry("Brazil")).toBe("OTHER");
    });
  });

  describe("generateReport", () => {
    it("returns sentinel for empty array", () => {
      expect(scanner.generateReport([])).toBe("No programs discovered.");
    });
    it("includes advertiser name in output", () => {
      expect(scanner.generateReport([makeProgram({ advertiserName: "Rose Ltd" })])).toContain("Rose Ltd");
    });
    it("counts vertical coverage correctly", () => {
      const programs = [
        makeProgram({ verticals: { ...BASE_VERTICALS, supportsPlants: true } }),
        makeProgram({ verticals: { ...BASE_VERTICALS, supportsPlants: true, supportsSeeds: true } }),
      ];
      const report = scanner.generateReport(programs);
      expect(report).toContain("- Plants: 2");
      expect(report).toContain("- Seeds: 1");
    });
    it("sorts top programs by relevance descending", () => {
      const programs = [
        makeProgram({ advertiserName: "Low Score", relevanceScore: 40 }),
        makeProgram({ advertiserName: "High Score", relevanceScore: 90 }),
      ];
      const report = scanner.generateReport(programs);
      expect(report.indexOf("High Score")).toBeLessThan(report.indexOf("Low Score"));
    });
  });
});
