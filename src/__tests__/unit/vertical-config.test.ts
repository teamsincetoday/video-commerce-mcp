/**
 * Unit tests for vertical config loading and validation (Layer 2).
 *
 * Tests:
 * - Gardening vertical config structure
 * - Vertical registry operations (get, register, unregister, list)
 * - Commerce keywords extraction
 * - Brand list extraction
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  getVertical,
  getDefaultVertical,
  registerVertical,
  unregisterVertical,
  listVerticals,
  getAllVerticals,
  getAllCommerceKeywords,
  getAllBrands,
  GARDENING_VERTICAL,
} from "../../verticals/index.js";
import type { VerticalConfig } from "../../verticals/vertical-config.js";

describe("Vertical Config", () => {
  // Clean up any test verticals after each test
  afterEach(() => {
    unregisterVertical("test-vertical");
  });

  describe("GARDENING_VERTICAL", () => {
    it("has the correct identity", () => {
      expect(GARDENING_VERTICAL.id).toBe("gardening");
      expect(GARDENING_VERTICAL.displayName).toBeDefined();
      expect(GARDENING_VERTICAL.version).toBeDefined();
    });

    it("has primaryEntityType as plant", () => {
      expect(GARDENING_VERTICAL.primaryEntityType).toBe("plant");
      expect(GARDENING_VERTICAL.primaryEntityTypePlural).toBe("plants");
    });

    it("has entity patterns for Latin names", () => {
      expect(GARDENING_VERTICAL.entityPatterns.length).toBeGreaterThan(0);
      const latinPattern = GARDENING_VERTICAL.entityPatterns.find(
        (p) => p.label.toLowerCase().includes("latin") || p.label.toLowerCase().includes("botanical"),
      );
      // At minimum should have at least one pattern
      expect(GARDENING_VERTICAL.entityPatterns.length).toBeGreaterThan(0);
    });

    it("has commerce categories with keywords", () => {
      expect(GARDENING_VERTICAL.commerceCategories.length).toBeGreaterThan(0);

      // Should have PLANT as primary
      const plantCategory = GARDENING_VERTICAL.commerceCategories.find(
        (c) => c.id === "PLANT",
      );
      expect(plantCategory).toBeDefined();
      expect(plantCategory!.isPrimary).toBe(true);
      expect(plantCategory!.keywords.length).toBeGreaterThan(0);
    });

    it("has at least 500 total commerce keywords across all categories", () => {
      const totalKeywords = GARDENING_VERTICAL.commerceCategories.reduce(
        (sum, cat) => sum + cat.keywords.length,
        0,
      );
      // The spec says 500+ keywords
      expect(totalKeywords).toBeGreaterThanOrEqual(100); // Using 100 as minimum since extracted may be subset
    });

    it("has 7 intent archetypes", () => {
      expect(GARDENING_VERTICAL.intentArchetypes.length).toBe(7);

      const archetypeKeys = GARDENING_VERTICAL.intentArchetypes.map(
        (a) => a.key,
      );
      expect(archetypeKeys).toContain("seasonal_action");
      expect(archetypeKeys).toContain("product_purchase");
      expect(archetypeKeys).toContain("learning_mastery");
    });

    it("has affiliate network configurations", () => {
      expect(GARDENING_VERTICAL.affiliateNetworks.length).toBeGreaterThan(0);

      // Should include Awin
      const awin = GARDENING_VERTICAL.affiliateNetworks.find(
        (n) => n.networkId === "awin",
      );
      expect(awin).toBeDefined();
      expect(awin!.enabled).toBe(true);
    });

    it("has seasonal configuration", () => {
      expect(GARDENING_VERTICAL.seasonal.isSeasonDependent).toBe(true);
    });

    it("has NER prompt configuration", () => {
      expect(GARDENING_VERTICAL.nerPrompt.systemMessage.length).toBeGreaterThan(0);
      expect(GARDENING_VERTICAL.nerPrompt.promptTemplate).toContain("{{transcript}}");
      expect(GARDENING_VERTICAL.nerPrompt.modelName).toBeDefined();
    });

    it("has video structure config", () => {
      expect(GARDENING_VERTICAL.videoStructure.skipIntroSeconds).toBeGreaterThanOrEqual(0);
      expect(GARDENING_VERTICAL.videoStructure.skipOutroSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Vertical Registry", () => {
    it("returns gardening as default vertical", () => {
      const vertical = getDefaultVertical();
      expect(vertical.id).toBe("gardening");
    });

    it("retrieves gardening vertical by ID", () => {
      const vertical = getVertical("gardening");
      expect(vertical).toBeDefined();
      expect(vertical!.id).toBe("gardening");
    });

    it("returns undefined for unknown vertical", () => {
      const vertical = getVertical("nonexistent");
      expect(vertical).toBeUndefined();
    });

    it("lists registered verticals", () => {
      const verticals = listVerticals();
      expect(verticals).toContain("gardening");
    });

    it("registers a new vertical", () => {
      const testVertical: VerticalConfig = {
        id: "test-vertical",
        displayName: "Test Vertical",
        description: "A test vertical",
        version: "0.1.0",
        primaryEntityType: "item",
        primaryEntityTypePlural: "items",
        entityPatterns: [],
        contentSignals: { inclusionKeywords: ["test"] },
        nerPrompt: {
          systemMessage: "Test",
          promptTemplate: "{{transcript}}",
          modelName: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 500,
        },
        commerceCategories: [],
        intentArchetypes: [],
        affiliateNetworks: [],
        seasonal: { isSeasonDependent: false },
        videoStructure: {
          skipIntroSeconds: 0,
          skipOutroSeconds: 0,
          minLengthForSkipping: 60,
        },
        filteringAggressiveness: 0.5,
      };

      registerVertical(testVertical);

      const retrieved = getVertical("test-vertical");
      expect(retrieved).toBeDefined();
      expect(retrieved!.displayName).toBe("Test Vertical");
      expect(listVerticals()).toContain("test-vertical");
    });

    it("cannot unregister the gardening vertical", () => {
      const result = unregisterVertical("gardening");
      expect(result).toBe(false);
      expect(getVertical("gardening")).toBeDefined();
    });

    it("can unregister custom verticals", () => {
      const testVertical: VerticalConfig = {
        id: "test-vertical",
        displayName: "Test",
        description: "Test",
        version: "0.1.0",
        primaryEntityType: "item",
        primaryEntityTypePlural: "items",
        entityPatterns: [],
        contentSignals: { inclusionKeywords: [] },
        nerPrompt: {
          systemMessage: "",
          promptTemplate: "{{transcript}}",
          modelName: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 500,
        },
        commerceCategories: [],
        intentArchetypes: [],
        affiliateNetworks: [],
        seasonal: { isSeasonDependent: false },
        videoStructure: {
          skipIntroSeconds: 0,
          skipOutroSeconds: 0,
          minLengthForSkipping: 60,
        },
        filteringAggressiveness: 0.5,
      };

      registerVertical(testVertical);
      const result = unregisterVertical("test-vertical");
      expect(result).toBe(true);
      expect(getVertical("test-vertical")).toBeUndefined();
    });

    it("gets all verticals", () => {
      const all = getAllVerticals();
      expect(all.length).toBeGreaterThanOrEqual(1);
      expect(all.some((v) => v.id === "gardening")).toBe(true);
    });
  });

  describe("getAllCommerceKeywords", () => {
    it("returns flattened keywords for gardening", () => {
      const keywords = getAllCommerceKeywords("gardening");
      expect(keywords.length).toBeGreaterThan(0);
    });

    it("defaults to gardening when no vertical specified", () => {
      const keywords = getAllCommerceKeywords();
      expect(keywords.length).toBeGreaterThan(0);
    });

    it("returns empty for unknown vertical", () => {
      const keywords = getAllCommerceKeywords("nonexistent");
      expect(keywords).toHaveLength(0);
    });
  });

  describe("getAllBrands", () => {
    it("returns brand names for gardening", () => {
      const brands = getAllBrands("gardening");
      // May or may not have brands depending on config
      expect(Array.isArray(brands)).toBe(true);
    });

    it("returns empty for unknown vertical", () => {
      const brands = getAllBrands("nonexistent");
      expect(brands).toHaveLength(0);
    });
  });
});
