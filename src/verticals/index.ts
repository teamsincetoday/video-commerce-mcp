/**
 * Verticals Module
 *
 * Provides the vertical configuration system that makes the MCP pipeline
 * domain-agnostic. Each vertical (gardening, cooking, DIY, etc.) implements
 * the VerticalConfig interface with its own:
 *
 * - Entity patterns (regex for domain-specific entities)
 * - Commerce categories with detection keywords
 * - Audience intent taxonomy
 * - NER prompt templates
 * - Affiliate network configuration
 * - Seasonal patterns
 * - Domain dictionary schema
 *
 * Built-in verticals:
 * - Gardening (default, fully configured with 500+ keywords)
 *
 * Adding a new vertical:
 * 1. Create a new file (e.g., cooking.ts) implementing VerticalConfig
 * 2. Register it with registerVertical()
 * 3. Provide a domain dictionary JSON file matching the DomainDictionaryEntry schema
 */

// ---- Vertical Config Interface ----
export type {
  VerticalConfig,
  EntityPattern,
  ContentSignals,
  CommerceCategoryConfig,
  IntentArchetype,
  AffiliateNetworkConfig,
  NERPromptConfig,
  VideoStructureConfig,
  SeasonalConfig,
} from "./vertical-config.js";

// ---- Gardening Vertical (default) ----
export { GARDENING_VERTICAL } from "./gardening.js";

// ---- Domain Dictionary Schema ----
export {
  DOMAIN_DICTIONARY_JSON_SCHEMA,
  plantEntryToDomainEntry,
  type DomainDictionaryEntry,
} from "./dictionary-schema.js";

// ============================================================================
// VERTICAL REGISTRY
// ============================================================================

import type { VerticalConfig } from "./vertical-config.js";
import { GARDENING_VERTICAL } from "./gardening.js";

/**
 * In-memory registry of available verticals.
 * Pre-populated with the gardening vertical.
 */
const verticalRegistry = new Map<string, VerticalConfig>();

// Register built-in verticals
verticalRegistry.set(GARDENING_VERTICAL.id, GARDENING_VERTICAL);

/**
 * Get a vertical config by ID.
 * Returns undefined if not registered.
 */
export function getVertical(id: string): VerticalConfig | undefined {
  return verticalRegistry.get(id);
}

/**
 * Get the default vertical (gardening).
 */
export function getDefaultVertical(): VerticalConfig {
  return GARDENING_VERTICAL;
}

/**
 * Register a new vertical config.
 * Overwrites if a vertical with the same ID already exists.
 */
export function registerVertical(config: VerticalConfig): void {
  verticalRegistry.set(config.id, config);
}

/**
 * Unregister a vertical by ID.
 * Returns true if removed, false if not found.
 * Cannot unregister the default "gardening" vertical.
 */
export function unregisterVertical(id: string): boolean {
  if (id === "gardening") {
    return false; // Cannot remove built-in default
  }
  return verticalRegistry.delete(id);
}

/**
 * List all registered vertical IDs.
 */
export function listVerticals(): string[] {
  return Array.from(verticalRegistry.keys());
}

/**
 * Get all registered vertical configs.
 */
export function getAllVerticals(): VerticalConfig[] {
  return Array.from(verticalRegistry.values());
}

/**
 * Get all commerce keywords for a vertical, flattened across all categories.
 * Useful for quick keyword lookups in preprocessing.
 */
export function getAllCommerceKeywords(verticalId?: string): string[] {
  const vertical = verticalId
    ? verticalRegistry.get(verticalId)
    : GARDENING_VERTICAL;

  if (!vertical) return [];

  return vertical.commerceCategories.flatMap((cat) => cat.keywords);
}

/**
 * Get all known brands for a vertical, flattened across all categories.
 */
export function getAllBrands(verticalId?: string): string[] {
  const vertical = verticalId
    ? verticalRegistry.get(verticalId)
    : GARDENING_VERTICAL;

  if (!vertical) return [];

  return vertical.commerceCategories.flatMap(
    (cat) => cat.knownBrands ?? [],
  );
}
