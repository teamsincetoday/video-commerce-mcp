/**
 * Vertical Detector — auto-classify content domain from transcript.
 *
 * Uses two-pass detection:
 * 1. Fast keyword matching against registered vertical keywords (free).
 * 2. OpenAI classification if keyword score is insufficient.
 *
 * Returns a VerticalDetectionResult used by the pipeline to select
 * or build an appropriate VerticalConfig.
 */

import type OpenAI from "openai";
import type { Logger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Suggested partial vertical config returned by LLM-based detection.
 * Used as input to buildRuntimeVertical() in verticals/index.ts.
 */
export interface SuggestedVerticalConfig {
  displayName?: string;
  primaryEntityType?: string;
  primaryEntityTypePlural?: string;
  inclusionKeywords?: string[];
  commerceCategories?: Array<{
    id: string;
    displayName: string;
    keywords: string[];
  }>;
}

/**
 * Result of vertical detection for a transcript.
 */
export interface VerticalDetectionResult {
  /**
   * ID of the matched registered vertical, or "unknown" if no match.
   * "unknown" does not mean failure — it triggers runtime vertical building.
   */
  verticalId: string;

  /**
   * Confidence score (0-1). Values > 0.3 with a detectedCategory trigger
   * buildRuntimeVertical(). Values <= 0.3 fall back to generic.
   */
  confidence: number;

  /**
   * Human-readable category detected (e.g., "cooking", "fitness", "technology").
   * "unknown" if detection failed entirely.
   */
  detectedCategory: string;

  /**
   * Partial vertical config suggested by the LLM, if used.
   * Used to build a runtime vertical when verticalId is "unknown".
   */
  suggestedConfig: SuggestedVerticalConfig;
}

// ============================================================================
// KEYWORD MATCHING (fast, free)
// ============================================================================

/**
 * Score a transcript against a set of vertical keywords.
 * Returns a normalized match density (0-1).
 */
function scoreKeywordMatch(
  transcriptLower: string,
  keywords: string[],
): number {
  if (keywords.length === 0) return 0;
  const matched = keywords.filter((kw) => transcriptLower.includes(kw.toLowerCase()));
  return matched.length / keywords.length;
}

// ============================================================================
// OPENAI CLASSIFICATION
// ============================================================================

const DETECTION_SYSTEM =
  "You are a content domain classifier. Given a transcript excerpt, " +
  "identify the primary content domain and suggest a minimal vertical configuration.";

const DETECTION_PROMPT = (excerpt: string, knownVerticals: string[]) =>
  `Classify the content domain of this transcript excerpt.

Known verticals: ${knownVerticals.length > 0 ? knownVerticals.join(", ") : "none registered"}

TRANSCRIPT EXCERPT (first 2000 chars):
${excerpt}

Respond with a JSON object:
{
  "category": "string — primary domain (e.g. cooking, fitness, technology, gaming, beauty, finance, travel, automotive, or 'unknown')",
  "confidence": 0.0-1.0,
  "matchedVertical": "string — one of the known verticals if it clearly matches, else 'unknown'",
  "primaryEntityType": "string — what is extracted (e.g. recipe, supplement, gadget, game)",
  "primaryEntityTypePlural": "string — plural form",
  "inclusionKeywords": ["array of 5-10 domain keywords for transcript filtering"],
  "displayName": "string — human-readable vertical name"
}`;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Detect the content vertical from a transcript.
 *
 * @param transcriptText - Full transcript text.
 * @param openaiClient - OpenAI client for LLM classification.
 * @param registeredKeywords - Map of verticalId → keywords from registered verticals.
 * @param logger - Logger for debug output.
 * @returns VerticalDetectionResult
 */
export async function detectVertical(
  transcriptText: string,
  openaiClient: OpenAI,
  registeredKeywords: Map<string, string[]>,
  logger: Logger,
): Promise<VerticalDetectionResult> {
  const transcriptLower = transcriptText.toLowerCase();

  // --- Pass 1: Fast keyword matching ---
  let bestVerticalId = "unknown";
  let bestScore = 0;

  for (const [verticalId, keywords] of registeredKeywords.entries()) {
    const score = scoreKeywordMatch(transcriptLower, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestVerticalId = verticalId;
    }
  }

  // Threshold: >15% keyword density = confident match for registered vertical
  if (bestScore > 0.15 && bestVerticalId !== "unknown") {
    logger.info("Vertical detected via keyword matching", {
      verticalId: bestVerticalId,
      score: bestScore,
    });

    return {
      verticalId: bestVerticalId,
      confidence: Math.min(bestScore * 3, 0.95), // normalize to 0-0.95
      detectedCategory: bestVerticalId,
      suggestedConfig: {},
    };
  }

  // --- Pass 2: LLM classification ---
  try {
    const excerpt = transcriptText.slice(0, 2000);
    const knownVerticals = Array.from(registeredKeywords.keys()).filter(
      (id) => id !== "generic",
    );

    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 300,
      messages: [
        { role: "system", content: DETECTION_SYSTEM },
        { role: "user", content: DETECTION_PROMPT(excerpt, knownVerticals) },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";

    // Parse JSON response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("Vertical detection: no JSON in LLM response");
      return unknownResult();
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      category?: string;
      confidence?: number;
      matchedVertical?: string;
      primaryEntityType?: string;
      primaryEntityTypePlural?: string;
      inclusionKeywords?: string[];
      displayName?: string;
    };

    const verticalId =
      parsed.matchedVertical && parsed.matchedVertical !== "unknown"
        ? parsed.matchedVertical
        : "unknown";

    const category = parsed.category ?? "unknown";
    const confidence = parsed.confidence ?? 0;

    logger.info("Vertical detected via LLM", {
      verticalId,
      category,
      confidence,
    });

    return {
      verticalId,
      confidence,
      detectedCategory: category,
      suggestedConfig: {
        displayName: parsed.displayName,
        primaryEntityType: parsed.primaryEntityType,
        primaryEntityTypePlural: parsed.primaryEntityTypePlural,
        inclusionKeywords: parsed.inclusionKeywords ?? [],
        commerceCategories:
          parsed.primaryEntityType
            ? [
                {
                  id: "PRIMARY",
                  displayName: parsed.displayName ?? "Products",
                  keywords: parsed.inclusionKeywords ?? [],
                },
              ]
            : undefined,
      },
    };
  } catch (err) {
    logger.warn("Vertical detection LLM call failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return unknownResult();
  }
}

function unknownResult(): VerticalDetectionResult {
  return {
    verticalId: "unknown",
    confidence: 0,
    detectedCategory: "unknown",
    suggestedConfig: {},
  };
}
