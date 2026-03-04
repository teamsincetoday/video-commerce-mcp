/**
 * AI Composite Evaluator
 *
 * Uses AI to evaluate ambiguous cases where rule-based criteria
 * don't provide clear answers for channel authority scoring.
 *
 * Cost: ~$0.0003 per evaluation
 *
 * Ported from monolith: lib/services/automated-channel-vetting/criteria-evaluators/ai-composite-evaluator.ts
 * Removed: direct OpenAI API call, logger import.
 * Uses AIClient interface for dependency injection.
 */

import type { AIClient, Logger } from "../types.js";
import { defaultLogger } from "../types.js";
import type {
  CriterionResult,
  ChannelForVetting,
  AIEvaluationResponse,
} from "./channel-vetting.js";

// ============================================================================
// TYPES
// ============================================================================

export interface AIEvaluationRequest {
  channelName: string;
  channelDescription?: string;
  videoTitles: string[];
  existingScores: CriterionResult[];
}

// ============================================================================
// PROMPT BUILDER
// ============================================================================

/**
 * Build the prompt for AI evaluation.
 */
export function buildEvaluationPrompt(
  request: AIEvaluationRequest,
): string {
  const existingScoresSummary = request.existingScores
    .map(
      (s) =>
        `- ${s.criterionId}: ${s.score}/100 (confidence: ${(s.confidence * 100).toFixed(0)}%)`,
    )
    .join("\n");

  return `You are evaluating a YouTube gardening channel for inclusion in a curated gardening education platform.

CHANNEL INFORMATION:
- Name: ${request.channelName}
- Description: ${request.channelDescription || "No description available"}
- Sample video titles: ${request.videoTitles.slice(0, 5).join(", ")}

EXISTING CRITERION SCORES:
${existingScoresSummary}

EVALUATION CRITERIA (Vision Alignment Checklist):
1. Published Books - Is this creator a published author of gardening books?
2. Editorial Vetting - Does content show editorial rigor and accuracy?
3. Media Presence - Does creator have TV/significant media presence?
4. Professional Credentials - Does creator have RHS, Master Gardener, or relevant degrees?
5. Institutional Affiliation - Is creator affiliated with universities, botanical gardens, etc.?
6. Ethical Alignment - Does content promote sustainable, organic, native-plant practices?
7. Production Quality - Is video production professional quality?

TASK:
Analyze this channel holistically and provide:
1. An overall assessment of the channel's authority and trustworthiness
2. A suggested composite score (0-100)
3. Your confidence level (0-1)
4. Whether human review is recommended
5. Any adjustments to the existing criterion scores

Respond in JSON format:
{
  "overallAssessment": "Brief assessment of channel",
  "suggestedScore": 75,
  "confidence": 0.8,
  "reasoning": "Explain your reasoning",
  "recommendsHumanReview": false,
  "humanReviewReason": "Only if recommends review",
  "criterionAdjustments": [
    {"criterionId": "published_books", "adjustment": 10, "reason": "Found evidence in description"}
  ]
}`;
}

// ============================================================================
// EVALUATION
// ============================================================================

/**
 * Run AI composite evaluation on a channel.
 * Returns null if AI call fails or is not needed.
 */
export async function evaluateWithAI(
  channel: ChannelForVetting,
  existingScores: CriterionResult[],
  aiClient: AIClient,
  videoTitles: string[] = [],
  logger: Logger = defaultLogger,
): Promise<AIEvaluationResponse | null> {
  const request: AIEvaluationRequest = {
    channelName: channel.channelName,
    channelDescription: channel.description ?? undefined,
    videoTitles,
    existingScores,
  };

  const prompt = buildEvaluationPrompt(request);

  try {
    const response = await aiClient.complete({
      systemPrompt:
        "You are an expert gardening content evaluator. Respond only in valid JSON format.",
      userPrompt: prompt,
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 500,
    });

    const result = JSON.parse(response.content);
    return result as AIEvaluationResponse;
  } catch (error) {
    logger.error(
      "AI composite evaluation failed",
      error instanceof Error ? error : undefined,
      { channelName: channel.channelName },
    );
    return null;
  }
}

/**
 * Create an AI evaluator function suitable for passing to evaluateChannel.
 * Wraps the evaluateWithAI function into the expected interface.
 */
export function createAIEvaluator(
  aiClient: AIClient,
  videoTitles: string[] = [],
  logger: Logger = defaultLogger,
): (
  channel: ChannelForVetting,
  criteriaResults: CriterionResult[],
) => Promise<AIEvaluationResponse | null> {
  return (channel, criteriaResults) =>
    evaluateWithAI(channel, criteriaResults, aiClient, videoTitles, logger);
}
