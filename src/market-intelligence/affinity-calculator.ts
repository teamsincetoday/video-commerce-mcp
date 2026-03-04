/**
 * Category Affinity Calculator
 *
 * Calculates relationships between categories using multiple overlap dimensions.
 *
 * Formula:
 * AffinityScore =
 *   VideoOverlap(30%) + KeywordOverlap(25%) + AudienceOverlap(20%) +
 *   CommerceOverlap(15%) + CreatorOverlap(10%)
 *
 * Ported from monolith: lib/services/category-intelligence/affinity-calculator.ts
 * Removed: Prisma queries. All data provided via input interfaces.
 */

import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface AffinityResult {
  affinityScore: number;
  videoOverlap: number;
  keywordOverlap: number;
  audienceOverlap: number | null;
  commerceOverlap: number;
  creatorOverlap: number;
  relationshipType: "parent_child" | "sibling" | "adjacent" | "unrelated";
  confidenceScore: number;
  sampleSize: number;
}

/** Input for one category in a pairwise affinity calculation. */
export interface CategoryAffinityInput {
  categoryId: string;
  categoryKey: string;
  displayName: string;
  parentCategoryId: string | null;
  primaryKeywords: string[];
  secondaryKeywords: string[];
}

/**
 * Pre-computed overlap data provided by the caller.
 * This replaces the Prisma queries that counted overlapping videos, commerce items, etc.
 */
export interface OverlapData {
  /** Percentage of category A videos that also reference category B (0-100). */
  videoOverlap: number;
  /** Percentage of category A commerce items that also reference category B (0-100). */
  commerceOverlap: number;
  /** Percentage of category A creators that also cover category B (0-100). */
  creatorOverlap: number;
  /** Optional audience overlap (0-100), null if not yet tracked. */
  audienceOverlap: number | null;
}

// ============================================================================
// KEYWORD OVERLAP (pure computation, no DB)
// ============================================================================

/**
 * Calculate keyword similarity using Jaccard index.
 */
export function calculateKeywordOverlap(
  primaryA: string[],
  primaryB: string[],
  secondaryA: string[],
  secondaryB: string[],
): number {
  const allA = new Set(
    [...primaryA, ...secondaryA].map((k) => k.toLowerCase()),
  );
  const allB = new Set(
    [...primaryB, ...secondaryB].map((k) => k.toLowerCase()),
  );

  const intersection = new Set([...allA].filter((k) => allB.has(k)));
  const union = new Set([...allA, ...allB]);

  if (union.size === 0) return 0;

  return (intersection.size / union.size) * 100;
}

// ============================================================================
// RELATIONSHIP TYPE
// ============================================================================

/**
 * Determine relationship type based on hierarchy and affinity.
 */
export function determineRelationshipType(
  categoryA: CategoryAffinityInput,
  categoryB: CategoryAffinityInput,
  affinityScore: number,
): "parent_child" | "sibling" | "adjacent" | "unrelated" {
  // Check parent-child
  if (
    categoryA.parentCategoryId === categoryB.categoryId ||
    categoryB.parentCategoryId === categoryA.categoryId
  ) {
    return "parent_child";
  }

  // Check siblings (same parent)
  if (
    categoryA.parentCategoryId &&
    categoryA.parentCategoryId === categoryB.parentCategoryId
  ) {
    return "sibling";
  }

  // Affinity threshold
  if (affinityScore >= 50) {
    return "adjacent";
  }

  return "unrelated";
}

// ============================================================================
// MAIN AFFINITY CALCULATION
// ============================================================================

/**
 * Calculate affinity between two categories.
 *
 * The caller provides pre-computed overlap data (from their own data source)
 * plus the two category definitions. This function applies the weighted formula.
 */
export function calculateAffinity(
  categoryA: CategoryAffinityInput,
  categoryB: CategoryAffinityInput,
  overlapData: OverlapData,
  logger: Logger = defaultLogger,
): AffinityResult {
  // Keyword overlap (pure computation)
  const keywordOverlap = calculateKeywordOverlap(
    categoryA.primaryKeywords,
    categoryB.primaryKeywords,
    categoryA.secondaryKeywords,
    categoryB.secondaryKeywords,
  );

  // Weighted affinity score
  const affinityScore =
    overlapData.videoOverlap * 0.3 +
    keywordOverlap * 0.25 +
    (overlapData.audienceOverlap ?? 0) * 0.2 +
    overlapData.commerceOverlap * 0.15 +
    overlapData.creatorOverlap * 0.1;

  // Relationship type
  const relationshipType = determineRelationshipType(
    categoryA,
    categoryB,
    affinityScore,
  );

  // Confidence based on aggregate sample sizes
  const sampleSize =
    overlapData.videoOverlap +
    overlapData.commerceOverlap +
    overlapData.creatorOverlap;
  const confidenceScore = Math.min(1.0, sampleSize / 100);

  logger.info(
    `Affinity: ${categoryA.displayName} <-> ${categoryB.displayName} = ${affinityScore.toFixed(1)} (${relationshipType})`,
  );

  return {
    affinityScore,
    videoOverlap: overlapData.videoOverlap,
    keywordOverlap,
    audienceOverlap: overlapData.audienceOverlap,
    commerceOverlap: overlapData.commerceOverlap,
    creatorOverlap: overlapData.creatorOverlap,
    relationshipType,
    confidenceScore,
    sampleSize: Math.round(sampleSize),
  };
}

/**
 * Calculate affinities for all pairs in a list of categories.
 * Returns a list of pairwise affinity results.
 */
export function calculateAllAffinities(
  categories: CategoryAffinityInput[],
  overlapDataProvider: (
    a: CategoryAffinityInput,
    b: CategoryAffinityInput,
  ) => OverlapData,
  logger: Logger = defaultLogger,
): Array<{
  categoryAId: string;
  categoryBId: string;
  result: AffinityResult;
}> {
  const results: Array<{
    categoryAId: string;
    categoryBId: string;
    result: AffinityResult;
  }> = [];

  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const catA = categories[i]!;
      const catB = categories[j]!;
      const overlap = overlapDataProvider(catA, catB);
      const result = calculateAffinity(catA, catB, overlap, logger);
      results.push({
        categoryAId: catA.categoryId,
        categoryBId: catB.categoryId,
        result,
      });
    }
  }

  logger.info(`Completed affinity calculations`, {
    totalPairs: results.length,
  });

  return results;
}
