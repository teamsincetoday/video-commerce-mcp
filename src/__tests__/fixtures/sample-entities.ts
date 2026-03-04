/**
 * Sample entity fixtures for testing NER extraction and entity resolution.
 */

import type { Entity, EnhancedEntity, CommerceItemCategory } from "../../types.js";
import type { AnalysisEntity } from "../../response-formatter.js";

/**
 * Raw entities as would be produced by GPT NER extraction.
 */
export const RAW_ENTITIES: Entity[] = [
  {
    entity: "Helenium 'Sahin's Early Flowerer'",
    metadata: {
      latinName: "Helenium autumnale",
      taxonomyLevel: "cultivar",
      targetAudience: "intermediate",
      complexity: { cognitive: 0.5, practical: 0.6, emotional: 0.3 },
    },
    timestamp: "00:12",
    context:
      "First up is this beautiful Helenium Sahin's Early Flowerer. It's been flowering since July.",
    confidence: 0.94,
  },
  {
    entity: "Rudbeckia",
    metadata: {
      latinName: "Rudbeckia",
      taxonomyLevel: "genus",
      targetAudience: "intermediate",
      complexity: { cognitive: 0.4, practical: 0.5, emotional: 0.2 },
    },
    timestamp: "00:41",
    context:
      "Next we have Rudbeckia fulgida var. sullivantii Goldsturm",
    confidence: 0.88,
  },
  {
    entity: "Miscanthus sinensis 'Morning Light'",
    metadata: {
      latinName: "Miscanthus sinensis",
      taxonomyLevel: "cultivar",
      targetAudience: "intermediate",
      complexity: { cognitive: 0.3, practical: 0.4, emotional: 0.5 },
    },
    timestamp: "00:41",
    context:
      "It pairs beautifully with ornamental grasses like Miscanthus sinensis Morning Light.",
    confidence: 0.91,
  },
  {
    entity: "Sedum spectabile 'Autumn Joy'",
    metadata: {
      latinName: "Sedum spectabile",
      taxonomyLevel: "cultivar",
      targetAudience: "beginner",
      complexity: { cognitive: 0.2, practical: 0.3, emotional: 0.4 },
    },
    timestamp: "00:59",
    context:
      "For the front of the border, I'm planting Sedum spectabile Autumn Joy.",
    confidence: 0.92,
  },
];

/**
 * Enhanced entities (after NER pipeline resolution).
 */
export const ENHANCED_ENTITIES: EnhancedEntity[] = RAW_ENTITIES.map((e) => ({
  ...e,
  plantId: (e.metadata.latinName as string).toLowerCase().replace(/\s+/g, "_"),
  taxonomyLevel: e.metadata.taxonomyLevel as string,
  disambiguated: false,
  disambiguationMethod: undefined,
  targetAudience: e.metadata.targetAudience as string,
  cognitiveComplexity: (e.metadata.complexity as Record<string, number>)?.cognitive,
  practicalComplexity: (e.metadata.complexity as Record<string, number>)?.practical,
  emotionalComplexity: (e.metadata.complexity as Record<string, number>)?.emotional,
}));

/**
 * Analysis entities (formatted for response formatter).
 */
export const ANALYSIS_ENTITIES: AnalysisEntity[] = [
  {
    name: "Helenium 'Sahin's Early Flowerer'",
    scientificName: "Helenium autumnale",
    category: "PLANT" as CommerceItemCategory,
    confidence: 0.94,
    isShoppable: true,
    mentions: [
      {
        timestampSeconds: 12,
        context: "First up is this beautiful Helenium Sahin's Early Flowerer.",
      },
    ],
    monetizationPotential: {
      affiliateScore: 0.85,
      courseRelevance: 0.6,
      contentGap: 0.4,
    },
  },
  {
    name: "Felco No. 2 Secateurs",
    category: "TOOL" as CommerceItemCategory,
    confidence: 0.88,
    isShoppable: true,
    mentions: [
      {
        timestampSeconds: 27,
        context: "Using my trusty Felco twos to give this plant a good trim.",
      },
    ],
    monetizationPotential: {
      affiliateScore: 0.92,
      reviewOpportunity: 0.7,
      comparisonContent: 0.8,
    },
  },
  {
    name: "Rudbeckia fulgida 'Goldsturm'",
    scientificName: "Rudbeckia fulgida var. sullivantii",
    category: "PLANT" as CommerceItemCategory,
    confidence: 0.91,
    isShoppable: true,
    mentions: [
      {
        timestampSeconds: 41,
        context: "Next we have Rudbeckia fulgida var. sullivantii Goldsturm.",
      },
    ],
    monetizationPotential: {
      affiliateScore: 0.78,
      courseRelevance: 0.5,
    },
  },
  {
    name: "Melcourt Peat-Free Compost",
    category: "MATERIAL" as CommerceItemCategory,
    confidence: 0.75,
    isShoppable: true,
    mentions: [
      {
        timestampSeconds: 71,
        context: "Using a peat-free compost from Melcourt.",
      },
    ],
    monetizationPotential: {
      affiliateScore: 0.65,
    },
  },
  {
    name: "Sedum spectabile 'Autumn Joy'",
    scientificName: "Sedum spectabile",
    category: "PLANT" as CommerceItemCategory,
    confidence: 0.92,
    isShoppable: true,
    mentions: [
      {
        timestampSeconds: 59,
        context: "Planting Sedum spectabile Autumn Joy for the front of the border.",
      },
    ],
    monetizationPotential: {
      affiliateScore: 0.8,
      courseRelevance: 0.45,
    },
  },
];

/**
 * Non-shoppable entity for edge case testing.
 */
export const NON_SHOPPABLE_ENTITY: AnalysisEntity = {
  name: "Autumn border planting technique",
  category: "OTHER" as CommerceItemCategory,
  confidence: 0.7,
  isShoppable: false,
  mentions: [
    {
      timestampSeconds: 0,
      context: "Today we're going to look at autumn border planting.",
    },
  ],
};
