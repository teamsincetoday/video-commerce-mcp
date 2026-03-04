/**
 * Category Potential Scorer
 *
 * Evaluates categories for commercial and learning potential.
 * Extends the Three Forces model with additional scoring dimensions:
 * - Commercial Potential: Affiliate availability, price points, purchase intent
 * - Learning Potential: Skill progression, content depth, beginner accessibility
 *
 * HIGH-POTENTIAL CATEGORIES:
 * - Commercial: Tools, seeds, materials with high affiliate coverage
 * - Learning: Progressive skills (propagation, pruning, design)
 * - Evergreen: Year-round interest, not seasonal spikes
 *
 * Ported from monolith lib/services/category-potential-scorer.ts.
 * Standalone: no Prisma, no monolith dependencies.
 * All scoring uses pure functions with data passed as parameters.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PotentialScore {
  candidateId: string;
  candidateName: string;

  /** Core scores (0-100) */
  commercialPotential: number;
  learningPotential: number;
  evergreenScore: number;
  noveltyBonus: number; // Bonus for newly discovered, unique categories

  /** Sub-scores for commercial */
  affiliateAvailability: number; // How many affiliate programs exist
  pricePointScore: number; // Optimal price range ($10-$100)
  purchaseIntentScore: number; // Action words in searches

  /** Sub-scores for learning */
  skillProgressionScore: number; // Beginner -> Intermediate -> Advanced
  contentDepthScore: number; // Enough videos for comprehensive learning
  beginnerAccessibility: number; // Easy entry point

  /** Overall */
  overallPotential: number; // Weighted combination
  recommendedAction: "priority" | "promote" | "monitor" | "reject";
}

/**
 * Input data for scoring a candidate category.
 * Replaces Prisma CandidateCategory model.
 */
export interface CategoryCandidate {
  id: string;
  candidateName: string;
  /** Parsed keyword object: { primary: string[], secondary: string[] } */
  keywords: { primary: string[]; secondary: string[] };
  /** Number of affiliate programs available for this category */
  affiliateProgramCount?: number;
  /** Number of video mentions for content depth scoring */
  videoMentionCount?: number;
  /** Date when category was first detected */
  firstDetected: Date;
}

/**
 * Existing category keys for novelty calculation.
 */
export interface ExistingCategory {
  categoryKey: string;
}

// ============================================================================
// SCORING RULES (all constants preserved)
// ============================================================================

/**
 * Keywords indicating high commercial potential.
 */
const COMMERCIAL_INTENT_KEYWORDS = [
  "buy",
  "purchase",
  "order",
  "best",
  "review",
  "recommend",
  "quality",
  "durable",
  "professional",
  "essential",
  "kit",
];

/**
 * Keywords indicating learning potential.
 */
const LEARNING_INTENT_KEYWORDS = [
  "how to",
  "tutorial",
  "guide",
  "learn",
  "master",
  "technique",
  "method",
  "step",
  "beginner",
  "start",
  "basics",
  "advanced",
];

/**
 * Keywords for progressive skills (beginner -> advanced).
 */
const SKILL_PROGRESSION = {
  beginner: [
    "basic",
    "start",
    "beginner",
    "first",
    "simple",
    "easy",
    "plant",
    "water",
    "soil",
  ],
  intermediate: [
    "grow",
    "care",
    "maintain",
    "feed",
    "prune",
    "transplant",
    "design",
  ],
  advanced: [
    "propagate",
    "graft",
    "hybrid",
    "breed",
    "expert",
    "master",
    "professional",
  ],
};

/**
 * High-value product categories for affiliates.
 */
const HIGH_VALUE_CATEGORIES = [
  "tool",
  "equipment",
  "kit",
  "system",
  "device",
  "machine",
  "greenhouse",
  "raised bed",
  "irrigation",
  "automation",
];

/**
 * Evergreen topics (year-round interest).
 */
const EVERGREEN_KEYWORDS = [
  "houseplant",
  "indoor",
  "care",
  "maintenance",
  "pest",
  "disease",
  "soil",
  "compost",
  "water",
  "light",
  "propagation",
  "pruning",
];

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

/**
 * Calculate commercial potential (0-100).
 */
function calculateCommercialPotential(
  keywords: string[],
  affiliateProgramCount: number,
): {
  total: number;
  affiliateAvailability: number;
  pricePointScore: number;
  purchaseIntentScore: number;
} {
  // 1. Affiliate Availability (0-40 points)
  const isHighValue = keywords.some((kw) =>
    HIGH_VALUE_CATEGORIES.some((hv) => kw.includes(hv)),
  );
  const affiliateAvailability = Math.min(
    affiliateProgramCount * 10,
    isHighValue ? 40 : 30,
  );

  // 2. Price Point Score (0-30 points)
  let pricePointScore = 20; // Default
  if (isHighValue) {
    pricePointScore = 30; // Tools/equipment
  } else if (
    keywords.some((kw) => kw.includes("seed") || kw.includes("bulb"))
  ) {
    pricePointScore = 15; // Low-value items
  }

  // 3. Purchase Intent (0-30 points)
  const rawPurchaseIntent =
    keywords.filter((kw) =>
      COMMERCIAL_INTENT_KEYWORDS.some((intent) => kw.includes(intent)),
    ).length * 5;
  const purchaseIntentScore = Math.min(rawPurchaseIntent, 30);

  const total = affiliateAvailability + pricePointScore + purchaseIntentScore;

  return {
    total,
    affiliateAvailability,
    pricePointScore,
    purchaseIntentScore,
  };
}

/**
 * Calculate learning potential (0-100).
 */
function calculateLearningPotential(
  keywords: string[],
  videoMentionCount: number,
): {
  total: number;
  skillProgressionScore: number;
  contentDepthScore: number;
  beginnerAccessibility: number;
} {
  // 1. Skill Progression (0-40 points)
  const hasBeginnerKeywords = keywords.some((kw) =>
    SKILL_PROGRESSION.beginner.some((sk) => kw.includes(sk)),
  );
  const hasIntermediateKeywords = keywords.some((kw) =>
    SKILL_PROGRESSION.intermediate.some((sk) => kw.includes(sk)),
  );
  const hasAdvancedKeywords = keywords.some((kw) =>
    SKILL_PROGRESSION.advanced.some((sk) => kw.includes(sk)),
  );

  let skillProgressionScore = 0;
  if (hasBeginnerKeywords) skillProgressionScore += 15;
  if (hasIntermediateKeywords) skillProgressionScore += 15;
  if (hasAdvancedKeywords) skillProgressionScore += 10;

  // 2. Content Depth (0-30 points)
  const contentDepthScore = Math.min(
    (videoMentionCount / 10) * 30,
    30,
  );

  // 3. Beginner Accessibility (0-30 points)
  const hasLearningIntent = keywords.filter((kw) =>
    LEARNING_INTENT_KEYWORDS.some((intent) => kw.includes(intent)),
  ).length;
  const beginnerAccessibility = Math.min(hasLearningIntent * 10, 30);

  const total =
    skillProgressionScore + contentDepthScore + beginnerAccessibility;

  return {
    total,
    skillProgressionScore,
    contentDepthScore,
    beginnerAccessibility,
  };
}

/**
 * Calculate evergreen score (0-100).
 */
function calculateEvergreenScore(keywords: string[]): number {
  const evergreenMatches = keywords.filter((kw) =>
    EVERGREEN_KEYWORDS.some((eg) => kw.includes(eg)),
  ).length;

  return Math.min(evergreenMatches * 15, 100);
}

/**
 * Calculate similarity between two slugs (0-1) using Jaccard similarity.
 */
function calculateSlugSimilarity(slug1: string, slug2: string): number {
  const words1 = new Set(slug1.split("-"));
  const words2 = new Set(slug2.split("-"));

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Simple slugify function (replaces import from monolith utils).
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Calculate novelty bonus for newly discovered categories.
 *
 * Higher scores for:
 * - Recent discovery (recency bonus)
 * - Clean, well-structured slugs
 * - Unique category keys (not similar to existing)
 * - Specificity (not too generic)
 */
function calculateNoveltyBonus(
  candidate: CategoryCandidate,
  existingCategories: ExistingCategory[],
): number {
  let bonus = 0;

  // 1. Recency Bonus (0-5 points)
  const daysSinceDiscovery = Math.floor(
    (Date.now() - new Date(candidate.firstDetected).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (daysSinceDiscovery < 7) {
    bonus += 5; // Very recent
  } else if (daysSinceDiscovery < 30) {
    bonus += 3; // Recent
  }

  // 2. Slug Quality (0-5 points)
  const slug = slugify(candidate.candidateName);
  const slugParts = slug.split("-");

  // Multi-word categories are more specific
  if (slugParts.length >= 2 && slugParts.length <= 4) {
    bonus += 3; // Goldilocks zone (e.g., "propagation-kits", "indoor-plant-care")
  }

  // Avoid overly long slugs (likely generic descriptions)
  if (slug.length > 10 && slug.length < 40) {
    bonus += 2; // Good length
  }

  // 3. Uniqueness Score (0-5 points)
  const similarCount = existingCategories.filter((cat) => {
    const similarity = calculateSlugSimilarity(slug, cat.categoryKey);
    return similarity > 0.7; // More than 70% similar
  }).length;

  if (similarCount === 0) {
    bonus += 5; // Completely unique
  } else if (similarCount <= 2) {
    bonus += 2; // Few similar categories
  }

  return bonus;
}

// ============================================================================
// MAIN SCORING
// ============================================================================

/**
 * Score a candidate category for overall potential.
 *
 * Pure function: takes candidate data and existing categories as parameters
 * instead of querying Prisma.
 *
 * @param candidate - Category candidate with keywords and metadata
 * @param existingCategories - List of existing category keys for novelty comparison
 * @returns Full potential score with sub-scores and recommended action
 */
export function scoreCategoryPotential(
  candidate: CategoryCandidate,
  existingCategories: ExistingCategory[] = [],
): PotentialScore {
  const allKeywords = [
    ...(candidate.keywords.primary || []),
    ...(candidate.keywords.secondary || []),
    candidate.candidateName.toLowerCase(),
  ];

  // Calculate sub-scores
  const commercialPotential = calculateCommercialPotential(
    allKeywords,
    candidate.affiliateProgramCount || 0,
  );

  const learningPotential = calculateLearningPotential(
    allKeywords,
    candidate.videoMentionCount || 0,
  );

  const evergreenScore = calculateEvergreenScore(allKeywords);

  // Calculate novelty bonus
  const noveltyBonus = calculateNoveltyBonus(candidate, existingCategories);

  // Overall potential (weighted) with novelty boost
  const baseScore =
    commercialPotential.total * 0.4 +
    learningPotential.total * 0.4 +
    evergreenScore * 0.2;

  // Apply novelty bonus (up to +15 points for unique, well-structured categories)
  const overallPotential = Math.min(baseScore + noveltyBonus, 100);

  // Determine recommended action
  let recommendedAction: "priority" | "promote" | "monitor" | "reject" =
    "monitor";

  if (overallPotential >= 70) {
    recommendedAction = "priority"; // Fast-track promotion
  } else if (overallPotential >= 50) {
    recommendedAction = "promote"; // Standard promotion
  } else if (overallPotential >= 30) {
    recommendedAction = "monitor"; // Watch for growth
  } else {
    recommendedAction = "reject"; // Low potential
  }

  return {
    candidateId: candidate.id,
    candidateName: candidate.candidateName,
    commercialPotential: commercialPotential.total,
    learningPotential: learningPotential.total,
    evergreenScore,
    noveltyBonus,
    affiliateAvailability: commercialPotential.affiliateAvailability,
    pricePointScore: commercialPotential.pricePointScore,
    purchaseIntentScore: commercialPotential.purchaseIntentScore,
    skillProgressionScore: learningPotential.skillProgressionScore,
    contentDepthScore: learningPotential.contentDepthScore,
    beginnerAccessibility: learningPotential.beginnerAccessibility,
    overallPotential,
    recommendedAction,
  };
}

/**
 * Batch score multiple candidates.
 *
 * Returns scores sorted by overall potential (highest first).
 *
 * @param candidates - Array of candidates to score
 * @param existingCategories - Existing category keys for novelty comparison
 * @returns Sorted array of potential scores
 */
export function batchScoreCandidates(
  candidates: CategoryCandidate[],
  existingCategories: ExistingCategory[] = [],
): PotentialScore[] {
  const scores: PotentialScore[] = [];

  for (const candidate of candidates) {
    const score = scoreCategoryPotential(candidate, existingCategories);
    scores.push(score);
  }

  // Sort by overall potential (highest first)
  scores.sort((a, b) => b.overallPotential - a.overallPotential);

  return scores;
}

/**
 * Get top priority candidates for promotion.
 *
 * @param candidates - Array of candidates to score
 * @param existingCategories - Existing category keys for novelty comparison
 * @param limit - Maximum number to return
 * @returns Top priority candidates
 */
export function getTopPriorityCandidates(
  candidates: CategoryCandidate[],
  existingCategories: ExistingCategory[] = [],
  limit: number = 10,
): PotentialScore[] {
  const scores = batchScoreCandidates(candidates, existingCategories);
  return scores
    .filter((s) => s.recommendedAction === "priority")
    .slice(0, limit);
}
