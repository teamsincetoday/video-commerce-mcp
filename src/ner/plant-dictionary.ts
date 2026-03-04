/**
 * Plant Dictionary — In-memory implementation.
 *
 * Provides fast plant lookups by name, Latin name, common name, and genus.
 * Loads data from a JSON file (replaces Prisma Plant model queries).
 *
 * The dictionary can be populated from:
 * - A static JSON file (sample or full export from database)
 * - Programmatically via loadEntries()
 */

import { readFileSync } from "node:fs";
import type { PlantDictionary, PlantEntry } from "../types.js";

/**
 * Create an in-memory PlantDictionary from a JSON file.
 */
export function createPlantDictionaryFromFile(filePath: string): PlantDictionary {
  const raw = readFileSync(filePath, "utf-8");
  const entries: PlantEntry[] = JSON.parse(raw);
  return createPlantDictionary(entries);
}

/**
 * Create an in-memory PlantDictionary from an array of entries.
 */
export function createPlantDictionary(entries: PlantEntry[]): PlantDictionary {
  // Build lookup indices for O(1) access
  const byLatinName = new Map<string, PlantEntry>();
  const byCommonName = new Map<string, PlantEntry[]>();
  const byGenus = new Map<string, PlantEntry[]>();

  for (const entry of entries) {
    // Index by Latin name (lowercase for case-insensitive lookup)
    byLatinName.set(entry.latinName.toLowerCase(), entry);

    // Index by each common name
    for (const cn of entry.commonNames) {
      const key = cn.toLowerCase();
      const existing = byCommonName.get(key) ?? [];
      existing.push(entry);
      byCommonName.set(key, existing);
    }

    // Index by genus
    if (entry.genus) {
      const genusKey = entry.genus.toLowerCase();
      const existing = byGenus.get(genusKey) ?? [];
      existing.push(entry);
      byGenus.set(genusKey, existing);
    }
  }

  return {
    findByName(name: string): PlantEntry | undefined {
      const normalized = name.toLowerCase().trim();

      // Try Latin name first
      const byLatin = byLatinName.get(normalized);
      if (byLatin) return byLatin;

      // Try common name
      const byCommon = byCommonName.get(normalized);
      if (byCommon && byCommon.length > 0) return byCommon[0];

      // Try synonym match
      for (const entry of entries) {
        for (const syn of entry.synonyms) {
          if (syn.toLowerCase() === normalized) return entry;
        }
      }

      return undefined;
    },

    findByLatinName(latinName: string): PlantEntry | undefined {
      return byLatinName.get(latinName.toLowerCase().trim());
    },

    findByCommonName(commonName: string): PlantEntry[] {
      return byCommonName.get(commonName.toLowerCase().trim()) ?? [];
    },

    findByGenus(genus: string): PlantEntry[] {
      return byGenus.get(genus.toLowerCase().trim()) ?? [];
    },

    search(query: string): PlantEntry[] {
      const normalized = query.toLowerCase().trim();
      const results: PlantEntry[] = [];

      for (const entry of entries) {
        // Check Latin name
        if (entry.latinName.toLowerCase().includes(normalized)) {
          results.push(entry);
          continue;
        }

        // Check common names
        if (entry.commonNames.some(cn => cn.toLowerCase().includes(normalized))) {
          results.push(entry);
          continue;
        }

        // Check synonyms
        if (entry.synonyms.some(syn => syn.toLowerCase().includes(normalized))) {
          results.push(entry);
          continue;
        }

        // Check genus
        if (entry.genus && entry.genus.toLowerCase().includes(normalized)) {
          results.push(entry);
          continue;
        }
      }

      return results;
    },

    getAll(): PlantEntry[] {
      return [...entries];
    },

    size(): number {
      return entries.length;
    },
  };
}

/**
 * Create an empty PlantDictionary (useful for testing or non-plant verticals).
 */
export function createEmptyDictionary(): PlantDictionary {
  return createPlantDictionary([]);
}
