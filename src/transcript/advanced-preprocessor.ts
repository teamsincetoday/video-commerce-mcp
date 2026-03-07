/**
 * Advanced Transcript Preprocessor — Standalone token reduction pipeline.
 *
 * Ported from monolith lib/services/advanced-transcript-preprocessor.ts.
 * Removes: Prisma, @/lib/logger.
 * Keeps: Complete 6-stage preprocessing pipeline, all keyword lists, all algorithms.
 *
 * PURPOSE: Cost optimization service that reduces transcript size by 70-85%
 * BEFORE sending to expensive AI APIs (GPT-4 NER). Implements aggressive
 * 6-stage preprocessing pipeline to reduce OpenAI costs by 90%, stay within
 * API rate limits, and speed up processing by 94% (8s -> 0.5s) while preserving
 * all relevant botanical content for accurate Named Entity Recognition.
 *
 * 6-stage preprocessing pipeline:
 * - Stage 1: Noise Removal (40% reduction) - Fillers, sponsors, repetitions
 * - Stage 2: Semantic Filtering (20-30% reduction) - Keyword density checks
 * - Stage 3: Entity Focus (10-20% reduction) - Domain-specific term detection
 * - Stage 4: Context Window Optimization - 200 chars around keywords
 * - Stage 5: De-duplication - Remove redundant segments
 * - Stage 6: Length Limiting - Max 8000 chars (~2000 tokens)
 */

import type {
  PreprocessingResult,
  StageResult,
  PreprocessingMetadata,
  PreprocessingOptions,
  Logger,
} from "../types.js";
import { defaultLogger } from "../types.js";
import type { VerticalConfig } from "../verticals/vertical-config.js";

// Re-export types for convenience
export type {
  PreprocessingResult,
  StageResult,
  PreprocessingMetadata,
  PreprocessingOptions,
};

// ============================================================================
// BOTANICAL KEYWORDS & PATTERNS
// ============================================================================

/**
 * High-value botanical terms (genus names, common terms, actions).
 * These are the CORE keywords used for semantic filtering.
 */
export const BOTANICAL_KEYWORDS = [
  // Common genera
  "lavender", "lavandula", "tomato", "solanum", "rose", "rosa", "maple", "acer",
  "salvia", "sage", "mint", "mentha", "basil", "ocimum", "thyme", "thymus",
  "rosemary", "rosmarinus", "oregano", "origanum", "hosta", "hydrangea",
  "clematis", "geranium", "petunia", "dahlia", "tulip", "tulipa", "narcissus",
  "daffodil", "iris", "lily", "lilium", "peony", "paeonia", "delphinium",

  // Gardening actions
  "plant", "planting", "prune", "pruning", "propagate", "propagating",
  "transplant", "transplanting", "sow", "sowing", "harvest", "harvesting",
  "water", "watering", "fertilize", "fertilizing", "mulch", "mulching",
  "deadhead", "deadheading", "divide", "dividing", "stake", "staking",

  // Plant parts & characteristics
  "flower", "flowers", "flowering", "bloom", "blooms", "blooming",
  "leaf", "leaves", "foliage", "stem", "stems", "root", "roots",
  "seed", "seeds", "bulb", "bulbs", "cutting", "cuttings",
  "perennial", "annual", "biennial", "evergreen", "deciduous",
  "hardy", "tender", "drought-tolerant", "shade-loving", "sun-loving",

  // Growing conditions
  "soil", "compost", "fertilizer", "nutrients", "drainage", "ph",
  "sunlight", "shade", "full sun", "partial shade", "moisture",
  "temperature", "hardiness", "zone", "climate", "season", "spring",
  "summer", "autumn", "fall", "winter", "frost",

  // Garden types & structures
  "garden", "bed", "border", "container", "pot", "greenhouse",
  "raised bed", "vegetable garden", "herb garden", "flower bed",
];

/**
 * Low-value filler words and phrases.
 */
export const FILLER_WORDS = [
  "um", "uh", "er", "ah", "like", "you know", "i mean", "sort of",
  "kind of", "basically", "actually", "literally", "honestly",
  "so yeah", "right", "okay", "alright", "well",
];

/**
 * Sponsor/promotional patterns.
 */
export const SPONSOR_PATTERNS = [
  /this video is sponsored by/i,
  /thanks to our sponsor/i,
  /check out the link in the description/i,
  /use code \w+ for \d+% off/i,
  /affiliate link/i,
  /don't forget to like and subscribe/i,
  /hit that notification bell/i,
  /support us on patreon/i,
  /merch available at/i,
  /follow me on instagram/i,
  /follow me on twitter/i,
  /check out my website/i,
];

/**
 * Intro/outro patterns (low botanical content).
 */
export const INTRO_OUTRO_PATTERNS = [
  /^(hey|hi|hello) (everyone|guys|folks|friends)/i,
  /welcome back to (my|the) channel/i,
  /today (we're|i'm) going to (talk about|show you|discuss)/i,
  /before we get started/i,
  /that's it for today/i,
  /thanks for watching/i,
  /see you (next time|in the next video)/i,
  /until next time/i,
];

// ============================================================================
// INTERNAL STAGE RESULT TYPE (includes outputText)
// ============================================================================

interface InternalStageResult extends StageResult {
  outputText: string;
}

// ============================================================================
// MAIN PREPROCESSOR CLASS
// ============================================================================

export class AdvancedTranscriptPreprocessor {
  protected options: Required<PreprocessingOptions>;
  protected logger: Logger;
  /** Domain-specific keywords for filtering. Defaults to BOTANICAL_KEYWORDS. */
  protected domainKeywords: string[];
  /** Filtering aggressiveness from vertical config (0-1). */
  protected filteringAggressiveness: number;

  constructor(options: PreprocessingOptions = {}, logger?: Logger, verticalConfig?: VerticalConfig) {
    this.options = {
      targetReduction: options.targetReduction ?? 0.75,
      maxLength: options.maxLength ?? 8000,
      minKeywordDensity: options.minKeywordDensity ?? 0.02,
      contextWindowSize: options.contextWindowSize ?? 200,
      enableAggressiveFiltering: options.enableAggressiveFiltering ?? true,
    };
    this.logger = logger ?? defaultLogger;

    // Use vertical config keywords if provided, otherwise fall back to botanical keywords
    if (verticalConfig && verticalConfig.contentSignals.inclusionKeywords.length > 0) {
      this.domainKeywords = verticalConfig.contentSignals.inclusionKeywords;
      this.filteringAggressiveness = verticalConfig.filteringAggressiveness;
    } else if (verticalConfig && verticalConfig.filteringAggressiveness < 0.3) {
      // Generic/low-aggressiveness vertical with no keywords: skip semantic filtering
      this.domainKeywords = [];
      this.filteringAggressiveness = verticalConfig.filteringAggressiveness;
    } else {
      // Default: botanical keywords (backward compat)
      this.domainKeywords = BOTANICAL_KEYWORDS;
      this.filteringAggressiveness = 0.7;
    }
  }

  /**
   * Main preprocessing pipeline - runs all 6 stages.
   * Pure function: no database access, no side effects.
   */
  async preprocess(transcript: string, videoId?: string): Promise<PreprocessingResult> {
    const startTime = Date.now();
    const stages: StageResult[] = [];

    let currentText = transcript;
    const originalLength = transcript.length;


    // Calculate dynamic max length based on original length
    const dynamicMaxLength = originalLength < 10000
      ? Math.ceil(originalLength * 0.95)
      : Math.max(Math.ceil(originalLength * 0.3), 8000);

    this.options.maxLength = this.options.maxLength ?? dynamicMaxLength;

    // Stage 1: Noise Removal (40% reduction target) — always runs
    const stage1Result = this.stage1NoiseRemoval(currentText);
    stages.push(stage1Result);
    currentText = stage1Result.outputText;

    // When filtering aggressiveness is low (generic/unknown vertical),
    // skip keyword-based semantic stages — just do noise removal + dedup + length limiting
    const skipSemanticFiltering = this.filteringAggressiveness < 0.3 || this.domainKeywords.length === 0;

    // Stage 2: Semantic Filtering (20-30% reduction target)
    if (!skipSemanticFiltering) {
      const stage2Result = this.stage2SemanticFiltering(currentText);
      stages.push(stage2Result);
      currentText = stage2Result.outputText;
    }

    // Stage 3: Entity Focus (10-20% reduction target)
    if (!skipSemanticFiltering) {
      const stage3Result = this.stage3EntityFocus(currentText);
      stages.push(stage3Result);
      currentText = stage3Result.outputText;
    }

    // Stage 4: Context Window Optimization
    if (!skipSemanticFiltering) {
      const stage4Result = this.stage4ContextOptimization(currentText);
      stages.push(stage4Result);
      currentText = stage4Result.outputText;
    }

    // Stage 5: De-duplication
    const stage5Result = this.stage5Deduplication(currentText);
    stages.push(stage5Result);
    currentText = stage5Result.outputText;

    // Stage 6: Length Limiting
    const stage6Result = this.stage6LengthLimiting(currentText);
    stages.push(stage6Result);
    currentText = stage6Result.outputText;

    const processedLength = currentText.length;
    const reductionPercentage =
      originalLength > 0
        ? ((originalLength - processedLength) / originalLength) * 100
        : 0;
    const processingTime = Date.now() - startTime;

    const metadata: PreprocessingMetadata = {
      fillerWordsRemoved: (stages[0]?.metadata as Record<string, number> | undefined)?.fillerWordsRemoved ?? 0,
      sponsorSegmentsRemoved: (stages[0]?.metadata as Record<string, number> | undefined)?.sponsorSegmentsRemoved ?? 0,
      repetitionsRemoved: (stages[4]?.metadata as Record<string, number> | undefined)?.repetitionsRemoved ?? 0,
      irrelevantSegmentsRemoved: (stages[1]?.metadata as Record<string, number> | undefined)?.irrelevantSegmentsRemoved ?? 0,
      botanicalTermsFound: ((stages[2]?.metadata as Record<string, unknown> | undefined)?.botanicalTermsFound as string[]) ?? [],
      keywordDensity: (stages[2]?.metadata as Record<string, number> | undefined)?.keywordDensity ?? 0,
      hasHighQualityContent: ((stages[2]?.metadata as Record<string, unknown> | undefined)?.hasHighQualityContent as boolean) ?? false,
      estimatedTokens: Math.ceil(processedLength / 4),
      processingTime,
    };

    if (process.env.LOG_PREPROCESSING_STATS === "true") {
      this.logger.info("Preprocessing results", {
        videoId: videoId ?? "unknown",
        originalLength,
        processedLength,
        reductionPercentage: `${reductionPercentage.toFixed(1)}%`,
        processingTime: `${processingTime}ms`,
        estimatedTokens: metadata.estimatedTokens,
      });
    }

    return {
      originalText: transcript,
      processedText: currentText,
      originalLength,
      processedLength,
      reductionPercentage,
      stages: stages.map((s) => ({
        stage: s.stage,
        name: s.name,
        inputLength: s.inputLength,
        outputLength: s.outputLength,
        reduction: s.reduction,
        reductionPercentage: s.reductionPercentage,
        duration: s.duration,
      })),
      metadata,
    };
  }

  // ==========================================================================
  // STAGE 1: NOISE REMOVAL (Target: 40% reduction)
  // ==========================================================================

  private stage1NoiseRemoval(text: string): InternalStageResult {
    const startTime = Date.now();
    const inputLength = text.length;
    let processed = text;

    let fillerWordsRemoved = 0;
    let sponsorSegmentsRemoved = 0;

    // Remove filler words
    for (const filler of FILLER_WORDS) {
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      const matches = processed.match(regex);
      if (matches) {
        fillerWordsRemoved += matches.length;
        processed = processed.replace(regex, "");
      }
    }

    // Remove sponsor segments (sentence-level)
    const sentences = processed.split(/[.!?]+/);
    const filteredSentences = sentences.filter((sentence) => {
      for (const pattern of SPONSOR_PATTERNS) {
        if (pattern.test(sentence)) {
          sponsorSegmentsRemoved++;
          return false;
        }
      }
      return true;
    });
    processed = filteredSentences.join(". ");

    // Remove intro/outro patterns
    for (const pattern of INTRO_OUTRO_PATTERNS) {
      processed = processed.replace(pattern, "");
    }

    // Remove excessive whitespace
    processed = processed.replace(/\s+/g, " ").trim();

    const outputLength = processed.length;
    const reduction = inputLength - outputLength;
    const reductionPercentage = inputLength > 0 ? (reduction / inputLength) * 100 : 0;

    return {
      stage: 1,
      name: "Noise Removal",
      inputLength,
      outputLength,
      reduction,
      reductionPercentage,
      duration: Date.now() - startTime,
      outputText: processed,
      metadata: { fillerWordsRemoved, sponsorSegmentsRemoved },
    };
  }

  // ==========================================================================
  // STAGE 2: SEMANTIC FILTERING (Target: 20-30% reduction)
  // ==========================================================================

  private stage2SemanticFiltering(text: string): InternalStageResult {
    const startTime = Date.now();
    const inputLength = text.length;

    const sentences = text
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    const scoredSentences = sentences.map((sentence) => {
      const words = sentence.toLowerCase().split(/\s+/);
      const keywordCount = words.filter((word) =>
        this.domainKeywords.some((kw) => word.includes(kw)),
      ).length;
      const density = keywordCount / Math.max(words.length, 1);
      return { sentence, density, keywordCount };
    });

    let irrelevantSegmentsRemoved = 0;
    const filteredSentences = scoredSentences.filter(
      ({ density, keywordCount }) => {
        const keep = keywordCount > 0 || density > 0.05;
        if (!keep) irrelevantSegmentsRemoved++;
        return keep;
      },
    );

    const processed = filteredSentences.map((s) => s.sentence).join(". ");
    const outputLength = processed.length;
    const reduction = inputLength - outputLength;
    const reductionPercentage = inputLength > 0 ? (reduction / inputLength) * 100 : 0;

    return {
      stage: 2,
      name: "Semantic Filtering",
      inputLength,
      outputLength,
      reduction,
      reductionPercentage,
      duration: Date.now() - startTime,
      outputText: processed,
      metadata: { irrelevantSegmentsRemoved },
    };
  }

  // ==========================================================================
  // STAGE 3: ENTITY FOCUS (Target: 10-20% reduction)
  // ==========================================================================

  private stage3EntityFocus(text: string): InternalStageResult {
    const startTime = Date.now();
    const inputLength = text.length;

    const words = text.toLowerCase().split(/\s+/);
    const botanicalTermsFound = new Set<string>();

    for (const word of words) {
      for (const keyword of this.domainKeywords) {
        if (word.includes(keyword)) {
          botanicalTermsFound.add(keyword);
        }
      }
    }

    const keywordDensity = botanicalTermsFound.size / Math.max(words.length, 1);
    const hasHighQualityContent =
      keywordDensity >= this.options.minKeywordDensity;

    let processed = text;
    if (this.options.enableAggressiveFiltering && !hasHighQualityContent) {
      const sentences = text
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 0);
      const relevantSentences = sentences.filter((sentence) => {
        const lowerSentence = sentence.toLowerCase();
        return this.domainKeywords.some((kw) => lowerSentence.includes(kw));
      });
      processed = relevantSentences.join(". ");
    }

    const outputLength = processed.length;
    const reduction = inputLength - outputLength;
    const reductionPercentage = inputLength > 0 ? (reduction / inputLength) * 100 : 0;

    return {
      stage: 3,
      name: "Entity Focus",
      inputLength,
      outputLength,
      reduction,
      reductionPercentage,
      duration: Date.now() - startTime,
      outputText: processed,
      metadata: {
        botanicalTermsFound: Array.from(botanicalTermsFound),
        keywordDensity,
        hasHighQualityContent,
      },
    };
  }

  // ==========================================================================
  // STAGE 4: CONTEXT WINDOW OPTIMIZATION
  // ==========================================================================

  private stage4ContextOptimization(text: string): InternalStageResult {
    const startTime = Date.now();
    const inputLength = text.length;

    // Find all keyword positions
    const keywordPositions: number[] = [];
    const lowerText = text.toLowerCase();

    for (const keyword of this.domainKeywords) {
      let index = lowerText.indexOf(keyword);
      while (index !== -1) {
        keywordPositions.push(index);
        index = lowerText.indexOf(keyword, index + 1);
      }
    }

    // If no keywords, return empty
    if (keywordPositions.length === 0) {
      return {
        stage: 4,
        name: "Context Window Optimization",
        inputLength,
        outputLength: 0,
        reduction: inputLength,
        reductionPercentage: 100,
        duration: Date.now() - startTime,
        outputText: "",
      };
    }

    keywordPositions.sort((a, b) => a - b);

    interface ContextWindow {
      start: number;
      end: number;
      text: string;
    }
    const contextWindows: ContextWindow[] = [];
    const windowSize = this.options.contextWindowSize;

    for (const pos of keywordPositions) {
      const start = Math.max(0, pos - windowSize);
      const end = Math.min(text.length, pos + windowSize);
      contextWindows.push({
        start,
        end,
        text: text.substring(start, end),
      });
    }

    const mergedWindows = this.mergeOverlappingWindowsWithPositions(
      contextWindows,
      text,
    );
    const processed = mergedWindows.join(" ... ");

    // Prevent expansion beyond original length
    let finalOutput = processed;
    if (processed.length > inputLength) {
      finalOutput = text;
    }

    const outputLength = finalOutput.length;
    const reduction = inputLength - outputLength;
    const reductionPercentage = inputLength > 0 ? (reduction / inputLength) * 100 : 0;

    return {
      stage: 4,
      name: "Context Window Optimization",
      inputLength,
      outputLength,
      reduction,
      reductionPercentage,
      duration: Date.now() - startTime,
      outputText: finalOutput,
    };
  }

  // ==========================================================================
  // STAGE 5: DE-DUPLICATION
  // ==========================================================================

  private stage5Deduplication(text: string): InternalStageResult {
    const startTime = Date.now();
    const inputLength = text.length;

    const segments = text
      .split(/\.\.\./g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const uniqueSegments = new Set<string>();
    let repetitionsRemoved = 0;

    for (const segment of segments) {
      if (uniqueSegments.has(segment)) {
        repetitionsRemoved++;
      } else {
        uniqueSegments.add(segment);
      }
    }

    const processed = Array.from(uniqueSegments).join(" ... ");
    const outputLength = processed.length;
    const reduction = inputLength - outputLength;
    const reductionPercentage = inputLength > 0 ? (reduction / inputLength) * 100 : 0;

    return {
      stage: 5,
      name: "De-duplication",
      inputLength,
      outputLength,
      reduction,
      reductionPercentage,
      duration: Date.now() - startTime,
      outputText: processed,
      metadata: { repetitionsRemoved },
    };
  }

  // ==========================================================================
  // STAGE 6: LENGTH LIMITING
  // ==========================================================================

  private stage6LengthLimiting(text: string): InternalStageResult {
    const startTime = Date.now();
    const inputLength = text.length;

    let processed = text;
    if (text.length > this.options.maxLength) {
      processed = text.substring(0, this.options.maxLength) + "...";
    }

    const outputLength = processed.length;
    const reduction = inputLength - outputLength;
    const reductionPercentage = inputLength > 0 ? (reduction / inputLength) * 100 : 0;

    return {
      stage: 6,
      name: "Length Limiting",
      inputLength,
      outputLength,
      reduction,
      reductionPercentage,
      duration: Date.now() - startTime,
      outputText: processed,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Improved window merging with position-based overlap detection.
   * Prevents duplication and artificial expansion.
   */
  private mergeOverlappingWindowsWithPositions(
    windows: Array<{ start: number; end: number; text: string }>,
    originalText: string,
  ): string[] {
    if (windows.length === 0) return [];

    windows.sort((a, b) => a.start - b.start);

    const merged: Array<{ start: number; end: number }> = [];
    let current = { start: windows[0]!.start, end: windows[0]!.end };

    for (let i = 1; i < windows.length; i++) {
      const next = windows[i]!;

      if (next.start <= current.end + 50) {
        current = {
          start: current.start,
          end: Math.max(current.end, next.end),
        };
      } else {
        merged.push(current);
        current = { start: next.start, end: next.end };
      }
    }

    merged.push(current);

    return merged.map((window) =>
      originalText.substring(window.start, window.end).trim(),
    );
  }

  // ==========================================================================
  // BATCH PROCESSING
  // ==========================================================================

  /**
   * Preprocess multiple transcripts in batch.
   */
  async preprocessBatch(
    transcripts: Array<{ id: string; text: string }>,
  ): Promise<Map<string, PreprocessingResult>> {
    const results = new Map<string, PreprocessingResult>();

    for (const { id, text } of transcripts) {
      const result = await this.preprocess(text, id);
      results.set(id, result);
    }

    return results;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick preprocessing with default options.
 * Optionally accepts a VerticalConfig to use domain-specific keywords.
 */
export async function preprocessTranscript(
  transcript: string,
  videoId?: string,
  verticalConfig?: VerticalConfig,
): Promise<PreprocessingResult> {
  const preprocessor = new AdvancedTranscriptPreprocessor({}, undefined, verticalConfig);
  return preprocessor.preprocess(transcript, videoId);
}

/**
 * Preprocess with custom options.
 */
export async function preprocessTranscriptWithOptions(
  transcript: string,
  options: PreprocessingOptions,
  videoId?: string,
  verticalConfig?: VerticalConfig,
): Promise<PreprocessingResult> {
  const preprocessor = new AdvancedTranscriptPreprocessor(options, undefined, verticalConfig);
  return preprocessor.preprocess(transcript, videoId);
}

/**
 * Check if transcript has sufficient botanical content to be worth processing.
 * @deprecated Use hasSufficientDomainContent() with a VerticalConfig instead.
 */
export function hasSufficientBotanicalContent(
  transcript: string,
  minDensity = 0.02,
): boolean {
  const words = transcript.toLowerCase().split(/\s+/);
  const keywordCount = words.filter((word) =>
    BOTANICAL_KEYWORDS.some((kw) => word.includes(kw)),
  ).length;
  const density = keywordCount / Math.max(words.length, 1);
  return density >= minDensity;
}

/**
 * Check if transcript has sufficient domain content based on a vertical's keywords.
 * Returns true for verticals with low filtering aggressiveness (generic).
 */
export function hasSufficientDomainContent(
  transcript: string,
  verticalConfig?: VerticalConfig,
  minDensity = 0.02,
): boolean {
  // Generic/unknown verticals: always sufficient (let AI decide)
  if (!verticalConfig || verticalConfig.filteringAggressiveness < 0.3) {
    return true;
  }

  const keywords = verticalConfig.contentSignals.inclusionKeywords;
  if (keywords.length === 0) return true;

  const words = transcript.toLowerCase().split(/\s+/);
  const keywordCount = words.filter((word) =>
    keywords.some((kw) => word.includes(kw)),
  ).length;
  const density = keywordCount / Math.max(words.length, 1);
  return density >= minDensity;
}
