/**
 * Domain Dictionary Schema
 *
 * Defines the reusable JSON format for domain-specific entity dictionaries.
 * Each vertical provides a dictionary file conforming to this schema.
 *
 * Examples:
 * - Gardening: plant-dictionary.json (PlantEntry[])
 * - Cooking: ingredient-dictionary.json
 * - DIY: material-dictionary.json
 *
 * The schema is intentionally flexible -- not all fields apply to all verticals.
 * Only `canonicalName` and `category` are required.
 */

// ============================================================================
// DOMAIN DICTIONARY ENTRY
// ============================================================================

/**
 * A single entry in a domain dictionary.
 *
 * This is the cross-vertical format. Each vertical maps its domain-specific
 * entities (plants, ingredients, tools, etc.) to this common shape.
 *
 * The NER pipeline uses this for:
 * - Entity resolution (matching detected names to canonical entries)
 * - Disambiguation (choosing between ambiguous matches)
 * - Confidence calibration (dictionary presence boosts confidence)
 * - Variety/cultivar detection (via variants field)
 */
export interface DomainDictionaryEntry {
  /** Canonical name for this entity (primary identifier). */
  canonicalName: string;

  /**
   * Domain-specific category for this entity.
   * Maps to one of the vertical's commerce categories.
   * Examples: "PLANT", "TOOL", "INGREDIENT", "MATERIAL"
   */
  category: string;

  /** Alternative names for this entity (common names, abbreviations, etc.). */
  alternativeNames?: string[];

  /** Known synonyms (including misspellings, regional names). */
  synonyms?: string[];

  /**
   * Scientific or formal name (if applicable).
   * For plants: Latin binomial (e.g., "Lavandula angustifolia").
   * For chemicals: IUPAC name. For recipes: formal dish name.
   */
  formalName?: string;

  /** Genus or top-level grouping (e.g., "Lavandula", "Allium"). */
  genus?: string;

  /** Species (e.g., "angustifolia", "cepa"). */
  species?: string;

  /**
   * Named variants/cultivars/sub-types.
   * For plants: cultivar names (e.g., ["Hidcote", "Munstead"]).
   * For ingredients: varieties (e.g., ["Arborio", "Basmati"]).
   */
  variants?: string[];

  /**
   * Known brand names or trade names associated with this entity.
   * For plants: trade series (e.g., ["Supertunia", "Proven Winners"]).
   * For tools: manufacturer names.
   */
  tradeNames?: string[];

  /** Taxonomy level (if applicable): "genus", "species", "variety", "cultivar". */
  taxonomyLevel?: string;

  /** How often this entity appears in analyzed content (for ranking). */
  usageCount?: number;

  /** Ambiguity score (0-1): how likely this name matches multiple entities. */
  ambiguityScore?: number;

  /** Arbitrary additional metadata specific to this vertical. */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// JSON SCHEMA (for external validation)
// ============================================================================

/**
 * JSON Schema (Draft 2020-12) for a domain dictionary file.
 *
 * Use this to validate dictionary JSON files:
 * ```typescript
 * import Ajv from 'ajv';
 * const ajv = new Ajv();
 * const validate = ajv.compile(DOMAIN_DICTIONARY_JSON_SCHEMA);
 * const valid = validate(JSON.parse(dictionaryJson));
 * ```
 */
export const DOMAIN_DICTIONARY_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "DomainDictionary",
  description:
    "A domain-specific entity dictionary for the Video Commerce Intelligence MCP. " +
    "Each entry represents a canonical entity that the NER pipeline can match against.",
  type: "array",
  items: {
    type: "object",
    required: ["canonicalName", "category"],
    properties: {
      canonicalName: {
        type: "string",
        description: "Primary canonical name for this entity.",
        minLength: 1,
      },
      category: {
        type: "string",
        description:
          "Domain-specific category (maps to vertical commerce categories).",
        minLength: 1,
      },
      alternativeNames: {
        type: "array",
        items: { type: "string" },
        description: "Alternative names (common names, abbreviations).",
      },
      synonyms: {
        type: "array",
        items: { type: "string" },
        description: "Synonyms including misspellings and regional names.",
      },
      formalName: {
        type: "string",
        description:
          "Scientific or formal name (Latin binomial, IUPAC, etc.).",
      },
      genus: {
        type: "string",
        description: "Genus or top-level grouping.",
      },
      species: {
        type: "string",
        description: "Species identifier.",
      },
      variants: {
        type: "array",
        items: { type: "string" },
        description: "Named variants, cultivars, or sub-types.",
      },
      tradeNames: {
        type: "array",
        items: { type: "string" },
        description: "Brand or trade names associated with this entity.",
      },
      taxonomyLevel: {
        type: "string",
        enum: ["genus", "species", "variety", "cultivar", "hybrid", "other"],
        description: "Taxonomy level of this entry.",
      },
      usageCount: {
        type: "integer",
        minimum: 0,
        description: "How often this entity has been seen in analyzed content.",
      },
      ambiguityScore: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description:
          "Ambiguity score: 0 = unambiguous, 1 = highly ambiguous.",
      },
      metadata: {
        type: "object",
        description: "Arbitrary additional metadata for this vertical.",
      },
    },
    additionalProperties: false,
  },
} as const;

// ============================================================================
// HELPER: Convert PlantEntry to DomainDictionaryEntry
// ============================================================================

/**
 * Convert a PlantEntry (gardening-specific) to the generic DomainDictionaryEntry format.
 *
 * This allows the gardening vertical to use its existing plant-dictionary.json
 * while the generic pipeline works with DomainDictionaryEntry.
 */
export function plantEntryToDomainEntry(
  plant: {
    latinName: string;
    commonNames: string[];
    synonyms: string[];
    genus: string | null;
    species: string | null;
    variety: string | null;
    tradeNames: string[];
    taxonomyLevel: string | null;
    usageCount: number;
    ambiguityScore: number | null;
  },
): DomainDictionaryEntry {
  return {
    canonicalName: plant.latinName,
    category: "PLANT",
    alternativeNames: plant.commonNames,
    synonyms: plant.synonyms,
    formalName: plant.latinName,
    genus: plant.genus ?? undefined,
    species: plant.species ?? undefined,
    variants: plant.variety ? [plant.variety] : undefined,
    tradeNames: plant.tradeNames.length > 0 ? plant.tradeNames : undefined,
    taxonomyLevel:
      (plant.taxonomyLevel as DomainDictionaryEntry["taxonomyLevel"]) ??
      undefined,
    usageCount: plant.usageCount,
    ambiguityScore: plant.ambiguityScore ?? undefined,
  };
}
