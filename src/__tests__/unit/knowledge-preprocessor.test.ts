// Unit tests for KnowledgeEnhancedPreprocessor — knowledgeSources flags,
// entityHints, adaptiveKeywords, initialize() idempotency.
import { describe, it, expect } from "vitest";
import { KnowledgeEnhancedPreprocessor, preprocessWithKnowledge } from "../../transcript/knowledge-preprocessor.js";
import type { PlantEntry, DisambiguationRule, ProductCatalogEntry } from "../../types.js";

const FERN: PlantEntry = {
  latinName: "Dryopteris filix-mas", commonNames: ["fern"], synonyms: [], tradeNames: [],
  genus: "Dryopteris", species: "filix-mas", variety: null, taxonomyLevel: "species",
  usageCount: 15, ambiguityScore: 0.1,
};

describe("KnowledgeEnhancedPreprocessor", () => {
  describe("knowledgeSources flags", () => {
    it("plantDictionary false when no plants provided", async () => {
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({});
      expect((await p.preprocessWithKnowledge("garden plants")).knowledgeSources.plantDictionary).toBe(false);
    });

    it("plantDictionary true when plants loaded", async () => {
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({ plants: [FERN] });
      expect((await p.preprocessWithKnowledge("fern")).knowledgeSources.plantDictionary).toBe(true);
    });

    it("authoritativeSources is always true", async () => {
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({});
      expect((await p.preprocessWithKnowledge("garden")).knowledgeSources.authoritativeSources).toBe(true);
    });

    it("disambiguationRules true when rules loaded", async () => {
      const rule: DisambiguationRule = {
        detectedPattern: "rose", resolvedPlant: null, contextKeywords: [], confidence: 0.9,
      };
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({ disambiguationRules: [rule] });
      expect((await p.preprocessWithKnowledge("rose plant")).knowledgeSources.disambiguationRules).toBe(true);
    });

    it("marketTrends true when variety appears 3+ times", async () => {
      const prods: ProductCatalogEntry[] = Array(3).fill({ productTitle: "seed pack", variety: "glacier", brand: null });
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({ recentProducts: prods });
      expect((await p.preprocessWithKnowledge("glacier tomato plant")).knowledgeSources.marketTrends).toBe(true);
    });

    it("marketTrends false when variety frequency below 3", async () => {
      const prods = [{ productTitle: "seed", variety: "rare", brand: null }, { productTitle: "seed", variety: "rare", brand: null }] as ProductCatalogEntry[];
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({ recentProducts: prods });
      expect((await p.preprocessWithKnowledge("rare variety")).knowledgeSources.marketTrends).toBe(false);
    });
  });

  describe("entityHints", () => {
    it("contains common name entry when transcript has it", async () => {
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({ plants: [FERN] });
      const { entityHints } = await p.preprocessWithKnowledge("my fern is growing well");
      expect(entityHints.some((h) => h.term === "fern")).toBe(true);
    });

    it("market trend hint has source market_trend", async () => {
      const prods: ProductCatalogEntry[] = Array(3).fill({ productTitle: "seed", variety: "glacier", brand: null });
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({ recentProducts: prods });
      const { entityHints } = await p.preprocessWithKnowledge("glacier variety plant");
      expect(entityHints.find((h) => h.term === "glacier")?.source).toBe("market_trend");
    });
  });

  describe("adaptiveKeywords", () => {
    it("includes genus from high-priority plant hint", async () => {
      const p = new KnowledgeEnhancedPreprocessor();
      await p.initialize({ plants: [FERN] });
      const { adaptiveKeywords } = await p.preprocessWithKnowledge("dryopteris plants are great");
      expect(adaptiveKeywords).toContain("dryopteris");
    });
  });

  it("initialize() is idempotent — second call is a no-op", async () => {
    const p = new KnowledgeEnhancedPreprocessor();
    await p.initialize({ plants: [FERN] });
    await p.initialize({ plants: [] }); // ignored: already initialized
    expect((await p.preprocessWithKnowledge("fern")).knowledgeSources.plantDictionary).toBe(true);
  });

  it("exported preprocessWithKnowledge() returns knowledgeSources + hints + keywords", async () => {
    const r = await preprocessWithKnowledge("garden plants and fern");
    expect(r.knowledgeSources).toBeDefined();
    expect(r.entityHints).toBeInstanceOf(Array);
    expect(r.adaptiveKeywords).toBeInstanceOf(Array);
  });
});
