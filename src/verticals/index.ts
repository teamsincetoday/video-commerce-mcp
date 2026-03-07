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
 * - Generic (content-agnostic fallback)
 *
 * Adding a new vertical:
 * 1. Create a new file (e.g., cooking.ts) implementing VerticalConfig
 * 2. Register it with registerVertical()
 * 3. Provide a domain dictionary JSON file matching the DomainDictionaryEntry schema
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

// ---- Generic Vertical (fallback) ----
export { GENERIC_VERTICAL } from "./generic.js";

// ---- Domain Dictionary Schema ----
export {
  DOMAIN_DICTIONARY_JSON_SCHEMA,
  plantEntryToDomainEntry,
  type DomainDictionaryEntry,
} from "./dictionary-schema.js";

// ============================================================================
// VERTICAL REGISTRY
// ============================================================================

import type { VerticalConfig, CommerceCategoryConfig } from "./vertical-config.js";
import { GARDENING_VERTICAL } from "./gardening.js";
import { GENERIC_VERTICAL } from "./generic.js";

/**
 * In-memory registry of available verticals.
 * Pre-populated with gardening + generic.
 */
const verticalRegistry = new Map<string, VerticalConfig>();

// Register built-in verticals
verticalRegistry.set(GARDENING_VERTICAL.id, GARDENING_VERTICAL);
verticalRegistry.set(GENERIC_VERTICAL.id, GENERIC_VERTICAL);

// Load any previously learned verticals from disk into registry at module init
try {
  const learnedDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "learned-verticals");
  if (existsSync(learnedDir)) {
    const jsonFiles = readdirSync(learnedDir).filter((f) => f.endsWith(".json"));
    for (const file of jsonFiles) {
      try {
        const content = readFileSync(join(learnedDir, file), "utf-8");
        const parsed = JSON.parse(content) as { config?: VerticalConfig };
        if (parsed.config?.id && !verticalRegistry.has(parsed.config.id)) {
          verticalRegistry.set(parsed.config.id, parsed.config);
        }
      } catch {
        // Skip malformed files
      }
    }
  }
} catch {
  // Non-fatal: learned verticals are best-effort
}

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
 * Get the generic fallback vertical.
 */
export function getGenericVertical(): VerticalConfig {
  return GENERIC_VERTICAL;
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
 * Cannot unregister the default "gardening" or "generic" verticals.
 */
export function unregisterVertical(id: string): boolean {
  if (id === "gardening" || id === "generic") {
    return false;
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

// ============================================================================
// VERTICAL RESOLUTION
// ============================================================================

/**
 * Resolve a vertical by ID with fallback to generic.
 * Checks: registered verticals → learned verticals → generic fallback.
 */
export function resolveVertical(id: string): {
  config: VerticalConfig;
  source: "registered" | "learned" | "generic";
} {
  // Check registered verticals
  const registered = verticalRegistry.get(id);
  if (registered) {
    return { config: registered, source: "registered" };
  }

  // Check learned verticals from disk
  const learned = loadLearnedVertical(id);
  if (learned) {
    // Register it for future lookups in this session
    verticalRegistry.set(id, learned.config);
    return { config: learned.config, source: "learned" };
  }

  // Fallback to generic
  return { config: GENERIC_VERTICAL, source: "generic" };
}

/**
 * Build a keyword map for all registered verticals.
 * Used by the vertical detector to match against known verticals.
 */
export function getRegisteredVerticalKeywords(): Map<string, string[]> {
  const keywordMap = new Map<string, string[]>();

  for (const [id, config] of verticalRegistry) {
    if (id === "generic") continue; // Skip generic
    keywordMap.set(id, config.contentSignals.inclusionKeywords);
  }

  return keywordMap;
}

/**
 * Build a runtime VerticalConfig by merging generic defaults with
 * LLM-suggested config from vertical detection.
 */
export function buildRuntimeVertical(
  category: string,
  suggestedConfig: {
    displayName?: string;
    primaryEntityType?: string;
    primaryEntityTypePlural?: string;
    inclusionKeywords?: string[];
    commerceCategories?: Array<{
      id: string;
      displayName: string;
      keywords: string[];
    }>;
  },
): VerticalConfig {
  return {
    ...GENERIC_VERTICAL,
    id: category,
    displayName: suggestedConfig.displayName ?? `${category} Content`,
    description: `Auto-detected vertical for ${category} content.`,
    primaryEntityType:
      suggestedConfig.primaryEntityType ?? GENERIC_VERTICAL.primaryEntityType,
    primaryEntityTypePlural:
      suggestedConfig.primaryEntityTypePlural ??
      GENERIC_VERTICAL.primaryEntityTypePlural,
    contentSignals: {
      ...GENERIC_VERTICAL.contentSignals,
      inclusionKeywords: suggestedConfig.inclusionKeywords ?? [],
    },
    commerceCategories:
      suggestedConfig.commerceCategories?.map((cat) => ({
        id: cat.id,
        displayName: cat.displayName,
        keywords: cat.keywords,
      })) ?? GENERIC_VERTICAL.commerceCategories,
    // Slightly higher aggressiveness than pure generic since we have keywords
    filteringAggressiveness:
      (suggestedConfig.inclusionKeywords?.length ?? 0) > 0 ? 0.3 : 0.1,
  };
}

// ============================================================================
// LEARNED VERTICALS — Persist & Load from disk
// ============================================================================

export interface LearnedVerticalFeedback {
  totalEntityCount: number;
  totalCommerceItemCount: number;
  avgConfidence: number;
  observedEntityCategories: Record<string, number>;
  observedCommerceCategories: Record<string, number>;
  topShoppableEntities: string[];   // deduplicated, last 50
  topCommerceItems: string[];       // deduplicated, last 50
}

export interface LearnedVertical {
  id: string;
  displayName: string;
  learnedFrom: string[];
  firstSeen: string;
  lastUsed: string;
  useCount: number;
  config: VerticalConfig;
  feedback?: LearnedVerticalFeedback;
}

/**
 * Get the directory for learned verticals.
 * Uses data/learned-verticals/ relative to the package root.
 */
function getLearnedVerticalsDir(): string {
  // Navigate from src/verticals/ to package root/data/learned-verticals/
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, "..", "..", "data", "learned-verticals");
}

/**
 * Load a learned vertical from disk.
 */
function loadLearnedVertical(id: string): LearnedVertical | undefined {
  try {
    const dir = getLearnedVerticalsDir();
    const filePath = join(dir, `${id}.json`);

    if (!existsSync(filePath)) {
      return undefined;
    }

    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as LearnedVertical;
  } catch {
    return undefined;
  }
}

/**
 * Save a learned vertical to disk.
 * If the vertical already exists, merges new data (keywords, use count).
 * When feedback is provided, applies refinements: new commerce categories,
 * enriched keywords, tuned filtering, and enhanced NER prompts.
 */
export function saveLearnedVertical(
  category: string,
  config: VerticalConfig,
  videoId: string,
  feedback?: VerticalFeedback,
): void {
  try {
    const dir = getLearnedVerticalsDir();

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const filePath = join(dir, `${category}.json`);
    const now = new Date().toISOString();

    let learned: LearnedVertical;

    if (existsSync(filePath)) {
      // Merge with existing
      const existing = JSON.parse(
        readFileSync(filePath, "utf-8"),
      ) as LearnedVertical;

      // Merge inclusion keywords (deduplicate)
      const mergedKeywords = Array.from(
        new Set([
          ...existing.config.contentSignals.inclusionKeywords,
          ...config.contentSignals.inclusionKeywords,
        ]),
      );

      // Merge commerce categories
      const existingCatIds = new Set(
        existing.config.commerceCategories.map((c) => c.id),
      );
      const newCats = config.commerceCategories.filter(
        (c) => !existingCatIds.has(c.id),
      );

      learned = {
        ...existing,
        lastUsed: now,
        useCount: existing.useCount + 1,
        learnedFrom: Array.from(
          new Set([...existing.learnedFrom, videoId]),
        ).slice(-20), // Keep last 20 video IDs
        config: {
          ...existing.config,
          contentSignals: {
            ...existing.config.contentSignals,
            inclusionKeywords: mergedKeywords,
          },
          commerceCategories: [
            ...existing.config.commerceCategories,
            ...newCats,
          ],
        },
      };
    } else {
      // New learned vertical
      learned = {
        id: category,
        displayName: config.displayName,
        learnedFrom: [videoId],
        firstSeen: now,
        lastUsed: now,
        useCount: 1,
        config,
      };
    }

    // Apply feedback refinements when available
    if (feedback) {
      learned = applyFeedback(learned, feedback);
    }

    writeFileSync(filePath, JSON.stringify(learned, null, 2));

    // Also register in memory for this session
    verticalRegistry.set(category, learned.config);
  } catch {
    // Non-fatal: learning is best-effort
  }
}

/**
 * Apply extraction feedback to refine a learned vertical config.
 */
function applyFeedback(learned: LearnedVertical, feedback: VerticalFeedback): LearnedVertical {
  const config = { ...learned.config };

  // (a) Add new commerce categories from observed data
  const existingCatIds = new Set(config.commerceCategories.map((c) => c.id));
  for (const [observedCat, count] of Object.entries(feedback.observedCommerceCategories)) {
    if (count > 0 && !existingCatIds.has(observedCat)) {
      // Find commerce item names that belong to this category
      const keywords = feedback.commerceItemNames.slice(0, 10);
      const newCat: CommerceCategoryConfig = {
        id: observedCat,
        displayName: observedCat.charAt(0).toUpperCase() + observedCat.slice(1).toLowerCase(),
        keywords,
      };
      config.commerceCategories = [...config.commerceCategories, newCat];
    }
  }

  // (b) Enrich existing categories with real commerce item names as keywords
  if (feedback.commerceItemNames.length > 0) {
    config.commerceCategories = config.commerceCategories.map((cat) => {
      // Add commerce items that match this category
      const matchingItems = feedback.commerceItemNames.filter(() => {
        const catCount = feedback.observedCommerceCategories[cat.id];
        return catCount !== undefined && catCount > 0;
      });
      if (matchingItems.length > 0) {
        const merged = Array.from(new Set([...cat.keywords, ...matchingItems])).slice(0, 50);
        return { ...cat, keywords: merged };
      }
      return cat;
    });
  }

  // (c) Add high-confidence shoppable entity names to inclusion keywords
  if (feedback.shoppableEntityNames.length > 0) {
    const merged = Array.from(
      new Set([
        ...config.contentSignals.inclusionKeywords,
        ...feedback.shoppableEntityNames,
      ]),
    ).slice(0, 100);
    config.contentSignals = {
      ...config.contentSignals,
      inclusionKeywords: merged,
    };
  }

  // (d) Tune filteringAggressiveness based on extraction quality
  if (config.filteringAggressiveness !== undefined) {
    if (feedback.entityCount > 5 && feedback.avgConfidence > 0.6) {
      // Extraction working well — can filter more aggressively
      config.filteringAggressiveness = Math.min(0.8, config.filteringAggressiveness + 0.05);
    } else if (feedback.entityCount < 3) {
      // Too aggressive — back off
      config.filteringAggressiveness = Math.max(0.05, config.filteringAggressiveness - 0.05);
    }
  }

  // (e) Enhance NER prompt with learned examples
  if (config.nerPrompt) {
    const learnedExamples: string[] = [];
    if (feedback.shoppableEntityNames.length > 0) {
      learnedExamples.push(
        `Previously found shoppable items in this domain include: ${feedback.shoppableEntityNames.slice(0, 15).join(", ")}.`,
      );
    }
    if (Object.keys(feedback.observedCommerceCategories).length > 0) {
      const cats = Object.keys(feedback.observedCommerceCategories).join(", ");
      learnedExamples.push(`Commerce categories to extract: ${cats}.`);
    }
    if (learnedExamples.length > 0) {
      // Strip any previous "Previously found" block before appending fresh one
      const base = config.nerPrompt.systemMessage.replace(
        /\n\nPreviously found shoppable items[\s\S]*$/,
        "",
      );
      config.nerPrompt = {
        ...config.nerPrompt,
        systemMessage: `${base}\n\n${learnedExamples.join("\n")}`,
      };
    }
  }

  // (f) Persist aggregated feedback metrics
  const prevFeedback = learned.feedback;
  const mergedShoppable = Array.from(
    new Set([...(prevFeedback?.topShoppableEntities ?? []), ...feedback.shoppableEntityNames]),
  ).slice(-50);
  const mergedCommerceItems = Array.from(
    new Set([...(prevFeedback?.topCommerceItems ?? []), ...feedback.commerceItemNames]),
  ).slice(-50);

  // Merge observed category counts
  const mergedEntityCats = { ...(prevFeedback?.observedEntityCategories ?? {}) };
  for (const [cat, count] of Object.entries(feedback.observedEntityCategories)) {
    mergedEntityCats[cat] = (mergedEntityCats[cat] ?? 0) + count;
  }
  const mergedCommerceCats = { ...(prevFeedback?.observedCommerceCategories ?? {}) };
  for (const [cat, count] of Object.entries(feedback.observedCommerceCategories)) {
    mergedCommerceCats[cat] = (mergedCommerceCats[cat] ?? 0) + count;
  }

  // Running average confidence
  const prevTotal = prevFeedback?.totalEntityCount ?? 0;
  const prevAvg = prevFeedback?.avgConfidence ?? 0;
  const newTotal = prevTotal + feedback.entityCount;
  const newAvg = newTotal > 0
    ? (prevAvg * prevTotal + feedback.avgConfidence * feedback.entityCount) / newTotal
    : 0;

  return {
    ...learned,
    config,
    feedback: {
      totalEntityCount: (prevFeedback?.totalEntityCount ?? 0) + feedback.entityCount,
      totalCommerceItemCount: (prevFeedback?.totalCommerceItemCount ?? 0) + feedback.commerceItemCount,
      avgConfidence: Math.round(newAvg * 1000) / 1000,
      observedEntityCategories: mergedEntityCats,
      observedCommerceCategories: mergedCommerceCats,
      topShoppableEntities: mergedShoppable,
      topCommerceItems: mergedCommerceItems,
    },
  };
}

/**
 * Load all learned verticals from disk into the registry.
 * Called at startup to make previously learned verticals available.
 */
export function loadAllLearnedVerticals(): string[] {
  const loaded: string[] = [];

  try {
    const dir = getLearnedVerticalsDir();
    if (!existsSync(dir)) return loaded;

    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), "utf-8");
        const learned = JSON.parse(content) as LearnedVertical;
        if (learned.config?.id) {
          verticalRegistry.set(learned.config.id, learned.config);
          loaded.push(learned.config.id);
        }
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // Non-fatal
  }

  return loaded;
}

// ============================================================================
// FEEDBACK COLLECTION
// ============================================================================

/**
 * Feedback collected from a successful pipeline run.
 * Used to refine learned vertical configs.
 */
export interface VerticalFeedback {
  entityCount: number;
  avgConfidence: number;
  commerceItemCount: number;
  commercialIntentScore: number;
  observedEntityCategories: Record<string, number>;  // category → count
  observedCommerceCategories: Record<string, number>; // category → count
  shoppableEntityNames: string[];                     // high-conf shoppable names
  commerceItemNames: string[];                        // actual items found
  observedActionCategories: string[];                 // action types
}

/**
 * Collect feedback from extraction results.
 * Pure function — no side effects. Accepts pipeline output types inline
 * to avoid circular dependency on pipeline-orchestrator.
 */
export function collectFeedback(
  entities: ReadonlyArray<{
    name: string;
    category: string;
    confidence: number;
    isShoppable: boolean;
  }>,
  commerceItems: ReadonlyArray<{
    name: string;
    category: string;
    confidence: number;
  }>,
  aiResult: {
    commercialIntent?: { score: number };
    actions?: ReadonlyArray<{ category: string }>;
  } | null,
): VerticalFeedback {
  // Observed entity categories
  const entityCats: Record<string, number> = {};
  let totalConf = 0;
  const shoppableNames: string[] = [];

  for (const e of entities) {
    entityCats[e.category] = (entityCats[e.category] ?? 0) + 1;
    totalConf += e.confidence;
    if (e.isShoppable && e.confidence > 0.7) {
      shoppableNames.push(e.name);
    }
  }

  // Observed commerce categories
  const commerceCats: Record<string, number> = {};
  const commerceNames: string[] = [];
  for (const item of commerceItems) {
    commerceCats[item.category] = (commerceCats[item.category] ?? 0) + 1;
    commerceNames.push(item.name);
  }

  // Action categories
  const actionCats = Array.from(
    new Set((aiResult?.actions ?? []).map((a) => a.category)),
  );

  return {
    entityCount: entities.length,
    avgConfidence: entities.length > 0 ? totalConf / entities.length : 0,
    commerceItemCount: commerceItems.length,
    commercialIntentScore: aiResult?.commercialIntent?.score ?? 0,
    observedEntityCategories: entityCats,
    observedCommerceCategories: commerceCats,
    shoppableEntityNames: shoppableNames,
    commerceItemNames: commerceNames,
    observedActionCategories: actionCats,
  };
}

// ============================================================================
// VERTICAL INSIGHTS — Strategic intelligence from learned verticals
// ============================================================================

export interface VerticalInsight {
  id: string;
  displayName: string;
  useCount: number;
  firstSeen: string;
  lastUsed: string;
  videosAnalyzed: number;
  maturity: "emerging" | "developing" | "stable";
  avgCommerceItems: number;
  avgEntities: number;
  avgConfidence: number;
  topCommerceCategories: string[];
  topShoppableEntities: string[];
  commercialPotential: "low" | "medium" | "high";
  opportunity: string;
}

/**
 * Read all learned verticals and return strategic insights.
 * No AI calls — purely reads from data/learned-verticals/*.json.
 */
export function getVerticalInsights(): VerticalInsight[] {
  const insights: VerticalInsight[] = [];

  try {
    const dir = getLearnedVerticalsDir();
    if (!existsSync(dir)) return insights;

    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), "utf-8");
        const learned = JSON.parse(content) as LearnedVertical;

        const fb = learned.feedback;
        const videosAnalyzed = learned.learnedFrom.length;

        // Maturity based on use count
        let maturity: "emerging" | "developing" | "stable";
        if (learned.useCount >= 10) maturity = "stable";
        else if (learned.useCount >= 3) maturity = "developing";
        else maturity = "emerging";

        // Average per-video metrics
        const avgCommerceItems = videosAnalyzed > 0
          ? Math.round(((fb?.totalCommerceItemCount ?? 0) / videosAnalyzed) * 10) / 10
          : 0;
        const avgEntities = videosAnalyzed > 0
          ? Math.round(((fb?.totalEntityCount ?? 0) / videosAnalyzed) * 10) / 10
          : 0;
        const avgConfidence = fb?.avgConfidence ?? 0;

        // Top commerce categories (sorted by count)
        const topCommerceCategories = fb
          ? Object.entries(fb.observedCommerceCategories)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([cat]) => cat)
          : [];

        const topShoppableEntities = (fb?.topShoppableEntities ?? []).slice(0, 10);

        // Commercial potential based on commerce yield
        let commercialPotential: "low" | "medium" | "high";
        if (avgCommerceItems >= 3) commercialPotential = "high";
        else if (avgCommerceItems >= 1) commercialPotential = "medium";
        else commercialPotential = "low";

        // One-line opportunity summary
        const parts: string[] = [];
        parts.push(`${commercialPotential.charAt(0).toUpperCase() + commercialPotential.slice(1)} commerce yield`);
        parts.push(`${videosAnalyzed} video${videosAnalyzed !== 1 ? "s" : ""} analyzed`);
        if (maturity === "emerging") {
          parts.push("needs more data to stabilize");
        } else if (commercialPotential === "high" && maturity === "developing") {
          parts.push("consider building a dedicated vertical config");
        } else if (commercialPotential === "low") {
          parts.push("commerce extraction needs improvement");
        }

        insights.push({
          id: learned.id,
          displayName: learned.displayName,
          useCount: learned.useCount,
          firstSeen: learned.firstSeen,
          lastUsed: learned.lastUsed,
          videosAnalyzed,
          maturity,
          avgCommerceItems,
          avgEntities,
          avgConfidence,
          topCommerceCategories,
          topShoppableEntities,
          commercialPotential,
          opportunity: parts.join(" — "),
        });
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // Non-fatal
  }

  // Sort by use count descending
  return insights.sort((a, b) => b.useCount - a.useCount);
}
