/**
 * NER Prompt Evolution System
 *
 * Manages prompt versioning, A/B testing, and auto-tuning based on performance.
 * Integrates with 4D Learning System for hierarchical complexity analysis.
 *
 * Ported from monolith lib/services/ner-prompt-evolution.ts.
 * Standalone: no Prisma, no monolith dependencies.
 * Prompt versions and metrics are passed in as data rather than queried from DB.
 *
 * Usage:
 * ```typescript
 * import { getActivePromptVersion, getDefaultPrompt } from 'video-commerce-mcp';
 *
 * // Simple: use default prompt
 * const prompt = getDefaultPrompt();
 *
 * // A/B testing: supply active versions
 * const prompt = getActivePromptVersion([
 *   { version: 'v1.0', trafficPercentage: 80, ... },
 *   { version: 'v1.1-experiment', trafficPercentage: 20, ... },
 * ]);
 * ```
 */

import OpenAI from "openai";
import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface PromptConfig {
  version: string;
  promptTemplate: string;
  systemMessage: string;
  temperature: number;
  maxTokens: number;
  modelName: string;
  focusAreas: string[];
}

/** A prompt version record (replaces Prisma NERPromptVersion model). */
export interface PromptVersionRecord {
  id?: string;
  version: string;
  promptTemplate: string;
  systemMessage: string;
  temperature: number;
  maxTokens: number;
  modelName: string;
  focusAreas: string[]; // Already parsed, not JSON string
  trafficPercentage: number;
  isActive: boolean;
  changeDescription?: string;

  // Performance metrics (populated from metrics aggregation)
  genusOnlyRate?: number;
  correctionRate?: number;
  avgConfidence?: number;
  weakPatterns?: string[];
  strongPatterns?: string[];
}

/** Metrics for a single day/period. */
export interface PromptMetric {
  date: Date;
  entitiesExtracted: number;
  genusOnlyEntities: number;
  correctionsMade: number;
  avgConfidence: number;
}

/** An entity correction record for learning. */
export interface EntityCorrection {
  detectedText: string;
  correctedLatinName: string;
  correctionReason: string;
  videoTitle?: string;
}

/** Result of comparing two prompt versions. */
export interface PromptComparisonResult {
  versionA: { version: string } & PromptStats;
  versionB: { version: string } & PromptStats;
  winner: "A" | "B" | "tie";
  recommendation: string;
}

export interface PromptStats {
  totalEntities: number;
  genusOnlyRate: number;
  correctionRate: number;
  avgConfidence: number;
  qualityScore: number;
}

/** Results from the auto-tune analysis. */
export interface AutoTuneResult {
  version: string;
  weaknesses: string[];
  strengths: string[];
  genusOnlyRate: number;
  correctionRate: number;
  avgConfidence: number;
}

/** Suggestion from GPT for prompt improvement. */
export interface PromptImprovementSuggestion {
  newVersion: string;
  updatedPrompt: string;
  expectedImpact: string;
  improvements: Array<{
    weakness: string;
    suggestion: string;
    priority: string;
  }>;
}

// ============================================================================
// DEFAULT PROMPT
// ============================================================================

/**
 * Default prompt with genus-specificity improvements.
 * This is the battle-tested baseline prompt.
 *
 * CRITICAL: This prompt template is core IP. Every instruction matters.
 */
export function getDefaultPrompt(): PromptConfig {
  return {
    version: "v1.0-default",
    promptTemplate: `You are a botanical expert AI analyzing a PRE-FILTERED gardening video transcript.

**CRITICAL RULES:**
1. ALWAYS provide FULL species names (e.g., "Brassica oleracea" NOT just "Brassica")
2. If species is unclear, use video context (title/description) to infer the specific species
3. For common vegetables, use standard botanical names:
   - Kale = Brassica oleracea var. sabellica
   - Cabbage = Brassica oleracea var. capitata
   - Broccoli = Brassica oleracea var. italica
   - Cauliflower = Brassica oleracea var. botrytis
   - Tomato = Solanum lycopersicum
   - Carrot = Daucus carota subsp. sativus
4. NEVER return genus-only unless absolutely unavoidable (mark with low confidence < 0.5)
5. Consider video title as strong contextual evidence

Pre-identified Latin names: {{latinNames}}

**VIDEO CONTEXT:**
Title: {{videoTitle}}
Description: {{videoDescription}}

For each plant identified, provide:
{
  "plants": [
    {
      "latinName": "Full botanical name (genus + species + variety if applicable)",
      "commonName": "Common name",
      "timestamp": "HH:MM:SS",
      "context": "Sentence mentioning the plant",
      "confidence": 0.95,
      "taxonomyLevel": "species|variety|genus",
      "targetAudience": "beginner|intermediate|advanced|professional",
      "complexity": {
        "cognitive": 30,
        "practical": 50,
        "emotional": 20
      }
    }
  ]
}

**FILTERED TRANSCRIPT ({{segmentCount}} segments):**
{{transcript}}

Return ONLY valid JSON.`,
    systemMessage:
      "You are a botanical expert specializing in plant identification. Consider target audience complexity: cognitive (knowledge required), practical (physical skill), emotional (confidence needed). Respond with valid JSON only.",
    temperature: 0.3,
    maxTokens: 4000,
    modelName: "gpt-4o-mini",
    focusAreas: ["genus_specificity", "context_awareness", "4d_complexity"],
  };
}

// ============================================================================
// PROMPT VERSION SELECTION
// ============================================================================

/**
 * Get the active prompt version for entity extraction.
 * Supports A/B testing with traffic distribution.
 *
 * @param activeVersions - Active prompt versions with traffic percentages.
 *   If empty or not provided, returns the default prompt.
 */
export function getActivePromptVersion(
  activeVersions?: PromptVersionRecord[]
): PromptConfig {
  if (!activeVersions || activeVersions.length === 0) {
    return getDefaultPrompt();
  }

  // Filter to only active versions with traffic
  const eligible = activeVersions
    .filter((v) => v.isActive && v.trafficPercentage > 0)
    .sort((a, b) => b.trafficPercentage - a.trafficPercentage);

  if (eligible.length === 0) {
    return getDefaultPrompt();
  }

  // A/B testing: Randomly select based on traffic percentage
  const random = Math.random() * 100;
  let cumulative = 0;

  for (const version of eligible) {
    cumulative += version.trafficPercentage;
    if (random <= cumulative) {
      return {
        version: version.version,
        promptTemplate: version.promptTemplate,
        systemMessage: version.systemMessage,
        temperature: version.temperature,
        maxTokens: version.maxTokens,
        modelName: version.modelName,
        focusAreas: version.focusAreas,
      };
    }
  }

  // Fallback to first eligible version
  const fallback = eligible[0]!;
  return {
    version: fallback.version,
    promptTemplate: fallback.promptTemplate,
    systemMessage: fallback.systemMessage,
    temperature: fallback.temperature,
    maxTokens: fallback.maxTokens,
    modelName: fallback.modelName,
    focusAreas: fallback.focusAreas,
  };
}

// ============================================================================
// PROMPT VERSION CREATION
// ============================================================================

/**
 * Create a new prompt version record.
 * Returns the record; caller is responsible for persisting it.
 */
export function createPromptVersion(params: {
  version: string;
  promptTemplate: string;
  systemMessage: string;
  changeDescription: string;
  focusAreas: string[];
  temperature?: number;
  maxTokens?: number;
  trafficPercentage?: number;
}): PromptVersionRecord {
  return {
    version: params.version,
    promptTemplate: params.promptTemplate,
    systemMessage: params.systemMessage,
    changeDescription: params.changeDescription,
    focusAreas: params.focusAreas,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens ?? 4000,
    modelName: "gpt-4o-mini",
    trafficPercentage: params.trafficPercentage ?? 0,
    isActive: false, // Needs manual activation
  };
}

// ============================================================================
// AUTO-TUNING
// ============================================================================

/**
 * Analyze prompt version performance and identify weaknesses/strengths.
 * Pure function: takes metrics, returns analysis.
 *
 * @param version - The prompt version record.
 * @param metrics - Performance metrics for the version (e.g., last 7 days).
 * @returns Analysis with weaknesses, strengths, and aggregate stats.
 */
export function analyzePromptPerformance(
  version: PromptVersionRecord,
  metrics: PromptMetric[]
): AutoTuneResult | null {
  if (metrics.length < 5) {
    return null; // Not enough data to analyze
  }

  // Calculate aggregate performance
  const totalEntities = metrics.reduce(
    (sum, m) => sum + m.entitiesExtracted,
    0
  );
  const totalGenus = metrics.reduce(
    (sum, m) => sum + m.genusOnlyEntities,
    0
  );
  const totalCorrections = metrics.reduce(
    (sum, m) => sum + m.correctionsMade,
    0
  );

  const genusOnlyRate = totalEntities > 0 ? totalGenus / totalEntities : 0;
  const correctionRate =
    totalEntities > 0 ? totalCorrections / totalEntities : 0;
  const avgConfidence =
    metrics.reduce((sum, m) => sum + (m.avgConfidence ?? 0), 0) /
    metrics.length;

  // Identify weaknesses
  const weaknesses: string[] = [];
  const strengths: string[] = [];

  if (genusOnlyRate > 0.15) {
    // More than 15% genus-only
    weaknesses.push("high_genus_only_rate");
  } else if (genusOnlyRate < 0.05) {
    strengths.push("low_genus_only_rate");
  }

  if (correctionRate > 0.1) {
    // More than 10% corrections
    weaknesses.push("high_correction_rate");
  } else if (correctionRate < 0.03) {
    strengths.push("low_correction_rate");
  }

  if (avgConfidence < 0.7) {
    weaknesses.push("low_confidence");
  } else if (avgConfidence > 0.85) {
    strengths.push("high_confidence");
  }

  return {
    version: version.version,
    weaknesses,
    strengths,
    genusOnlyRate,
    correctionRate,
    avgConfidence,
  };
}

/**
 * Use GPT to suggest prompt improvements based on weaknesses.
 *
 * @param version - The current prompt version.
 * @param weaknesses - Identified weaknesses from analyzePromptPerformance.
 * @param recentCorrections - Recent entity corrections to learn from.
 * @param apiKey - OpenAI API key.
 * @param logger - Optional logger.
 * @returns Improvement suggestion, or null if generation failed.
 */
export async function suggestPromptImprovements(
  version: PromptVersionRecord,
  weaknesses: string[],
  recentCorrections: EntityCorrection[],
  apiKey: string,
  logger: Logger = defaultLogger
): Promise<PromptImprovementSuggestion | null> {
  logger.info("Suggesting NER prompt improvements", {
    version: version.version,
  });

  const exampleFailures = recentCorrections.slice(0, 5).map((c) => ({
    detected: c.detectedText,
    should_be: c.correctedLatinName,
    reason: c.correctionReason,
    context: c.videoTitle,
  }));

  const prompt = `You are an AI prompt engineer optimizing plant identification prompts.

**Current Prompt Template:**
${version.promptTemplate}

**Identified Weaknesses:**
${weaknesses.map((w) => `- ${w}`).join("\n")}

**Recent Failure Examples:**
${JSON.stringify(exampleFailures, null, 2)}

**Task:**
Suggest specific improvements to the prompt template to address these weaknesses.
Focus on:
1. Clearer instructions for genus-to-species resolution
2. Better use of video context (title, description)
3. Confidence calibration
4. 4D complexity assessment (cognitive, practical, emotional loads)

Return JSON:
{
  "improvements": [
    {
      "weakness": "high_genus_only_rate",
      "suggestion": "Add explicit examples of genus-to-species mapping",
      "priority": "high"
    }
  ],
  "updatedPrompt": "Full updated prompt text...",
  "expectedImpact": "Reduce genus-only rate from 15% to <5%"
}`;

  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an expert prompt engineer specializing in NER optimization.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const suggestion = JSON.parse(content) as {
      improvements: Array<{
        weakness: string;
        suggestion: string;
        priority: string;
      }>;
      updatedPrompt: string;
      expectedImpact: string;
    };

    const newVersion = `${version.version}-auto-${Date.now().toString(36)}`;

    logger.info("Created NER improvement candidate", {
      newVersion,
      expectedImpact: suggestion.expectedImpact,
    });

    return {
      newVersion,
      updatedPrompt: suggestion.updatedPrompt,
      expectedImpact: suggestion.expectedImpact,
      improvements: suggestion.improvements,
    };
  } catch (error) {
    logger.error(
      "Failed to generate NER improvements",
      error instanceof Error ? error : undefined
    );
    return null;
  }
}

// ============================================================================
// PROMPT VERSION COMPARISON (A/B TESTING)
// ============================================================================

/**
 * Compare two prompt versions based on their metrics.
 * Pure function: takes metrics for both, returns comparison.
 */
export function comparePromptVersions(
  versionA: string,
  metricsA: PromptMetric[],
  versionB: string,
  metricsB: PromptMetric[]
): PromptComparisonResult {
  const statsA = calculateStats(metricsA);
  const statsB = calculateStats(metricsB);

  const winner = determineWinner(statsA, statsB);

  return {
    versionA: { version: versionA, ...statsA },
    versionB: { version: versionB, ...statsB },
    winner,
    recommendation: generateRecommendation(winner, statsA, statsB),
  };
}

function calculateStats(metrics: PromptMetric[]): PromptStats {
  if (metrics.length === 0) {
    return {
      totalEntities: 0,
      genusOnlyRate: 0,
      correctionRate: 0,
      avgConfidence: 0,
      qualityScore: 0,
    };
  }

  const total = metrics.reduce((sum, m) => sum + m.entitiesExtracted, 0);
  const genusOnly = metrics.reduce((sum, m) => sum + m.genusOnlyEntities, 0);
  const corrections = metrics.reduce((sum, m) => sum + m.correctionsMade, 0);
  const avgConf =
    metrics.reduce((sum, m) => sum + (m.avgConfidence ?? 0), 0) /
    metrics.length;

  const genusOnlyRate = total > 0 ? genusOnly / total : 0;
  const correctionRate = total > 0 ? corrections / total : 0;

  return {
    totalEntities: total,
    genusOnlyRate,
    correctionRate,
    avgConfidence: avgConf,
    qualityScore: calculateQualityScore(genusOnlyRate, correctionRate, avgConf),
  };
}

/**
 * Calculate a composite quality score for a prompt version.
 * Higher is better. Range 0-100.
 */
export function calculateQualityScore(
  genusRate: number,
  correctionRate: number,
  confidence: number
): number {
  // Lower genus-only rate is better (target: <5%)
  const genusScore = Math.max(0, 100 - genusRate * 100 * 5);

  // Lower correction rate is better (target: <3%)
  const correctionScore = Math.max(0, 100 - correctionRate * 100 * 10);

  // Higher confidence is better (target: >85%)
  const confScore = confidence * 100;

  // Weighted average
  return genusScore * 0.4 + correctionScore * 0.4 + confScore * 0.2;
}

function determineWinner(
  statsA: PromptStats,
  statsB: PromptStats
): "A" | "B" | "tie" {
  const scoreDiff = statsA.qualityScore - statsB.qualityScore;

  if (Math.abs(scoreDiff) < 5) return "tie"; // Less than 5 points difference
  return scoreDiff > 0 ? "A" : "B";
}

function generateRecommendation(
  winner: "A" | "B" | "tie",
  statsA: PromptStats,
  statsB: PromptStats
): string {
  if (winner === "tie") {
    return "Performance is similar. Continue A/B testing or retire the lower-performing version.";
  }

  const winnerStats = winner === "A" ? statsA : statsB;
  const loserStats = winner === "A" ? statsB : statsA;

  const improvementPct =
    loserStats.qualityScore > 0
      ? (
          ((winnerStats.qualityScore - loserStats.qualityScore) /
            loserStats.qualityScore) *
          100
        ).toFixed(1)
      : "N/A";

  return `Version ${winner} is performing ${improvementPct}% better. Consider increasing its traffic percentage to 100%.`;
}
