/**
 * Editorial Quality Assessment Service
 *
 * Scores videos on 6 editorial quality dimensions (0-100 each):
 * 1. Visual Quality - Clean, calm thumbnails (not clickbait)
 * 2. Content Depth - Substantive content (not superficial)
 * 3. Seasonal Relevance - Timely and seasonal
 * 4. Design Context - Shows design thinking (not just plants)
 * 5. Narrative Structure - Has a story arc
 * 6. Botanical Literacy - Uses proper names and context
 *
 * Scoring Tiers:
 * - FEATURED (70+): Homepage features, high editorial quality
 * - SUPPORTING (60-69): Catalog pages, good quality
 * - ARCHIVE (<60): Lower visibility, below editorial standards
 *
 * Ported from monolith lib/services/editorial-quality-assessment.ts.
 * Standalone: uses OpenAI SDK directly, no Prisma or monolith dependencies.
 * The database-save functions and optimized version are intentionally omitted;
 * the MCP consumer handles persistence and optimization.
 */

import OpenAI from "openai";
import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface EditorialQualityScore {
  /** Individual Scores (0-100) */
  visualQuality: number;
  contentDepth: number;
  seasonalRelevance: number;
  designContext: number;
  narrativeStructure: number;
  botanicalLiteracy: number;

  /** Overall Assessment */
  overallScore: number; // 0-100 average of all scores
  editorialNotes: string[]; // Why it passed/failed
  recommendedSections: string[]; // Where to feature it

  /** Editorial Classification */
  editorialTier: "FEATURED" | "SUPPORTING" | "ARCHIVE";
  standfirst?: string; // Auto-generated standfirst
  designInsights?: string; // Key design insights
}

export interface VideoAssessmentInput {
  title: string;
  description?: string;
  transcript?: string;
  channelName?: string;
  thumbnail?: string;
  entities?: Array<{
    commonName: string;
    latinName: string;
  }>;
}

export interface EditorialAssessmentOptions {
  apiKey: string;
  model?: string;
  logger?: Logger;
}

// ============================================================================
// EDITORIAL PROMPT (inlined -- the monolith imports from editorial-ai-prompts)
// ============================================================================

function buildEditorialPrompt(input: VideoAssessmentInput): string {
  const plants = input.entities
    ? input.entities.map((e) => `${e.commonName} (${e.latinName})`).join(", ")
    : "Not yet extracted";

  const transcriptExcerpt = input.transcript
    ? input.transcript.substring(0, 2000)
    : input.description?.substring(0, 500) || "";

  return `Evaluate this video for inclusion in a premium gardening magazine.

VIDEO TITLE: ${input.title}
CHANNEL: ${input.channelName || "Unknown"}
DESCRIPTION: ${input.description || "No description"}
THUMBNAIL: ${input.thumbnail || "Not available"}
PLANTS MENTIONED: ${plants}

TRANSCRIPT EXCERPT:
${transcriptExcerpt}

Score each dimension 0-100:

1. VISUAL QUALITY: Is the thumbnail and production clean, calm, editorial? (Not clickbait, ALL CAPS, or sensationalist)
2. CONTENT DEPTH: Does the video provide substantive, in-depth knowledge? (Not superficial "top 10" lists)
3. SEASONAL RELEVANCE: Is the content timely and seasonally appropriate?
4. DESIGN CONTEXT: Does it show garden design thinking, not just isolated plant care?
5. NARRATIVE STRUCTURE: Does it have a story arc or editorial flow?
6. BOTANICAL LITERACY: Does the presenter use proper plant names and demonstrate botanical knowledge?

Also provide:
- overallScore: weighted average of all dimensions
- editorialNotes: array of 2-3 key editorial observations
- recommendedSections: array of sections where this could be featured (e.g., "Homepage Featured", "Seasonal Highlights", "Garden Style Guides")
- standfirst: A single-sentence magazine-quality standfirst
- designInsights: Key design insights from the video (if any)

Return as JSON:
{
  "visualQuality": number,
  "contentDepth": number,
  "seasonalRelevance": number,
  "designContext": number,
  "narrativeStructure": number,
  "botanicalLiteracy": number,
  "overallScore": number,
  "editorialNotes": ["string"],
  "recommendedSections": ["string"],
  "standfirst": "string",
  "designInsights": "string"
}`;
}

// ============================================================================
// SCORING HELPERS
// ============================================================================

/**
 * Calculate overall score from individual dimensions.
 */
function calculateOverallScore(assessment: Record<string, unknown>): number {
  const scores = [
    (assessment.visualQuality as number) || 50,
    (assessment.contentDepth as number) || 50,
    (assessment.seasonalRelevance as number) || 50,
    (assessment.designContext as number) || 50,
    (assessment.narrativeStructure as number) || 50,
    (assessment.botanicalLiteracy as number) || 50,
  ];

  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return Math.round(avg);
}

/**
 * Determine editorial tier based on overall score.
 */
export function determineEditorialTier(
  score: number,
): "FEATURED" | "SUPPORTING" | "ARCHIVE" {
  if (score >= 70) return "FEATURED";
  if (score >= 60) return "SUPPORTING";
  return "ARCHIVE";
}

/**
 * Get default scores when AI budget exceeded or error occurs.
 */
export function getDefaultScores(): EditorialQualityScore {
  return {
    visualQuality: 50,
    contentDepth: 50,
    seasonalRelevance: 50,
    designContext: 50,
    narrativeStructure: 50,
    botanicalLiteracy: 50,
    overallScore: 50,
    editorialNotes: [
      "Default score - AI budget exceeded or processing error",
    ],
    recommendedSections: [],
    editorialTier: "SUPPORTING",
  };
}

// ============================================================================
// ASSESSMENT
// ============================================================================

/**
 * Assess video editorial quality using AI.
 *
 * Scores the video on 6 dimensions and classifies into tiers.
 * Falls back to default scores if AI call fails.
 *
 * @param input - Video metadata and content
 * @param options - API key and optional settings
 * @returns Editorial quality score with tier classification
 */
export async function assessEditorialQuality(
  input: VideoAssessmentInput,
  options: EditorialAssessmentOptions,
): Promise<EditorialQualityScore> {
  const logger = options.logger ?? defaultLogger;
  const model = options.model ?? "gpt-4o-mini";

  const openai = new OpenAI({ apiKey: options.apiKey });

  const prompt = buildEditorialPrompt(input);

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an editorial quality assessor for a premium gardening magazine. Evaluate content against Gardens Illustrated standards: warm, knowledgeable, design-focused, seasonally aware. Output JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message.content || "{}";
    const assessment = JSON.parse(responseText);

    // Validate and structure response
    const qualityScore: EditorialQualityScore = {
      visualQuality: Math.min(
        100,
        Math.max(0, assessment.visualQuality || 50),
      ),
      contentDepth: Math.min(
        100,
        Math.max(0, assessment.contentDepth || 50),
      ),
      seasonalRelevance: Math.min(
        100,
        Math.max(0, assessment.seasonalRelevance || 50),
      ),
      designContext: Math.min(
        100,
        Math.max(0, assessment.designContext || 50),
      ),
      narrativeStructure: Math.min(
        100,
        Math.max(0, assessment.narrativeStructure || 50),
      ),
      botanicalLiteracy: Math.min(
        100,
        Math.max(0, assessment.botanicalLiteracy || 50),
      ),
      overallScore:
        assessment.overallScore || calculateOverallScore(assessment),
      editorialNotes: Array.isArray(assessment.editorialNotes)
        ? assessment.editorialNotes
        : [],
      recommendedSections: Array.isArray(assessment.recommendedSections)
        ? assessment.recommendedSections
        : [],
      editorialTier: determineEditorialTier(assessment.overallScore),
      standfirst: assessment.standfirst,
      designInsights: assessment.designInsights,
    };

    return qualityScore;
  } catch (error) {
    logger.error(
      "Assessment failed",
      error instanceof Error ? error : undefined,
    );
    return getDefaultScores();
  }
}
