/**
 * Sample plant dictionary entries for testing entity resolution.
 *
 * Provides a small but representative set of plants for testing
 * exact match, fuzzy match, synonym match, and genus-level matching.
 */

import type { PlantEntry, PlantDictionary } from "../../types.js";
import { createPlantDictionary } from "../../ner/plant-dictionary.js";

export const SAMPLE_PLANT_ENTRIES: PlantEntry[] = [
  {
    latinName: "Helenium autumnale",
    commonNames: ["Sneezeweed", "Helen's flower"],
    synonyms: ["Helenium autumnale var. pumilum"],
    genus: "Helenium",
    species: "autumnale",
    variety: "Sahin's Early Flowerer",
    tradeNames: [],
    taxonomyLevel: "species",
    usageCount: 45,
    ambiguityScore: 0.1,
  },
  {
    latinName: "Rudbeckia fulgida",
    commonNames: ["Black-eyed Susan", "Orange Coneflower"],
    synonyms: ["Rudbeckia deamii"],
    genus: "Rudbeckia",
    species: "fulgida",
    variety: "Goldsturm",
    tradeNames: [],
    taxonomyLevel: "species",
    usageCount: 62,
    ambiguityScore: 0.15,
  },
  {
    latinName: "Miscanthus sinensis",
    commonNames: ["Japanese silver grass", "Maiden grass", "Eulalia"],
    synonyms: [],
    genus: "Miscanthus",
    species: "sinensis",
    variety: "Morning Light",
    tradeNames: [],
    taxonomyLevel: "species",
    usageCount: 38,
    ambiguityScore: 0.1,
  },
  {
    latinName: "Sedum spectabile",
    commonNames: ["Ice plant", "Showy stonecrop", "Butterfly stonecrop"],
    synonyms: ["Hylotelephium spectabile"],
    genus: "Sedum",
    species: "spectabile",
    variety: "Autumn Joy",
    tradeNames: [],
    taxonomyLevel: "species",
    usageCount: 55,
    ambiguityScore: 0.2,
  },
  {
    latinName: "Lavandula angustifolia",
    commonNames: ["English Lavender", "True Lavender"],
    synonyms: ["Lavandula officinalis", "Lavandula vera"],
    genus: "Lavandula",
    species: "angustifolia",
    variety: "Hidcote",
    tradeNames: [],
    taxonomyLevel: "species",
    usageCount: 120,
    ambiguityScore: 0.05,
  },
  {
    latinName: "Rosa gallica",
    commonNames: ["French Rose", "Gallica Rose", "Rose"],
    synonyms: [],
    genus: "Rosa",
    species: "gallica",
    variety: null,
    tradeNames: [],
    taxonomyLevel: "species",
    usageCount: 90,
    ambiguityScore: 0.3,
  },
  {
    latinName: "Echinacea purpurea",
    commonNames: ["Purple Coneflower", "Eastern Purple Coneflower"],
    synonyms: ["Rudbeckia purpurea"],
    genus: "Echinacea",
    species: "purpurea",
    variety: null,
    tradeNames: [],
    taxonomyLevel: "species",
    usageCount: 40,
    ambiguityScore: 0.1,
  },
  {
    latinName: "Hydrangea macrophylla",
    commonNames: ["Bigleaf Hydrangea", "French Hydrangea", "Hortensia"],
    synonyms: ["Hydrangea hortensis"],
    genus: "Hydrangea",
    species: "macrophylla",
    variety: null,
    tradeNames: [],
    taxonomyLevel: "species",
    usageCount: 75,
    ambiguityScore: 0.15,
  },
];

/**
 * Create a test PlantDictionary from the sample entries.
 */
export function createTestDictionary(): PlantDictionary {
  return createPlantDictionary(SAMPLE_PLANT_ENTRIES);
}
