/**
 * Pipeline Orchestrator
 *
 * Central coordinator for the video commerce intelligence pipeline.
 * Coordinates all extraction stages to analyze a YouTube video:
 *
 * 1. Cache check -- return cached result if available
 * 2. Transcript fetching -- get YouTube transcript
 * 3. Preprocessing -- reduce tokens 70-90%
 * 4. AI orchestration -- GPT-4o-mini extracts entities, commerce items, intents
 * 5. NER enrichment -- resolve, disambiguate, calibrate entities
 * 6. Intelligence layers -- audience intent, skills, seasonal, quality, market
 * 7. Response assembly -- combine all results
 * 8. Cache storage -- persist for future requests
 *
 * Features:
 * - Analysis depth control (standard vs deep)
 * - Focus filtering (select which dimensions to include)
 * - Progress reporting via callback
 * - Partial failure handling (return what succeeded)
 */

import { AnalysisCache } from "./analysis-cache.js";

// Transcript pipeline
import {
  parseTranscript,
  getVideoMetadata,
  extractYouTubeId,
  preprocessTranscript,
  type VideoMetadata,
  type TranscriptFetchOptions,
} from "./transcript/index.js";

// NER pipeline
import {
  enhanceExtractedEntities,
  createPlantDictionary,
  createEmptyDictionary,
  type PlantDictionary,
} from "./ner/index.js";

// AI orchestration
import {
  AIOrchestrator,
  type VideoProcessingResult,
} from "./ai/index.js";

// Intelligence layers
import {
  analyzeTranscriptIntent,
  extractVideoSkills,
  extractSeasonalContext,
  assessEditorialQuality,
  scoreCategoryPotential,
  type TranscriptIntentAnalysis,
  type SeasonalContext,
} from "./intelligence/index.js";

// Types
import type {
  PlantEntry,
  Entity,
  EnhancedEntity,
  Logger,
} from "./types.js";
import { defaultLogger } from "./types.js";

// ============================================================================
// PIPELINE VERSION
// ============================================================================

const PIPELINE_VERSION = "0.1.0";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for creating a PipelineOrchestrator.
 */
export interface PipelineOptions {
  /** OpenAI API key for AI-powered stages. */
  openaiApiKey: string;
  /** Optional YouTube Data API key for metadata and caption fallback. */
  youtubeApiKey?: string;
  /** Optional analysis cache instance. If not provided, caching is disabled. */
  cache?: AnalysisCache;
  /** Plant dictionary entries for NER resolution. */
  plantDictionary?: PlantEntry[];
  /** Logger instance. */
  logger?: Logger;
}

/**
 * Request for a video analysis.
 */
export interface AnalysisRequest {
  /** YouTube video URL. */
  youtubeUrl: string;
  /** Analysis depth: 'standard' skips deep quality and skill extraction. */
  analysisDepth: "standard" | "deep";
  /** Optional focus filter. If provided, only these dimensions are computed. */
  focus?: AnalysisDimension[];
  /** Optional progress callback. Called after each stage completes. */
  onProgress?: (stage: string, percent: number) => void;
}

/**
 * The six analysis dimensions that can be computed.
 */
export type AnalysisDimension =
  | "entities"
  | "monetization"
  | "audience"
  | "quality"
  | "skills"
  | "market";

// ---------------------------------------------------------------------------
// Entity result shapes (pipeline output, not MCP response -- that's the
// response-formatter's job)
// ---------------------------------------------------------------------------

export interface PipelineEntity {
  name: string;
  scientificName?: string;
  category: string;
  confidence: number;
  isShoppable: boolean;
  mentions: Array<{ timestamp: string; context: string }>;
  monetizationPotential?: {
    affiliateScore: number;
    courseRelevance: number;
    contentGap: number;
  };
  // NER enrichment data
  plantId?: string;
  taxonomyLevel?: string;
  disambiguated: boolean;
  disambiguationMethod?: string;
  calibratedConfidence?: number;
}

export interface PipelineCommerceItem {
  name: string;
  category: string;
  timestamp?: string;
  confidence: number;
  context?: string;
}

export interface PipelineMonetization {
  commercialIntentScore: number;
  hasShoppableItems: boolean;
  recommendations: string[];
  entityCount: number;
  shoppableEntityCount: number;
  commerceItemCount: number;
}

export interface PipelineAudience {
  dominantIntent: string | null;
  intents: Array<{
    type: string;
    score: number;
    emotion?: string;
    commercialValue: number;
    recommendedCta?: string;
  }>;
  totalCommercialValue: number;
  emotionDistribution: Record<string, number>;
}

export interface PipelineQuality {
  editorialTier: string;
  overallScore: number;
  visualQuality: number;
  contentDepth: number;
  seasonalRelevance: number;
  designContext: number;
  narrativeStructure: number;
  botanicalLiteracy: number;
  standfirst?: string;
  editorialNotes: string[];
}

export interface PipelineSkills {
  primary: {
    name: string;
    displayName: string;
    level: string;
    teachingQuality: number;
    category: string;
  } | null;
  secondarySkills: Array<{
    name: string;
    displayName: string;
    level: string;
    category: string;
  }>;
  prerequisites: string[];
  nextSkills: string[];
  intent?: {
    type: string;
    reformulatedTitle: string;
  };
}

export interface PipelineMarket {
  seasonalContext: SeasonalContext | null;
  commercialPotential?: {
    overallPotential: number;
    commercialPotential: number;
    learningPotential: number;
    recommendedAction: string;
  };
}

/**
 * Full analysis result from the pipeline.
 */
export interface PipelineResult {
  videoId: string;
  title: string;
  channel: string;
  durationSeconds: number;
  language: string;
  analysisTimestamp: string;
  analysisDepth: string;
  commercialIntentScore: number;

  // Dimension results (present only if requested/computed)
  entities?: PipelineEntity[];
  commerceItems?: PipelineCommerceItem[];
  monetization?: PipelineMonetization;
  audience?: PipelineAudience;
  quality?: PipelineQuality;
  skills?: PipelineSkills;
  market?: PipelineMarket;

  // Pipeline metadata
  _meta: PipelineMeta;
}

export interface PipelineMeta {
  pipelineVersion: string;
  processingTimeMs: number;
  aiCostUsd: number;
  cacheHit: boolean;
  stagesCompleted: string[];
  stagesFailed: string[];
  stageErrors: Record<string, string>;
  transcriptTokenReduction?: number;
}

// ============================================================================
// PIPELINE ORCHESTRATOR CLASS
// ============================================================================

export class PipelineOrchestrator {
  private readonly openaiApiKey: string;
  private readonly youtubeApiKey?: string;
  private readonly cache?: AnalysisCache;
  private readonly dictionary: PlantDictionary;
  private readonly logger: Logger;
  private readonly aiOrchestrator: AIOrchestrator;

  constructor(options: PipelineOptions) {
    this.openaiApiKey = options.openaiApiKey;
    this.youtubeApiKey = options.youtubeApiKey;
    this.cache = options.cache;
    this.logger = options.logger ?? defaultLogger;

    // Build plant dictionary from entries or use empty
    if (options.plantDictionary && options.plantDictionary.length > 0) {
      this.dictionary = createPlantDictionary(options.plantDictionary);
    } else {
      this.dictionary = createEmptyDictionary();
    }

    // Create AI orchestrator
    this.aiOrchestrator = new AIOrchestrator({
      apiKey: this.openaiApiKey,
      logger: this.logger,
    });
  }

  /**
   * Run the full video analysis pipeline.
   *
   * Stages execute sequentially. If a stage fails, it is logged in
   * `_meta.stagesFailed` and the pipeline continues with remaining stages.
   * The result always includes whatever succeeded.
   */
  async analyze(request: AnalysisRequest): Promise<PipelineResult> {
    const startTime = Date.now();
    const progress = request.onProgress ?? (() => {});
    const stagesCompleted: string[] = [];
    const stagesFailed: string[] = [];
    const stageErrors: Record<string, string> = {};
    let totalAiCost = 0;

    // Determine which dimensions to compute
    const allDimensions: AnalysisDimension[] = [
      "entities",
      "monetization",
      "audience",
      "quality",
      "skills",
      "market",
    ];
    const activeDimensions = request.focus && request.focus.length > 0
      ? request.focus
      : allDimensions;
    const isDeep = request.analysisDepth === "deep";

    // Helper to check if a dimension is active
    const shouldRun = (dim: AnalysisDimension): boolean =>
      activeDimensions.includes(dim);

    // Extract video ID
    const videoId = extractYouTubeId(request.youtubeUrl);
    if (!videoId) {
      throw new Error(
        `Invalid YouTube URL: "${request.youtubeUrl}". Could not extract video ID.`
      );
    }

    // -----------------------------------------------------------------------
    // STAGE 0: Cache check
    // -----------------------------------------------------------------------
    progress("cache_check", 0);
    if (this.cache) {
      try {
        const cached = this.cache.get(videoId, request.analysisDepth);
        if (cached) {
          this.logger.info("Cache hit", { videoId, depth: request.analysisDepth });
          progress("cache_hit", 100);

          // Return cached analysis with updated meta
          const cachedResult = cached.analysis as PipelineResult;
          return {
            ...cachedResult,
            _meta: {
              ...cachedResult._meta,
              cacheHit: true,
            },
          };
        }
      } catch (err) {
        this.logger.warn("Cache lookup failed, continuing without cache", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // -----------------------------------------------------------------------
    // STAGE 1: Fetch transcript
    // -----------------------------------------------------------------------
    progress("fetch_transcript", 5);
    let transcriptText = "";
    let segments: Array<{ timestamp: string; text: string; start: number; duration: number }> = [];

    try {
      const fetchOptions: TranscriptFetchOptions = {
        logger: this.logger,
      };
      if (this.youtubeApiKey) {
        fetchOptions.youtubeApiKey = this.youtubeApiKey;
      }

      const parsed = await parseTranscript(request.youtubeUrl, fetchOptions);
      transcriptText = parsed.fullText;
      segments = parsed.segments;

      if (!transcriptText || transcriptText.trim().length === 0) {
        throw new Error("No transcript available for this video");
      }

      stagesCompleted.push("fetch_transcript");
      this.logger.info("Transcript fetched", {
        videoId,
        segmentCount: segments.length,
        textLength: transcriptText.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stagesFailed.push("fetch_transcript");
      stageErrors["fetch_transcript"] = msg;
      this.logger.error("Transcript fetch failed", err instanceof Error ? err : undefined);

      // Without a transcript we cannot proceed -- return minimal result
      return this.buildMinimalResult(
        videoId, request, startTime, stagesCompleted, stagesFailed, stageErrors, totalAiCost
      );
    }

    // -----------------------------------------------------------------------
    // STAGE 2: Fetch video metadata (non-blocking)
    // -----------------------------------------------------------------------
    progress("fetch_metadata", 10);
    let metadata: VideoMetadata | null = null;

    try {
      if (this.youtubeApiKey) {
        metadata = await getVideoMetadata(videoId, this.youtubeApiKey, this.logger);
        stagesCompleted.push("fetch_metadata");
      } else {
        // No API key -- skip metadata, use defaults
        stagesCompleted.push("fetch_metadata_skipped");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stagesFailed.push("fetch_metadata");
      stageErrors["fetch_metadata"] = msg;
      this.logger.warn("Metadata fetch failed, continuing", { error: msg });
    }

    // -----------------------------------------------------------------------
    // STAGE 3: Preprocess transcript (token reduction)
    // -----------------------------------------------------------------------
    progress("preprocess", 15);
    let processedText = transcriptText;
    let tokenReduction = 0;

    try {
      const preprocessResult = await preprocessTranscript(transcriptText, videoId);
      processedText = preprocessResult.processedText;
      tokenReduction = preprocessResult.reductionPercentage;
      stagesCompleted.push("preprocess");

      this.logger.info("Transcript preprocessed", {
        videoId,
        originalLength: transcriptText.length,
        processedLength: processedText.length,
        reduction: `${tokenReduction.toFixed(1)}%`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stagesFailed.push("preprocess");
      stageErrors["preprocess"] = msg;
      this.logger.warn("Preprocessing failed, using raw transcript", { error: msg });
      // Fall through with raw transcript
    }

    // -----------------------------------------------------------------------
    // STAGE 4: AI orchestration (GPT-4o-mini)
    // -----------------------------------------------------------------------
    progress("ai_orchestration", 25);
    let aiResult: VideoProcessingResult | null = null;

    try {
      // Determine which AI tasks to run based on active dimensions
      const needsEntities = shouldRun("entities") || shouldRun("monetization");
      const needsCommerce = shouldRun("entities") || shouldRun("monetization");
      const needsActions = shouldRun("skills") || shouldRun("audience");

      aiResult = await this.aiOrchestrator.processVideo({
        transcript: processedText,
        videoId,
        videoTitle: metadata?.title,
        includeLanguageDetection: true,
        includeEntityExtraction: needsEntities,
        includeDisambiguation: needsEntities,
        includeCommercialIntent: shouldRun("monetization"),
        includeCommerceItems: needsCommerce,
        includeActions: needsActions,
      });

      totalAiCost += aiResult.costEstimate;
      stagesCompleted.push("ai_orchestration");

      this.logger.info("AI orchestration complete", {
        videoId,
        entities: aiResult.entities?.length ?? 0,
        commerceItems: aiResult.commerceItems?.length ?? 0,
        costUsd: aiResult.costEstimate.toFixed(4),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stagesFailed.push("ai_orchestration");
      stageErrors["ai_orchestration"] = msg;
      this.logger.error("AI orchestration failed", err instanceof Error ? err : undefined);
      // Continue -- some intelligence stages can work without AI results
    }

    // -----------------------------------------------------------------------
    // STAGE 5: NER enrichment (resolve, disambiguate, calibrate)
    // -----------------------------------------------------------------------
    progress("ner_enrichment", 40);
    let enrichedEntities: PipelineEntity[] = [];

    if (shouldRun("entities") && aiResult?.entities) {
      try {
        // Convert AI output entities to the NER pipeline's Entity format
        const rawEntities: Entity[] = (aiResult.entities ?? []).map((e) => ({
          entity: e.scientificName ?? e.name,
          metadata: {
            latinName: e.scientificName,
            commonName: e.name,
            category: e.category,
            isShoppable: e.isShoppable,
          },
          timestamp: e.mentions?.[0]?.timestamp ?? "",
          context: e.mentions?.[0]?.text ?? "",
          confidence: (e.confidence ?? 50) / 100,
        }));

        const enhancementResult = await enhanceExtractedEntities(
          {
            rawEntities,
            transcript: processedText,
            videoTitle: metadata?.title ?? videoId,
          },
          {
            dictionary: this.dictionary,
            logger: this.logger,
          }
        );

        // Build pipeline entities from enriched data
        enrichedEntities = this.buildPipelineEntities(
          aiResult.entities ?? [],
          enhancementResult.entities,
        );

        stagesCompleted.push("ner_enrichment");

        this.logger.info("NER enrichment complete", {
          videoId,
          entitiesEnriched: enrichedEntities.length,
          avgConfidence: enhancementResult.metrics.avgConfidence.toFixed(2),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stagesFailed.push("ner_enrichment");
        stageErrors["ner_enrichment"] = msg;
        this.logger.warn("NER enrichment failed, using raw AI entities", { error: msg });

        // Fall back to raw AI entities
        enrichedEntities = (aiResult.entities ?? []).map((e) => ({
          name: e.name,
          scientificName: e.scientificName,
          category: e.category,
          confidence: (e.confidence ?? 50) / 100,
          isShoppable: e.isShoppable,
          mentions: (e.mentions ?? []).map((m) => ({
            timestamp: m.timestamp,
            context: m.text,
          })),
          disambiguated: false,
        }));
      }
    }

    // -----------------------------------------------------------------------
    // STAGE 6: Commerce items
    // -----------------------------------------------------------------------
    let commerceItems: PipelineCommerceItem[] = [];
    if (shouldRun("entities") || shouldRun("monetization")) {
      if (aiResult?.commerceItems) {
        commerceItems = aiResult.commerceItems.map((item) => ({
          name: item.name,
          category: item.category,
          timestamp: item.timestamp,
          confidence: (item.confidence ?? 50) / 100,
          context: item.context,
        }));
      }
    }

    // -----------------------------------------------------------------------
    // STAGE 7: Audience intent analysis
    // -----------------------------------------------------------------------
    progress("audience_intent", 55);
    let audienceResult: PipelineAudience | undefined;

    if (shouldRun("audience")) {
      try {
        // Use transcript segments for intent analysis (zero-cost, regex-based)
        const intentInput = segments.map((s) => ({
          timestamp: s.timestamp,
          text: s.text,
        }));

        const intentAnalysis: TranscriptIntentAnalysis =
          analyzeTranscriptIntent(intentInput);

        audienceResult = {
          dominantIntent: intentAnalysis.summary.topIntent || null,
          intents: intentAnalysis.detections.slice(0, 20).map((d) => ({
            type: d.intent,
            score: d.score,
            emotion: d.dominantEmotion,
            commercialValue: d.commercialValue,
            recommendedCta: d.recommendedCTA,
          })),
          totalCommercialValue: intentAnalysis.summary.totalCommercialValue,
          emotionDistribution: intentAnalysis.summary.emotionDistribution,
        };

        stagesCompleted.push("audience_intent");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stagesFailed.push("audience_intent");
        stageErrors["audience_intent"] = msg;
        this.logger.warn("Audience intent analysis failed", { error: msg });
      }
    }

    // -----------------------------------------------------------------------
    // STAGE 8: Seasonal context (zero-cost, always runs)
    // -----------------------------------------------------------------------
    progress("seasonal_context", 60);
    let seasonalContext: SeasonalContext | null = null;

    try {
      seasonalContext = extractSeasonalContext(transcriptText);
      stagesCompleted.push("seasonal_context");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stagesFailed.push("seasonal_context");
      stageErrors["seasonal_context"] = msg;
      this.logger.warn("Seasonal context extraction failed", { error: msg });
    }

    // -----------------------------------------------------------------------
    // STAGE 9: Quality assessment (deep only, AI-powered)
    // -----------------------------------------------------------------------
    progress("quality_assessment", 70);
    let qualityResult: PipelineQuality | undefined;

    if (shouldRun("quality")) {
      try {
        if (isDeep) {
          // Deep analysis: full AI-powered editorial quality assessment
          const editorialResult = await assessEditorialQuality(
            {
              title: metadata?.title ?? videoId,
              description: metadata?.description ?? undefined,
              transcript: processedText.substring(0, 3000),
              channelName: metadata?.channelName,
              entities: enrichedEntities.slice(0, 10).map((e) => ({
                commonName: e.name,
                latinName: e.scientificName ?? e.name,
              })),
            },
            {
              apiKey: this.openaiApiKey,
              logger: this.logger,
            }
          );

          totalAiCost += 0.001; // Approximate cost for editorial assessment

          qualityResult = {
            editorialTier: editorialResult.editorialTier,
            overallScore: editorialResult.overallScore,
            visualQuality: editorialResult.visualQuality,
            contentDepth: editorialResult.contentDepth,
            seasonalRelevance: editorialResult.seasonalRelevance,
            designContext: editorialResult.designContext,
            narrativeStructure: editorialResult.narrativeStructure,
            botanicalLiteracy: editorialResult.botanicalLiteracy,
            standfirst: editorialResult.standfirst,
            editorialNotes: editorialResult.editorialNotes,
          };
        } else {
          // Standard: lightweight heuristic quality assessment (no AI call)
          qualityResult = this.estimateQuality(
            enrichedEntities,
            commerceItems,
            seasonalContext,
          );
        }

        stagesCompleted.push("quality_assessment");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stagesFailed.push("quality_assessment");
        stageErrors["quality_assessment"] = msg;
        this.logger.warn("Quality assessment failed", { error: msg });
      }
    }

    // -----------------------------------------------------------------------
    // STAGE 10: Skill extraction (deep only, AI-powered)
    // -----------------------------------------------------------------------
    progress("skill_extraction", 80);
    let skillsResult: PipelineSkills | undefined;

    if (shouldRun("skills")) {
      try {
        if (isDeep) {
          // Deep analysis: full AI-powered skill extraction
          const skillAnalysis = await extractVideoSkills(
            processedText,
            metadata?.title ?? videoId,
            {
              apiKey: this.openaiApiKey,
              logger: this.logger,
            },
            metadata?.description ?? undefined,
          );

          totalAiCost += 0.002; // Approximate cost for skill extraction

          skillsResult = {
            primary: skillAnalysis.primarySkill
              ? {
                  name: skillAnalysis.primarySkill.name,
                  displayName: skillAnalysis.primarySkill.displayName,
                  level: skillAnalysis.primarySkill.skillLevel,
                  teachingQuality: skillAnalysis.quality.overallScore,
                  category: skillAnalysis.primarySkill.category,
                }
              : null,
            secondarySkills: skillAnalysis.secondarySkills.map((s) => ({
              name: s.name,
              displayName: s.displayName,
              level: s.skillLevel,
              category: s.category,
            })),
            prerequisites: skillAnalysis.sequencing.prerequisiteSkills,
            nextSkills: skillAnalysis.sequencing.nextSkillSuggestions,
            intent: skillAnalysis.intent
              ? {
                  type: skillAnalysis.intent.type,
                  reformulatedTitle: skillAnalysis.intent.reformulatedTitle,
                }
              : undefined,
          };
        } else {
          // Standard: basic skill inference from AI actions (no extra AI call)
          skillsResult = this.inferSkillsFromActions(aiResult);
        }

        stagesCompleted.push("skill_extraction");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stagesFailed.push("skill_extraction");
        stageErrors["skill_extraction"] = msg;
        this.logger.warn("Skill extraction failed", { error: msg });
      }
    }

    // -----------------------------------------------------------------------
    // STAGE 11: Market position
    // -----------------------------------------------------------------------
    progress("market_position", 90);
    let marketResult: PipelineMarket | undefined;

    if (shouldRun("market")) {
      try {
        marketResult = {
          seasonalContext,
          commercialPotential: undefined,
        };

        // If we have enough data, run category potential scoring
        if (enrichedEntities.length > 0) {
          const candidate = {
            id: videoId,
            candidateName: metadata?.title ?? videoId,
            keywords: {
              primary: enrichedEntities
                .slice(0, 5)
                .map((e) => e.name),
              secondary: commerceItems
                .slice(0, 5)
                .map((item) => item.name),
            },
            videoMentionCount: enrichedEntities.length,
            firstDetected: new Date(),
          };

          const potentialScore = scoreCategoryPotential(candidate, []);
          marketResult.commercialPotential = {
            overallPotential: potentialScore.overallPotential,
            commercialPotential: potentialScore.commercialPotential,
            learningPotential: potentialScore.learningPotential,
            recommendedAction: potentialScore.recommendedAction,
          };
        }

        stagesCompleted.push("market_position");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stagesFailed.push("market_position");
        stageErrors["market_position"] = msg;
        this.logger.warn("Market position analysis failed", { error: msg });
      }
    }

    // -----------------------------------------------------------------------
    // STAGE 12: Monetization summary
    // -----------------------------------------------------------------------
    let monetizationResult: PipelineMonetization | undefined;

    if (shouldRun("monetization")) {
      const shoppableCount = enrichedEntities.filter((e) => e.isShoppable).length;
      const intentScore = aiResult?.commercialIntent?.score ?? 0;

      monetizationResult = {
        commercialIntentScore: intentScore,
        hasShoppableItems: shoppableCount > 0 || commerceItems.length > 0,
        recommendations: aiResult?.commercialIntent?.recommendations ?? [],
        entityCount: enrichedEntities.length,
        shoppableEntityCount: shoppableCount,
        commerceItemCount: commerceItems.length,
      };
    }

    // -----------------------------------------------------------------------
    // Assemble final result
    // -----------------------------------------------------------------------
    progress("assemble_result", 95);

    const commercialIntentScore =
      monetizationResult?.commercialIntentScore ??
      aiResult?.commercialIntent?.score ??
      0;

    const result: PipelineResult = {
      videoId,
      title: metadata?.title ?? "[Unknown title]",
      channel: metadata?.channelName ?? "[Unknown channel]",
      durationSeconds: metadata?.duration ?? 0,
      language: aiResult?.language?.code ?? metadata?.defaultLanguage ?? "en",
      analysisTimestamp: new Date().toISOString(),
      analysisDepth: request.analysisDepth,
      commercialIntentScore,

      // Conditionally include dimensions
      ...(shouldRun("entities") && { entities: enrichedEntities }),
      ...(shouldRun("entities") && { commerceItems }),
      ...(shouldRun("monetization") && { monetization: monetizationResult }),
      ...(shouldRun("audience") && { audience: audienceResult }),
      ...(shouldRun("quality") && { quality: qualityResult }),
      ...(shouldRun("skills") && { skills: skillsResult }),
      ...(shouldRun("market") && { market: marketResult }),

      _meta: {
        pipelineVersion: PIPELINE_VERSION,
        processingTimeMs: Date.now() - startTime,
        aiCostUsd: totalAiCost,
        cacheHit: false,
        stagesCompleted,
        stagesFailed,
        stageErrors,
        transcriptTokenReduction: tokenReduction,
      },
    };

    // -----------------------------------------------------------------------
    // STAGE 13: Cache result
    // -----------------------------------------------------------------------
    if (this.cache) {
      try {
        this.cache.set(videoId, result, {
          depth: request.analysisDepth,
          toolName: "analyze_video",
        });
        stagesCompleted.push("cache_store");
      } catch (err) {
        this.logger.warn("Cache storage failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    progress("complete", 100);

    this.logger.info("Pipeline complete", {
      videoId,
      depth: request.analysisDepth,
      processingTimeMs: result._meta.processingTimeMs,
      stagesCompleted: stagesCompleted.length,
      stagesFailed: stagesFailed.length,
      aiCostUsd: totalAiCost.toFixed(4),
    });

    return result;
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Build pipeline entities by merging AI output with NER enrichment data.
   */
  private buildPipelineEntities(
    aiEntities: NonNullable<VideoProcessingResult["entities"]>,
    enhancedEntities: EnhancedEntity[],
  ): PipelineEntity[] {
    return aiEntities.map((aiEntity, index) => {
      const enhanced = enhancedEntities[index];

      return {
        name: aiEntity.name,
        scientificName: aiEntity.scientificName,
        category: aiEntity.category,
        confidence: enhanced
          ? enhanced.confidence
          : (aiEntity.confidence ?? 50) / 100,
        isShoppable: aiEntity.isShoppable,
        mentions: (aiEntity.mentions ?? []).map((m) => ({
          timestamp: m.timestamp,
          context: m.text,
        })),
        // NER enrichment
        plantId: enhanced?.plantId,
        taxonomyLevel: enhanced?.taxonomyLevel,
        disambiguated: enhanced?.disambiguated ?? false,
        disambiguationMethod: enhanced?.disambiguationMethod,
      };
    });
  }

  /**
   * Estimate quality heuristically for standard depth (no AI call).
   */
  private estimateQuality(
    entities: PipelineEntity[],
    commerceItems: PipelineCommerceItem[],
    seasonalContext: SeasonalContext | null,
  ): PipelineQuality {
    // Simple heuristic scoring based on available data
    const entityCount = entities.length;
    const avgConfidence =
      entities.length > 0
        ? entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length
        : 0;

    const botanicalLiteracy = Math.min(
      100,
      entityCount * 8 + (avgConfidence > 0.7 ? 20 : 0)
    );
    const contentDepth = Math.min(
      100,
      entityCount * 5 + commerceItems.length * 10
    );
    const seasonalRelevance = seasonalContext?.confidence
      ? Math.round(seasonalContext.confidence * 100)
      : 30;

    const overallScore = Math.round(
      (botanicalLiteracy + contentDepth + seasonalRelevance) / 3
    );

    let editorialTier: string;
    if (overallScore >= 70) {
      editorialTier = "FEATURED";
    } else if (overallScore >= 60) {
      editorialTier = "SUPPORTING";
    } else {
      editorialTier = "ARCHIVE";
    }

    return {
      editorialTier,
      overallScore,
      visualQuality: 50, // Cannot assess without thumbnail analysis
      contentDepth,
      seasonalRelevance,
      designContext: 50, // Cannot assess without AI
      narrativeStructure: 50, // Cannot assess without AI
      botanicalLiteracy,
      editorialNotes: [
        `Heuristic assessment (standard depth). ${entityCount} entities detected.`,
        `Average entity confidence: ${(avgConfidence * 100).toFixed(0)}%`,
      ],
    };
  }

  /**
   * Infer basic skills from AI actions output (no extra AI call).
   */
  private inferSkillsFromActions(
    aiResult: VideoProcessingResult | null,
  ): PipelineSkills {
    if (!aiResult?.actions || aiResult.actions.length === 0) {
      return {
        primary: null,
        secondarySkills: [],
        prerequisites: [],
        nextSkills: [],
      };
    }

    // Use the most frequent action category as primary skill
    const categoryCounts: Record<string, number> = {};
    for (const action of aiResult.actions) {
      const cat = action.category.toLowerCase();
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    }

    const sortedCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a);

    const primaryCategory = sortedCategories[0]?.[0] ?? "other";
    const primaryAction = aiResult.actions.find(
      (a) => a.category.toLowerCase() === primaryCategory
    );

    return {
      primary: primaryAction
        ? {
            name: primaryAction.keyword,
            displayName: primaryAction.label,
            level: "beginner", // Cannot determine without AI
            teachingQuality: 50, // Cannot assess without AI
            category: primaryCategory,
          }
        : null,
      secondarySkills: sortedCategories.slice(1, 4).map(([cat]) => {
        const action = aiResult.actions!.find(
          (a) => a.category.toLowerCase() === cat
        );
        return {
          name: action?.keyword ?? cat,
          displayName: action?.label ?? cat,
          level: "beginner",
          category: cat,
        };
      }),
      prerequisites: [],
      nextSkills: [],
    };
  }

  /**
   * Build a minimal result when the pipeline cannot proceed (e.g., no transcript).
   */
  private buildMinimalResult(
    videoId: string,
    request: AnalysisRequest,
    startTime: number,
    stagesCompleted: string[],
    stagesFailed: string[],
    stageErrors: Record<string, string>,
    aiCostUsd: number,
  ): PipelineResult {
    return {
      videoId,
      title: "[Unavailable]",
      channel: "[Unavailable]",
      durationSeconds: 0,
      language: "en",
      analysisTimestamp: new Date().toISOString(),
      analysisDepth: request.analysisDepth,
      commercialIntentScore: 0,
      _meta: {
        pipelineVersion: PIPELINE_VERSION,
        processingTimeMs: Date.now() - startTime,
        aiCostUsd,
        cacheHit: false,
        stagesCompleted,
        stagesFailed,
        stageErrors,
      },
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a PipelineOrchestrator instance.
 *
 * @param openaiApiKey - OpenAI API key. Defaults to OPENAI_API_KEY env var.
 * @param options - Additional options (cache, dictionary, logger, youtubeApiKey).
 */
export function createPipelineOrchestrator(
  openaiApiKey?: string,
  options?: Partial<Omit<PipelineOptions, "openaiApiKey">>,
): PipelineOrchestrator {
  const key = openaiApiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is required for the pipeline orchestrator");
  }

  return new PipelineOrchestrator({
    openaiApiKey: key,
    ...options,
  });
}
