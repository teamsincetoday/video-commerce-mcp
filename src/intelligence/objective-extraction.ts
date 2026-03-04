/**
 * AI-Powered Objective Extraction
 *
 * Uses GPT-4o-mini to extract learning objectives from teaching sections.
 *
 * Cost Analysis:
 * - GPT-4o-mini: $0.150 per 1M input tokens, $0.600 per 1M output tokens
 * - Avg section: 300 words = ~400 tokens input
 * - Expected output: ~50 tokens (3-5 objectives)
 * - Cost per section: ~$0.0001 (0.01c)
 * - Total for 100 sections: ~$0.01
 *
 * Ported from monolith lib/services/ai-objective-extraction.ts.
 * Standalone: uses OpenAI SDK directly, no Prisma or monolith dependencies.
 */

import OpenAI from "openai";
import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface AIObjectiveResult {
  objectives: string[];
  confidence: number; // 0-1
  reasoning: string;
  tokenUsage: {
    input: number;
    output: number;
    cost: number;
  };
}

export interface ObjectiveExtractionOptions {
  apiKey: string;
  model?: string;
  logger?: Logger;
}

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extract learning objectives using AI.
 *
 * Returns 3-5 specific, actionable learning objectives from a teaching section.
 * Each objective focuses on practical skills, not just knowledge.
 *
 * @param sectionText - Teaching section text
 * @param videoTitle - Video title for context
 * @param keyConcepts - Key concepts extracted from section
 * @param options - API key and optional settings
 * @returns AI-extracted objectives with confidence and cost
 */
export async function extractObjectivesWithAI(
  sectionText: string,
  videoTitle: string,
  keyConcepts: string[],
  options: ObjectiveExtractionOptions,
): Promise<AIObjectiveResult> {
  const logger = options.logger ?? defaultLogger;
  const model = options.model ?? "gpt-4o-mini";

  const openai = new OpenAI({ apiKey: options.apiKey });

  const prompt = `You are analyzing a teaching section from a gardening video titled "${videoTitle}".

Extract 3-5 specific, actionable learning objectives that a viewer will be able to do after watching this section.

Key concepts mentioned: ${keyConcepts.join(", ")}

Section transcript:
${sectionText.substring(0, 1500)}

Requirements:
1. Each objective should be specific and actionable (e.g., "Identify signs of overwatering in tomato plants")
2. Focus on practical skills, not just knowledge (prefer "do X" over "understand X")
3. Use the key concepts if relevant
4. Keep each objective concise (max 10 words)
5. Return ONLY the objectives as a JSON array, nothing else

Example output:
{
  "objectives": [
    "Prune rose bushes to encourage new growth",
    "Identify the optimal time for spring pruning",
    "Select the right pruning tools for different stems"
  ],
  "confidence": 0.9,
  "reasoning": "Clear step-by-step demonstration with visual cues"
}`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at analyzing educational content and extracting learning objectives. Return only valid JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);

    // Validate response structure
    if (!Array.isArray(parsed.objectives)) {
      throw new Error("Invalid response format: objectives must be an array");
    }

    // Calculate cost
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const inputCost = (inputTokens / 1_000_000) * 0.15; // $0.150 per 1M tokens
    const outputCost = (outputTokens / 1_000_000) * 0.6; // $0.600 per 1M tokens
    const totalCost = inputCost + outputCost;

    return {
      objectives: parsed.objectives.slice(0, 5), // Max 5 objectives
      confidence: parsed.confidence || 0.8,
      reasoning: parsed.reasoning || "AI-extracted objectives",
      tokenUsage: {
        input: inputTokens,
        output: outputTokens,
        cost: totalCost,
      },
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    logger.error(
      "AI objective extraction failed",
      error instanceof Error ? error : undefined,
      { message },
    );
    return {
      objectives: [],
      confidence: 0,
      reasoning: `Error: ${message}`,
      tokenUsage: {
        input: 0,
        output: 0,
        cost: 0,
      },
    };
  }
}

/**
 * Batch extract objectives for multiple sections.
 *
 * Processes sections sequentially to avoid rate limits.
 * Includes budget monitoring to prevent cost overruns.
 *
 * @param sections - Array of sections to process
 * @param options - API key and optional settings
 * @param maxBudget - Maximum budget in USD (default: 0.10 for 100 sections)
 * @returns Results for all sections with total cost
 */
export async function batchExtractObjectives(
  sections: Array<{
    id: string;
    text: string;
    videoTitle: string;
    keyConcepts: string[];
  }>,
  options: ObjectiveExtractionOptions,
  maxBudget: number = 0.1,
): Promise<{
  results: Array<AIObjectiveResult & { sectionId: string }>;
  totalCost: number;
  processed: number;
  failed: number;
}> {
  const logger = options.logger ?? defaultLogger;
  const results: Array<AIObjectiveResult & { sectionId: string }> = [];
  let totalCost = 0;
  let processed = 0;
  let failed = 0;

  logger.info("AI Objective Extraction starting", {
    maxBudget,
    sectionCount: sections.length,
  });

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;

    // Check budget before processing
    if (totalCost >= maxBudget) {
      logger.warn("Budget limit reached, stopping extraction", {
        maxBudget,
        totalCost,
      });
      break;
    }

    logger.info("Processing section", {
      index: i + 1,
      total: sections.length,
      sectionId: section.id.substring(0, 20),
    });

    try {
      const result = await extractObjectivesWithAI(
        section.text,
        section.videoTitle,
        section.keyConcepts,
        options,
      );

      totalCost += result.tokenUsage.cost;
      processed++;

      if (result.objectives.length > 0) {
        logger.info("Extracted objectives", {
          count: result.objectives.length,
          cost: result.tokenUsage.cost,
          sampleObjectives: result.objectives.slice(0, 2),
        });
      } else {
        logger.warn("Failed to extract objectives", {
          reasoning: result.reasoning,
        });
        failed++;
      }

      results.push({
        ...result,
        sectionId: section.id,
      });

      // Rate limiting: Wait 100ms between requests
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      logger.error(
        "Section extraction error",
        error instanceof Error ? error : undefined,
        { sectionId: section.id },
      );
      failed++;
      results.push({
        sectionId: section.id,
        objectives: [],
        confidence: 0,
        reasoning: `Error: ${message}`,
        tokenUsage: {
          input: 0,
          output: 0,
          cost: 0,
        },
      });
    }
  }

  logger.info("Batch extraction summary", {
    totalSections: sections.length,
    processed,
    successful: processed - failed,
    successRate:
      processed > 0 ? ((processed - failed) / processed) * 100 : 0,
    failed,
    totalCost,
    avgCostPerSection: processed > 0 ? totalCost / processed : 0,
  });

  return {
    results,
    totalCost,
    processed,
    failed,
  };
}

/**
 * Get top N sections by quality score for AI extraction.
 *
 * Strategy: Focus AI budget on high-quality sections that will be featured.
 *
 * @param sections - All detected sections with quality scores
 * @param topN - Number of top sections to extract (default: 100)
 * @returns Top N sections sorted by quality
 */
export function selectTopSectionsForAI(
  sections: Array<{
    id: string;
    text: string;
    videoTitle: string;
    keyConcepts: string[];
    qualityScore: number;
  }>,
  topN: number = 100,
): Array<{
  id: string;
  text: string;
  videoTitle: string;
  keyConcepts: string[];
}> {
  return sections
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, topN)
    .map((s) => ({
      id: s.id,
      text: s.text,
      videoTitle: s.videoTitle,
      keyConcepts: s.keyConcepts,
    }));
}
