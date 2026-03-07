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

// ============================================================================
// STARTUP / TECH INTENT TAXONOMY
// ============================================================================

/**
 * Startup & technology audience intent taxonomy.
 *
 * Seven archetypes covering the full spectrum of tech/startup viewer motivation:
 * 1. trend_tracking    - Following AI/startup news (high commercial value)
 * 2. skill_building    - Learning tools, frameworks, techniques
 * 3. tool_adoption     - Direct intent to try or buy software/hardware
 * 4. founder_vision    - Strategy, fundraising, company building
 * 5. problem_solving   - Debugging, unblocking, architecture questions
 * 6. community_sharing - Building in public, sharing wins and failures
 * 7. market_thesis     - Open source, decentralization, industry trends
 */
export const STARTUP_INTENT_TAXONOMY: Record<string, AudienceIntent> = {
  trend_tracking: {
    name: "Trend Tracking",
    description: "Viewers following breaking AI/startup news and market moves",
    weight: 0.9,
    examplePhrases: [
      "this week",
      "just announced",
      "just launched",
      "breaking",
      "announced today",
      "latest model",
      "new release",
      "just dropped",
      "right now",
      "this month",
      "just happened",
      "huge news",
    ],
    ctaSuggestions: [
      "Subscribe for weekly AI briefings",
      "Read the full breakdown",
      "Follow for daily updates",
      "Join the newsletter",
      "Watch next week's episode",
    ],
    transactionExamples: [
      "Subscribe to paid newsletter",
      "Buy access to research report",
      "Upgrade to pro tier for deeper analysis",
    ],
    dominantEmotions: ["curiosity", "excitement", "urgency"],
    motivationProfile:
      "User wants to stay ahead of the curve; values speed and signal-to-noise ratio",
  },

  skill_building: {
    name: "Learning & Skill Building",
    description: "Desire to learn tools, frameworks, or startup techniques",
    weight: 0.8,
    examplePhrases: [
      "how to",
      "step by step",
      "tutorial",
      "guide",
      "learn",
      "technique",
      "method",
      "show you how",
      "demonstrate",
      "best practice",
      "from scratch",
      "beginner",
      "advanced",
    ],
    ctaSuggestions: [
      "Watch full tutorial",
      "Start free trial",
      "Enroll in the course",
      "Download the starter template",
      "Access the documentation",
    ],
    transactionExamples: [
      "Purchase online course",
      "Subscribe to learning platform",
      "Buy the book",
      "Join mentorship program",
    ],
    dominantEmotions: ["curiosity", "confidence", "focus"],
    motivationProfile:
      "User is self-improving; responds to structured, expert-led education",
  },

  tool_adoption: {
    name: "Tool Adoption",
    description: "Direct intent to try, buy, or switch to a software tool",
    weight: 1.0,
    examplePhrases: [
      "i use",
      "we use",
      "affiliate link",
      "check the description",
      "link below",
      "try this",
      "recommend",
      "sign up",
      "free trial",
      "start for free",
      "tool review",
      "vs",
      "compared to",
      "switch to",
    ],
    ctaSuggestions: [
      "Start free trial",
      "Book a demo",
      "Try it free",
      "Compare plans",
      "Get started in 5 minutes",
    ],
    transactionExamples: [
      "Subscribe to SaaS tool",
      "Purchase lifetime deal",
      "Upgrade to paid plan",
      "Buy hardware device",
    ],
    dominantEmotions: ["trust", "excitement", "decisiveness"],
    motivationProfile:
      "User is ready to act; needs a frictionless path from intent to trial",
  },

  founder_vision: {
    name: "Founder Vision",
    description: "Startup strategy, fundraising, company building, GTM",
    weight: 0.7,
    examplePhrases: [
      "raise",
      "series a",
      "seed round",
      "investors",
      "pitch",
      "founder",
      "startup",
      "product market fit",
      "go to market",
      "acquire customers",
      "grow",
      "scale",
      "revenue",
      "valuation",
    ],
    ctaSuggestions: [
      "Read the founder playbook",
      "Watch the fundraising episode",
      "Join the founder community",
      "Apply for the accelerator",
      "Download the pitch deck template",
    ],
    transactionExamples: [
      "Join accelerator program",
      "Buy founder course",
      "Hire a fractional advisor",
      "Subscribe to founder newsletter",
    ],
    dominantEmotions: ["ambition", "focus", "determination"],
    motivationProfile:
      "User is building something; responds to practical frameworks and peer validation",
  },

  problem_solving: {
    name: "Problem Solving",
    description: "Debugging, architecture decisions, unblocking technical issues",
    weight: 0.85,
    examplePhrases: [
      "fix",
      "issue",
      "problem",
      "error",
      "not working",
      "broken",
      "why is",
      "how do i",
      "debug",
      "solve",
      "workaround",
      "alternative",
      "instead",
    ],
    ctaSuggestions: [
      "Read the docs",
      "View quick fix",
      "Open a GitHub issue",
      "Get technical support",
      "Join the Discord",
    ],
    transactionExamples: [
      "Purchase support contract",
      "Book technical consultation",
      "Upgrade to plan with support",
    ],
    dominantEmotions: ["frustration", "urgency", "relief"],
    motivationProfile:
      "User is blocked; values fast, concrete solutions over comprehensive education",
  },

  community_sharing: {
    name: "Community & Sharing",
    description: "Building in public, sharing progress, engaging with peers",
    weight: 0.5,
    examplePhrases: [
      "join us",
      "community",
      "comment below",
      "let me know",
      "subscribe",
      "follow",
      "share",
      "together",
      "your experience",
      "what do you think",
      "dm me",
    ],
    ctaSuggestions: [
      "Join the community",
      "Share your build",
      "Subscribe for more",
      "Follow for daily updates",
      "Comment with your experience",
    ],
    transactionExamples: [
      "Join paid community",
      "Buy event ticket",
      "Subscribe to Patreon",
      "Buy branded merch",
    ],
    dominantEmotions: ["belonging", "pride", "enthusiasm"],
    motivationProfile:
      "User values connection and recognition; engagement converts over time",
  },

  market_thesis: {
    name: "Market Thesis",
    description: "Open source, decentralization, AI policy, long-term industry bets",
    weight: 0.75,
    examplePhrases: [
      "open source",
      "open claw",
      "decentralized",
      "regulation",
      "policy",
      "the future of",
      "paradigm shift",
      "disruption",
      "moat",
      "defensible",
      "winner take all",
      "platform risk",
    ],
    ctaSuggestions: [
      "Read the full thesis",
      "Subscribe for market analysis",
      "Download the research report",
      "Follow for investment insights",
      "Join the analyst community",
    ],
    transactionExamples: [
      "Subscribe to research platform",
      "Buy investment newsletter",
      "Join analyst network",
      "Book strategy session",
    ],
    dominantEmotions: ["conviction", "curiosity", "strategic clarity"],
    motivationProfile:
      "User is thinking long-term; responds to rigorous frameworks and contrarian takes",
  },
};

// ============================================================================
// GENERIC INTENT TAXONOMY
// ============================================================================

/**
 * Generic fallback taxonomy for unrecognized verticals.
 * Uses neutral, universal phrases and CTAs that work across domains.
 */
export const GENERIC_INTENT_TAXONOMY: Record<string, AudienceIntent> = {
  learning: {
    name: "Learning & Mastery",
    description: "Viewers seeking to learn something new",
    weight: 0.8,
    examplePhrases: [
      "how to",
      "tutorial",
      "guide",
      "learn",
      "step by step",
      "show you how",
      "demonstration",
      "tips",
      "advice",
      "technique",
    ],
    ctaSuggestions: [
      "Watch full tutorial",
      "Download the guide",
      "Get started free",
      "Access the documentation",
    ],
    transactionExamples: [
      "Purchase course",
      "Subscribe to platform",
      "Buy related book",
    ],
    dominantEmotions: ["curiosity", "confidence"],
    motivationProfile: "User wants to learn; values clarity and expertise",
  },

  purchase_intent: {
    name: "Product Purchase",
    description: "Direct intent to buy or try a product",
    weight: 1.0,
    examplePhrases: [
      "i use",
      "affiliate link",
      "check the description",
      "link below",
      "recommend",
      "try this",
      "buy",
      "order",
      "sign up",
    ],
    ctaSuggestions: [
      "Buy now",
      "Start free trial",
      "Get it here",
      "Shop now",
    ],
    transactionExamples: [
      "Purchase featured product",
      "Subscribe to service",
    ],
    dominantEmotions: ["trust", "excitement"],
    motivationProfile: "User is ready to convert; minimize friction",
  },

  community: {
    name: "Community & Sharing",
    description: "Social engagement and community participation",
    weight: 0.5,
    examplePhrases: [
      "join us",
      "community",
      "subscribe",
      "comment",
      "follow",
      "share",
      "let me know",
      "what do you think",
    ],
    ctaSuggestions: [
      "Subscribe for more",
      "Join the community",
      "Share your experience",
    ],
    transactionExamples: [
      "Join membership",
      "Buy event ticket",
    ],
    dominantEmotions: ["belonging", "enthusiasm"],
    motivationProfile: "User wants connection; engagement leads to conversion over time",
  },
};

// ============================================================================
// VERTICAL TAXONOMY RESOLVER
// ============================================================================

/**
 * Returns the appropriate intent taxonomy for a given vertical ID.
 *
 * Maps detected vertical IDs to the right taxonomy so CTAs and intent
 * labels are relevant to the content domain.
 *
 * @param verticalId - The detected vertical ID (e.g., "gardening", "technology", "startup")
 * @returns The matching intent taxonomy
 */
export function getTaxonomyForVertical(
  verticalId: string,
): Record<string, AudienceIntent> {
  const id = verticalId.toLowerCase();

  // Gardening vertical
  if (id === "gardening" || id === "garden") {
    return GARDENING_INTENT_TAXONOMY;
  }

  // Startup / tech / AI verticals
  if (
    id === "startup" ||
    id === "startups" ||
    id === "technology" ||
    id === "tech" ||
    id === "ai" ||
    id === "saas" ||
    id === "crypto" ||
    id === "cryptocurrency" ||
    id === "software" ||
    id === "developer" ||
    id === "coding" ||
    id === "fintech" ||
    id === "blockchain"
  ) {
    return STARTUP_INTENT_TAXONOMY;
  }

  // Generic fallback
  return GENERIC_INTENT_TAXONOMY;
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
