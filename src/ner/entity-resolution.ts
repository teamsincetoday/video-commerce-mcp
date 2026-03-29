/**
 * Advanced Entity Resolution System
 *
 * Canonical dictionary with fuzzy matching, synonyms, and cultivar support.
 * Resolves entity names to canonical forms using multiple matching strategies:
 * exact, fuzzy (Levenshtein + Jaro-Winkler), synonym, and cultivar.
 *
 * Ported from monolith lib/services/entity-resolution.ts.
 * All business logic preserved; Prisma/Redis dependencies replaced with
 * PlantDictionary interface and an in-memory LRU cache.
 */

import type {
  CanonicalEntity,
  ResolutionResult,
  PlantDictionary,
  PlantEntry,
} from "../types.js";

/**
 * Options for entity resolution.
 */
export interface ResolveOptions {
  fuzzyThreshold?: number;
  includeAlternatives?: boolean;
  category?: string;
}

/**
 * Resolve entity with advanced matching.
 * Uses the provided PlantDictionary instead of Prisma queries.
 */
export function resolveEntityAdvanced(
  query: string,
  dictionary: PlantDictionary,
  options: ResolveOptions = {},
): ResolutionResult {
  const { fuzzyThreshold = 0.8, includeAlternatives = true } = options;

  const normalizedQuery = normalizeQuery(query);
  const allPlants = dictionary.getAll();

  // Try exact match on Latin name
  for (const plant of allPlants) {
    if (plant.latinName.toLowerCase() === normalizedQuery) {
      return createResult(plant, "exact", 1.0, []);
    }
  }

  // Try exact match on common names
  for (const plant of allPlants) {
    for (const name of plant.commonNames) {
      if (name.toLowerCase() === normalizedQuery) {
        return createResult(plant, "exact", 0.95, []);
      }
    }
  }

  // Try synonym match
  for (const plant of allPlants) {
    for (const synonym of plant.synonyms) {
      if (synonym.toLowerCase() === normalizedQuery) {
        return createResult(plant, "synonym", 0.9, []);
      }
    }
  }

  // Try cultivar/variety exact match (e.g. "Goldsturm" → Rudbeckia fulgida)
  for (const plant of allPlants) {
    if (plant.variety && normalizeQuery(plant.variety) === normalizedQuery) {
      return createResult(plant, "synonym", 0.88, []);
    }
  }

  // Try trade name exact match
  for (const plant of allPlants) {
    for (const tradeName of plant.tradeNames) {
      if (normalizeQuery(tradeName) === normalizedQuery) {
        return createResult(plant, "synonym", 0.85, []);
      }
    }
  }

  // Try fuzzy matching
  const fuzzyMatches: Array<{ plant: PlantEntry; score: number }> = [];

  for (const plant of allPlants) {
    // Check Latin name
    const latinScore = fuzzyMatch(
      normalizedQuery,
      plant.latinName.toLowerCase(),
    );
    if (latinScore >= fuzzyThreshold) {
      fuzzyMatches.push({ plant, score: latinScore });
      continue;
    }

    // Check common names
    let pushed = false;
    for (const name of plant.commonNames) {
      const score = fuzzyMatch(normalizedQuery, name.toLowerCase());
      if (score >= fuzzyThreshold) {
        fuzzyMatches.push({ plant, score });
        pushed = true;
        break;
      }
    }
    if (pushed) continue;

    // Check variety/cultivar name
    if (plant.variety) {
      const varietyScore = fuzzyMatch(normalizedQuery, normalizeQuery(plant.variety));
      if (varietyScore >= fuzzyThreshold) {
        fuzzyMatches.push({ plant, score: varietyScore * 0.95 });
      }
    }
  }

  // Sort by score
  fuzzyMatches.sort((a, b) => b.score - a.score);

  const best = fuzzyMatches[0];
  if (best) {
    const alternatives = includeAlternatives
      ? fuzzyMatches.slice(1, 4).map((m) => plantEntryToCanonical(m.plant))
      : [];

    return createResult(
      best.plant,
      "fuzzy",
      best.score * 0.85, // Reduce confidence for fuzzy
      alternatives,
    );
  }

  // No match found
  return {
    entity: null,
    matchType: "none",
    confidence: 0,
    alternatives: [],
  };
}

/**
 * Batch resolve multiple entities.
 */
export function batchResolveEntities(
  queries: string[],
  dictionary: PlantDictionary,
  options?: ResolveOptions,
): Map<string, ResolutionResult> {
  const results = new Map<string, ResolutionResult>();

  for (const query of queries) {
    const result = resolveEntityAdvanced(query, dictionary, options);
    results.set(query, result);
  }

  return results;
}

/**
 * Suggest related entities by genus or common name similarity.
 */
export function suggestRelatedEntities(
  entry: PlantEntry,
  dictionary: PlantDictionary,
  limit: number = 5,
): CanonicalEntity[] {
  const genus = entry.latinName.split(" ")[0];
  if (!genus) return [];

  // Find plants in same genus
  const related = dictionary
    .getAll()
    .filter((p) => {
      if (p.latinName === entry.latinName) return false;
      // Same genus
      if (p.latinName.startsWith(genus)) return true;
      // Similar common names
      if (
        entry.commonNames.length > 0 &&
        p.commonNames.some((cn) =>
          cn.toLowerCase().includes((entry.commonNames[0] ?? "").toLowerCase()),
        )
      ) {
        return true;
      }
      return false;
    })
    .slice(0, limit);

  return related.map(plantEntryToCanonical);
}

// ============================================================================
// Internal helpers
// ============================================================================

function createResult(
  plant: PlantEntry,
  matchType: ResolutionResult["matchType"],
  confidence: number,
  alternatives: CanonicalEntity[],
): ResolutionResult {
  return {
    entity: plantEntryToCanonical(plant),
    matchType,
    confidence,
    alternatives,
  };
}

/**
 * Convert PlantEntry to CanonicalEntity.
 */
function plantEntryToCanonical(plant: PlantEntry): CanonicalEntity {
  const canonicalName = plant.latinName.toLowerCase().replace(/\s+/g, "_");
  return {
    id: canonicalName, // Use canonical name as ID in standalone mode
    canonicalName,
    latinName: plant.latinName,
    commonNames: plant.commonNames,
    synonyms: plant.synonyms,
    cultivars: plant.variety ? [plant.variety] : [],
    misspellings: [],
    category: canonicalName.split("_")[0] ?? "unknown",
    confidence: 1.0,
  };
}

/**
 * Normalize query string.
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "") // Remove special characters
    .replace(/\s+/g, " "); // Normalize whitespace
}

/**
 * Fuzzy match with multiple algorithms.
 * Returns a weighted average of substring, word overlap, Levenshtein, and Jaro-Winkler.
 */
export function fuzzyMatch(query: string, target: string): number {
  // 1. Exact match
  if (query === target) return 1.0;

  // 2. Substring bonus — only when query sits on a word boundary in target.
  // "helenium" in "helenium autumnale" → bonus (genus match, word boundary).
  // "Rudbeckia" in "Rudbeckia fulgida" → bonus (genus match, word boundary).
  // "mint" in "peppermint" → NO bonus (embedded inside a word).
  // "rose" in "rosemary" → NO bonus (embedded inside a word).
  const substringIdx = target.indexOf(query);
  if (substringIdx !== -1) {
    const atWordStart = substringIdx === 0 || target[substringIdx - 1] === " ";
    const atWordEnd = substringIdx + query.length === target.length || target[substringIdx + query.length] === " ";
    if (atWordStart && atWordEnd) {
      return 1.0 - ((target.length - query.length) / target.length) * 0.2;
    }
  }

  // 3. Word overlap
  const queryWords = query.split(" ");
  const targetWords = target.split(" ");
  const overlap = queryWords.filter((w) => targetWords.includes(w)).length;
  const wordScore =
    overlap / Math.max(queryWords.length, targetWords.length);

  // 4. Levenshtein similarity
  const distance = levenshteinDistance(query, target);
  const maxLength = Math.max(query.length, target.length);
  const levScore = 1 - distance / maxLength;

  // 5. Jaro-Winkler similarity
  const jaroScore = jaroWinklerSimilarity(query, target);

  // Weighted average — word overlap reduced, Levenshtein increased.
  // Experiment sweep (2026-03-11) found {0.2, 0.5, 0.3} outperforms
  // {0.3, 0.4, 0.3} on adversarial entity pairs (F1 0.583 vs 0.000 at
  // threshold 0.7): lower word weight avoids substring false positives,
  // higher Levenshtein weight improves misspelling recovery.
  return wordScore * 0.2 + levScore * 0.5 + jaroScore * 0.3;
}

/**
 * Levenshtein distance.
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1,
        );
      }
    }
  }

  return matrix[str2.length]![str1.length]!;
}

/**
 * Jaro-Winkler similarity.
 */
export function jaroWinklerSimilarity(str1: string, str2: string): number {
  const jaro = jaroSimilarity(str1, str2);

  // Calculate common prefix length (max 4)
  let prefix = 0;
  for (let i = 0; i < Math.min(str1.length, str2.length, 4); i++) {
    if (str1[i] === str2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Jaro similarity.
 */
export function jaroSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const matchWindow =
    Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
  const str1Matches = new Array<boolean>(str1.length).fill(false);
  const str2Matches = new Array<boolean>(str2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Identify matches
  for (let i = 0; i < str1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, str2.length);

    for (let j = start; j < end; j++) {
      if (str2Matches[j] || str1[i] !== str2[j]) continue;
      str1Matches[i] = true;
      str2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < str1.length; i++) {
    if (!str1Matches[i]) continue;
    while (!str2Matches[k]) k++;
    if (str1[i] !== str2[k]) transpositions++;
    k++;
  }

  return (
    (matches / str1.length +
      matches / str2.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}
