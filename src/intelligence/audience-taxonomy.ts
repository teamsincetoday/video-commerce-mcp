/**
 * Audience Intent Taxonomy
 *
 * High-intent keyword analysis for gardening vertical with ecommerce CTAs and emotional tone.
 *
 * Enables fine-grained understanding of viewer behavior and motivation to:
 * - Detect specific consumer intents (seasonal action, learning, purchase, etc.)
 * - Suggest contextual CTAs (calls-to-action)
 * - Understand emotional engagement (motivation, urgency, aspiration)
 * - Prioritize segments based on commercial and engagement value
 *
 * Pure functions, zero external dependencies. All 7 intent archetypes preserved.
 *
 * Ported from monolith lib/services/audience-taxonomy.ts.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AudienceIntent {
  name: string;
  description: string;
  weight: number; // 0-1, higher = stronger commercial/engagement value
  examplePhrases: string[];
  ctaSuggestions: string[];
  transactionExamples: string[];
  dominantEmotions: string[];
  motivationProfile: string;
}

export interface IntentDetectionResult {
  intent: string;
  score: number; // 0-1, confidence of intent match
  timestamp: string;
  segment: string;
  matchedPhrases: string[];
  dominantEmotion?: string;
  recommendedCTA?: string;
  commercialValue: number; // 0-1, likelihood of conversion
}

export interface TranscriptIntentAnalysis {
  detections: IntentDetectionResult[];
  summary: {
    intentDistribution: Record<string, { count: number; totalScore: number; avgScore: number }>;
    topIntent: string;
    totalCommercialValue: number;
    avgCommercialValue: number;
    emotionDistribution: Record<string, number>;
  };
}

// ============================================================================
// 7 INTENT ARCHETYPES
// ============================================================================

/**
 * Gardening audience intent taxonomy v2.0
 *
 * Seven archetypes covering the full spectrum of gardening viewer motivation:
 * 1. seasonal_action - Time-sensitive tasks (highest commercial value)
 * 2. learning_mastery - Skill development and technique learning
 * 3. product_purchase - Direct purchase intent
 * 4. aspirational_lifestyle - Design, aesthetics, and lifestyle
 * 5. problem_solving - Pest, disease, and issue resolution
 * 6. community_sharing - Social and community engagement
 * 7. eco_regenerative - Sustainability and eco-friendly practices
 */
export const GARDENING_INTENT_TAXONOMY: Record<string, AudienceIntent> = {
  seasonal_action: {
    name: "Seasonal Action",
    description:
      "Viewers looking for what to do now in their garden; time-sensitive gardening tasks",
    weight: 0.9,
    examplePhrases: [
      "this week in the garden",
      "now's the time to",
      "jobs for the weekend",
      "before the frost",
      "get your beds ready",
      "harvest",
      "sow",
      "plant",
      "prune",
      "cut back",
      "prepare for winter",
      "prepare for spring",
      "seasonal tasks",
      "right now",
      "this month",
    ],
    ctaSuggestions: [
      "Shop tools & supplies for this week's garden jobs",
      "Add seasonal plants or bulbs to cart",
      "Download printable garden calendar",
      "Set a reminder for next week's garden tasks",
      "View this month's essential supplies",
    ],
    transactionExamples: [
      "Purchase gloves, compost, seed trays",
      "Subscribe to monthly planting box",
      "Pre-order spring bulbs",
      "Book a gardening workshop",
    ],
    dominantEmotions: ["motivation", "anticipation", "curiosity"],
    motivationProfile:
      "User feels empowered and ready to act; seeks timely guidance and efficiency",
  },

  learning_mastery: {
    name: "Learning & Mastery",
    description:
      "Desire to learn techniques, deepen skills, or master specific garden methods",
    weight: 0.8,
    examplePhrases: [
      "how to",
      "step by step",
      "tips for beginners",
      "avoid this mistake",
      "expert advice",
      "propagate",
      "training guide",
      "the right way",
      "technique",
      "method",
      "tutorial",
      "demonstration",
      "show you how",
      "learn",
      "master",
    ],
    ctaSuggestions: [
      "Watch full tutorial video",
      "Enroll in detailed online workshop",
      "Download PDF guide",
      "Buy the recommended starter kit",
      "Access premium gardening course",
    ],
    transactionExamples: [
      "Purchase propagation kits",
      "Pay for expert-led webinar",
      "Subscribe to premium tutorials",
      "Buy featured books or tools",
    ],
    dominantEmotions: ["curiosity", "confidence", "focus"],
    motivationProfile:
      "User is self-improving and values trusted expertise; responds to structured education",
  },

  product_purchase: {
    name: "Product Purchase",
    description:
      "Direct commercial intent; viewer wants to buy plants, tools, or related materials",
    weight: 1.0,
    examplePhrases: [
      "buy online",
      "our favourite variety",
      "best compost",
      "tool review",
      "for sale",
      "delivery",
      "order now",
      "available at",
      "affiliate link",
      "check the description",
      "in stock",
      "recommended product",
      "using this",
      "i use",
      "link below",
    ],
    ctaSuggestions: [
      "Buy now",
      "Compare prices",
      "Add to basket",
      "See related items",
      "Shop the featured products",
      "Check current availability",
    ],
    transactionExamples: [
      "Purchase plants or seeds featured in video",
      "Add reviewed products to cart",
      "Subscribe to seasonal delivery box",
      "Book ticket to gardening show or fair",
    ],
    dominantEmotions: ["trust", "excitement", "satisfaction"],
    motivationProfile:
      "User is ready to convert; seeks assurance of quality and ease of purchase",
  },

  aspirational_lifestyle: {
    name: "Aspirational Lifestyle",
    description:
      "Emotion-driven engagement inspired by aesthetics, tranquility, or design ideals",
    weight: 0.6,
    examplePhrases: [
      "peaceful corner",
      "create a calm space",
      "design inspiration",
      "beautiful border",
      "wildlife friendly",
      "garden style",
      "stunning",
      "gorgeous",
      "dream garden",
      "transformation",
      "makeover",
      "before and after",
      "colour scheme",
      "aesthetic",
    ],
    ctaSuggestions: [
      "Explore curated garden looks",
      "Shop featured plant collections",
      "Save your dream garden to wishlist",
      "Share your garden inspiration",
      "Get personalized design ideas",
    ],
    transactionExamples: [
      "Buy matching plant bundles",
      "Purchase decorative garden accessories",
      "Book landscape design consultation",
      "Sign up for inspiration newsletter",
    ],
    dominantEmotions: ["admiration", "pride", "serenity"],
    motivationProfile:
      "User is emotionally engaged and aspires to beauty; converts via visual appeal and lifestyle resonance",
  },

  problem_solving: {
    name: "Problem Solving",
    description:
      "User seeks immediate solutions to plant health or pest issues",
    weight: 0.85,
    examplePhrases: [
      "if your leaves turn yellow",
      "to stop slugs",
      "why is my",
      "disease",
      "mould",
      "not flowering",
      "fix",
      "problem",
      "issue",
      "dying",
      "struggling",
      "rescue",
      "save",
      "treat",
      "prevent",
      "pests",
      "aphids",
    ],
    ctaSuggestions: [
      "View quick fixes",
      "Shop pest-control products",
      "Book expert chat",
      "Read troubleshooting guide",
      "Get instant diagnosis",
    ],
    transactionExamples: [
      "Buy organic slug deterrent",
      "Order fertiliser or pest traps",
      "Book online consultation",
      "Purchase problem-specific kits",
    ],
    dominantEmotions: ["frustration", "urgency", "relief"],
    motivationProfile:
      "User is stressed but solutions-oriented; responds well to fast, practical CTAs",
  },

  community_sharing: {
    name: "Community & Sharing",
    description:
      "Social intent: viewers want to participate, show their gardens, or connect with others",
    weight: 0.5,
    examplePhrases: [
      "share your garden",
      "send us your photos",
      "join us",
      "community",
      "showcase",
      "competition",
      "visit us next weekend",
      "comment below",
      "let me know",
      "subscribe",
      "follow along",
      "show me",
      "your experience",
      "together",
    ],
    ctaSuggestions: [
      "Upload your garden video",
      "Join our gardener community",
      "Enter photo competition",
      "Comment and share tips",
      "Connect with fellow gardeners",
    ],
    transactionExamples: [
      "Join membership program",
      "Donate to community garden fund",
      "Buy event ticket",
      "Purchase branded merchandise",
    ],
    dominantEmotions: ["belonging", "pride", "enthusiasm"],
    motivationProfile:
      "User enjoys recognition and participation; engagement more important than purchase",
  },

  eco_regenerative: {
    name: "Eco & Regenerative",
    description:
      "Interest in sustainability and regenerative gardening practices",
    weight: 0.75,
    examplePhrases: [
      "peat free",
      "no dig",
      "organic",
      "pollinator friendly",
      "native species",
      "rainwater harvesting",
      "sustainable",
      "eco friendly",
      "biodiversity",
      "wildlife garden",
      "chemical free",
      "natural",
      "permaculture",
      "compost",
      "reduce waste",
    ],
    ctaSuggestions: [
      "Shop eco-friendly products",
      "Join sustainable gardening course",
      "Learn more about no-dig gardening",
      "Support local growers",
      "Discover peat-free alternatives",
    ],
    transactionExamples: [
      "Buy compostable pots or peat-free compost",
      "Subscribe to eco product box",
      "Donate to biodiversity projects",
      "Book sustainable gardening workshop",
    ],
    dominantEmotions: ["hope", "responsibility", "pride"],
    motivationProfile:
      "Ethically motivated; prefers authenticity, transparency, and low-impact solutions",
  },
};

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect intents in a transcript segment.
 *
 * Matches segment text against all intent archetypes' phrase patterns,
 * calculates score based on match count, density, and intent weight.
 *
 * @param segment - The transcript segment text to analyze
 * @param timestamp - Timestamp of the segment
 * @param taxonomy - Intent taxonomy to match against (defaults to gardening)
 * @returns Sorted array of detected intents, highest commercial value first
 */
export function detectIntentInSegment(
  segment: string,
  timestamp: string,
  taxonomy: Record<string, AudienceIntent> = GARDENING_INTENT_TAXONOMY,
): IntentDetectionResult[] {
  const results: IntentDetectionResult[] = [];
  const segmentLower = segment.toLowerCase();

  for (const [_intentId, intent] of Object.entries(taxonomy)) {
    const matchedPhrases: string[] = [];
    let matchCount = 0;

    // Check for phrase matches
    for (const phrase of intent.examplePhrases) {
      const phraseLower = phrase.toLowerCase();

      if (segmentLower.includes(phraseLower)) {
        matchedPhrases.push(phrase);
        matchCount++;
      }
    }

    if (matchCount > 0) {
      // Calculate score based on:
      // 1. Number of matched phrases
      // 2. Intent weight (commercial value)
      // 3. Match density (matches per 100 words)
      const wordCount = segment.split(/\s+/).length;
      const matchDensity = Math.min(matchCount / (wordCount / 100), 1.0);
      const score = Math.min(
        matchCount * 0.3 + matchDensity * 0.4 + intent.weight * 0.3,
        1.0,
      );

      // Select recommended CTA (first suggestion)
      const recommendedCTA = intent.ctaSuggestions[0];

      // Select dominant emotion
      const dominantEmotion = intent.dominantEmotions[0];

      // Commercial value = intent weight * score
      const commercialValue = intent.weight * score;

      results.push({
        intent: intent.name,
        score,
        timestamp,
        segment,
        matchedPhrases,
        dominantEmotion,
        recommendedCTA,
        commercialValue,
      });
    }
  }

  // Sort by commercial value (highest first)
  results.sort((a, b) => b.commercialValue - a.commercialValue);

  return results;
}

/**
 * Analyze intent across entire transcript.
 *
 * Processes all segments and produces a summary with:
 * - Per-intent distribution (count, scores, averages)
 * - Top intent by total score
 * - Total and average commercial value
 * - Emotion distribution across all detections
 *
 * @param segments - Array of transcript segments with timestamps
 * @param taxonomy - Intent taxonomy to use (defaults to gardening)
 * @returns Detections array and summary statistics
 */
export function analyzeTranscriptIntent(
  segments: Array<{ timestamp: string; text: string }>,
  taxonomy: Record<string, AudienceIntent> = GARDENING_INTENT_TAXONOMY,
): TranscriptIntentAnalysis {
  const detections: IntentDetectionResult[] = [];

  // Detect intents in each segment
  for (const segment of segments) {
    const segmentDetections = detectIntentInSegment(
      segment.text,
      segment.timestamp,
      taxonomy,
    );
    detections.push(...segmentDetections);
  }

  // Calculate summary statistics
  const intentDistribution: Record<
    string,
    { count: number; totalScore: number; avgScore: number }
  > = {};
  const emotionCounts: Record<string, number> = {};
  let totalCommercialValue = 0;

  for (const detection of detections) {
    // Intent distribution
    if (!intentDistribution[detection.intent]) {
      intentDistribution[detection.intent] = {
        count: 0,
        totalScore: 0,
        avgScore: 0,
      };
    }
    intentDistribution[detection.intent]!.count++;
    intentDistribution[detection.intent]!.totalScore += detection.score;

    // Emotion distribution
    if (detection.dominantEmotion) {
      emotionCounts[detection.dominantEmotion] =
        (emotionCounts[detection.dominantEmotion] || 0) + 1;
    }

    // Commercial value
    totalCommercialValue += detection.commercialValue;
  }

  // Calculate averages
  for (const intent in intentDistribution) {
    const dist = intentDistribution[intent]!;
    dist.avgScore = dist.totalScore / dist.count;
  }

  // Find top intent (highest total score)
  let topIntent = "";
  let maxScore = 0;
  for (const [intent, dist] of Object.entries(intentDistribution)) {
    if (dist.totalScore > maxScore) {
      maxScore = dist.totalScore;
      topIntent = intent;
    }
  }

  const avgCommercialValue =
    detections.length > 0 ? totalCommercialValue / detections.length : 0;

  return {
    detections,
    summary: {
      intentDistribution,
      topIntent,
      totalCommercialValue,
      avgCommercialValue,
      emotionDistribution: emotionCounts,
    },
  };
}

/**
 * Get high-value segments for CTA placement.
 * Returns segments with highest commercial value.
 *
 * @param detections - All intent detections
 * @param limit - Maximum number of segments to return
 * @returns Top segments sorted by commercial value
 */
export function getHighValueSegments(
  detections: IntentDetectionResult[],
  limit: number = 5,
): IntentDetectionResult[] {
  return [...detections]
    .sort((a, b) => b.commercialValue - a.commercialValue)
    .slice(0, limit);
}

/**
 * Export intent analysis as structured JSON string.
 *
 * @param analysis - The full transcript intent analysis
 * @param videoId - Video identifier
 * @returns JSON string with analysis data
 */
export function exportIntentAnalysis(
  analysis: TranscriptIntentAnalysis,
  videoId: string,
): string {
  return JSON.stringify(
    {
      videoId,
      timestamp: new Date().toISOString(),
      summary: analysis.summary,
      highValueSegments: getHighValueSegments(analysis.detections, 10),
      allDetections: analysis.detections,
    },
    null,
    2,
  );
}
