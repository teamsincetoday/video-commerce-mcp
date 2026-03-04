/**
 * Variety Hint Provider
 *
 * Provides known variety/cultivar hints for plant genera to improve NER accuracy.
 * In the standalone MCP package, variety data comes from the PlantDictionary
 * instead of Prisma queries (Plant, EnrichmentCache, EmergingCultivar tables).
 *
 * Ported from monolith lib/services/variety-hint-provider.ts.
 * All business logic preserved; Prisma/Redis dependencies replaced with
 * PlantDictionary interface and in-memory cache.
 */

import type { VarietyHint, PlantDictionary, Logger } from "../types.js";
import { defaultLogger } from "../types.js";

/**
 * In-memory cache for variety hints (per genus).
 * TTL-based: entries expire after 1 hour.
 */
const hintCache = new Map<
  string,
  { hints: VarietyHint[]; expiresAt: number }
>();
const CACHE_TTL_MS = 3600 * 1000; // 1 hour

/**
 * Get known varieties for a specific genus from the plant dictionary.
 */
export function getVarietyHintsForGenus(
  genus: string,
  dictionary: PlantDictionary,
  logger: Logger = defaultLogger,
): VarietyHint[] {
  if (!genus) return [];

  // Check in-memory cache
  const cacheKey = genus.toLowerCase();
  const cached = hintCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info("Using cached variety hints", {
      genus,
      varietyCount: cached.hints.length,
    });
    return cached.hints;
  }

  logger.info("Fetching variety hints for genus", { genus });

  const hints: VarietyHint[] = [];

  // Source: Plant Dictionary entries with variety field
  const genusPlants = dictionary.findByGenus(genus);

  for (const plant of genusPlants) {
    if (plant.variety) {
      hints.push({
        genus: plant.genus ?? genus,
        species: plant.species ?? undefined,
        variety: plant.variety,
        source: "plant_dictionary",
        confidence: 0.9,
        usageCount: plant.usageCount,
      });
    }
  }

  logger.info("Found varieties in plant dictionary", {
    genus,
    count: hints.length,
  });

  // Sort by confidence and usage
  hints.sort((a, b) => {
    const confidenceDiff = b.confidence - a.confidence;
    if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
    return (b.usageCount ?? 0) - (a.usageCount ?? 0);
  });

  // Cache results
  if (hints.length > 0) {
    hintCache.set(cacheKey, {
      hints,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  return hints;
}

/**
 * Get variety hints for multiple genera (batch operation).
 */
export function getVarietyHintsForGenera(
  genera: string[],
  dictionary: PlantDictionary,
  logger: Logger = defaultLogger,
): Map<string, VarietyHint[]> {
  const results = new Map<string, VarietyHint[]>();

  for (const genus of genera) {
    const hints = getVarietyHintsForGenus(genus, dictionary, logger);
    if (hints.length > 0) {
      results.set(genus, hints);
    }
  }

  return results;
}

/**
 * Format variety hints as a string for inclusion in NER prompt.
 */
export function formatVarietyHintsForPrompt(
  hintsMap: Map<string, VarietyHint[]>,
): string {
  if (hintsMap.size === 0) {
    return "";
  }

  let formatted =
    "Known varieties for detected genera (use these as hints when analyzing the transcript):\n";

  for (const [genus, hints] of hintsMap.entries()) {
    // Take top 10 most confident varieties per genus
    const topHints = hints.slice(0, 10);
    const varieties = topHints
      .map((h) => {
        const speciesPrefix = h.species ? ` ${h.species}` : "";
        return `'${h.variety}'${speciesPrefix}`;
      })
      .join(", ");

    formatted += `${genus}: ${varieties}\n`;
  }

  return formatted;
}

/**
 * Extract potential genera from transcript text for hint pre-loading.
 * Simple heuristic: looks for capitalized words that might be botanical genera.
 */
export function extractPotentialGeneraFromText(text: string): string[] {
  const genera = new Set<string>();

  // Pattern 1: Latin botanical names (Genus species)
  const latinPattern = /\b([A-Z][a-z]{3,})\s+[a-z]{3,}\b/g;
  let match;

  while ((match = latinPattern.exec(text)) !== null) {
    if (match[1]) genera.add(match[1]);
  }

  // Pattern 2: Check against common genera
  const commonGenera = [
    "Lavandula",
    "Salvia",
    "Rosa",
    "Helenium",
    "Brassica",
    "Solanum",
    "Acer",
    "Prunus",
    "Malus",
    "Heuchera",
    "Hosta",
    "Sedum",
    "Echinacea",
    "Rudbeckia",
    "Allium",
    "Narcissus",
    "Tulipa",
    "Dahlia",
    "Paeonia",
    "Hydrangea",
    "Clematis",
    "Geranium",
  ];

  for (const genus of commonGenera) {
    if (text.includes(genus)) {
      genera.add(genus);
    }
  }

  return Array.from(genera);
}

/**
 * Clear cached hints for a specific genus.
 */
export function clearVarietyHintsCache(genus?: string): void {
  if (genus) {
    hintCache.delete(genus.toLowerCase());
  } else {
    hintCache.clear();
  }
}
