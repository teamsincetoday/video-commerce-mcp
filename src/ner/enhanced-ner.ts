/**
 * Enhanced NER — Core Named Entity Recognition Pipeline
 *
 * Extracts and enriches plant entities from preprocessed transcripts.
 * The main orchestrating function for the NER pipeline:
 * 1. Preprocess transcript (via multi-category preprocessor)
 * 2. Extract potential genera for variety hints
 * 3. Resolve entities against plant dictionary
 * 4. Disambiguate genus-only detections
 * 5. Track performance metrics
 *
 * Ported from monolith lib/services/enhanced-ner.ts.
 * All business logic preserved; Prisma/Redis/budget/prompt-evolution
 * dependencies removed. The function now takes explicit dependencies
 * as parameters (dictionary, AI client) instead of global singletons.
 */

import type {
  Entity,
  EnhancedEntity,
  PlantDictionary,
  AIClient,
  Logger,
} from "../types.js";
import { defaultLogger } from "../types.js";
import {
  extractPotentialGeneraFromText,
  getVarietyHintsForGenera,
  formatVarietyHintsForPrompt,
} from "./variety-hint-provider.js";

/**
 * Options for entity extraction.
 */
export interface ExtractEntitiesOptions {
  /** Plant dictionary for resolution and disambiguation */
  dictionary: PlantDictionary;
  /** Optional AI client for disambiguation of close matches */
  aiClient?: AIClient;
  /** Logger instance */
  logger?: Logger;
  /** Vertical identifier (default: 'gardening') */
  vertical?: string;
}

/**
 * Input data for entity extraction.
 * This replaces the monolith's direct Prisma queries and global state.
 */
export interface ExtractEntitiesInput {
  /** Raw entities from the NER extraction (e.g., from GPT) */
  rawEntities: Entity[];
  /** Full transcript text (used for variety hint extraction) */
  transcript: string;
  /** Video title (used for disambiguation context) */
  videoTitle: string;
  /** Optional video description (reserved for future disambiguation improvements) */
  videoDescription?: string;
}

/**
 * Performance metrics from the extraction.
 */
export interface ExtractionMetrics {
  totalEntities: number;
  disambiguated: number;
  genusOnlyCount: number;
  avgConfidence: number;
  processingTimeMs: number;
  varietyHintsUsed: number;
}

/**
 * Result of the enhanced entity extraction.
 */
export interface EnhancedExtractionResult {
  entities: EnhancedEntity[];
  metrics: ExtractionMetrics;
  /** Formatted variety hints string (can be passed to NER prompt) */
  varietyHintsForPrompt: string;
}

/**
 * Extract and enhance entities with disambiguation and dictionary resolution.
 *
 * This is the core function that takes raw NER output and enriches it with:
 * - Dictionary lookups (exact and fuzzy matching)
 * - Disambiguation for genus-only detections
 * - Variety hints for improving extraction accuracy
 */
export async function enhanceExtractedEntities(
  input: ExtractEntitiesInput,
  options: ExtractEntitiesOptions,
): Promise<EnhancedExtractionResult> {
  const {
    dictionary,
    aiClient,
    logger = defaultLogger,
    vertical = "gardening",
  } = options;
  const { rawEntities, transcript, videoTitle } = input;

  const startTime = Date.now();

  logger.info("Starting entity enhancement", {
    rawEntityCount: rawEntities.length,
  });

  // Step 1: Extract potential genera for variety hints
  const potentialGenera = extractPotentialGeneraFromText(transcript);
  logger.info("Found potential genera", {
    count: potentialGenera.length,
    genera: potentialGenera.join(", "),
  });

  let varietyHintsFormatted = "";
  let varietyHintsUsed = 0;

  if (potentialGenera.length > 0) {
    const varietyHintsMap = getVarietyHintsForGenera(
      potentialGenera,
      dictionary,
      logger,
    );

    if (varietyHintsMap.size > 0) {
      varietyHintsFormatted = formatVarietyHintsForPrompt(varietyHintsMap);
      varietyHintsUsed = Array.from(varietyHintsMap.values()).reduce(
        (sum, hints) => sum + hints.length,
        0,
      );
      logger.info("Variety hints loaded", {
        totalHints: varietyHintsUsed,
        generaCount: varietyHintsMap.size,
      });
    }
  }

  // Step 2: Process each entity with disambiguation and enrichment
  const enhancedEntities: EnhancedEntity[] = [];
  let genusOnlyCount = 0;
  let totalConfidence = 0;
  let disambiguatedCount = 0;

  for (const entity of rawEntities) {
    const latinName = entity.metadata.latinName as string | undefined;
    const commonName = entity.entity;
    const taxonomyLevel = entity.metadata.taxonomyLevel as string | undefined;
    const complexity = entity.metadata.complexity as
      | Record<string, number>
      | undefined;

    // Check if this needs disambiguation (genus-only)
    const needsDisambiguation =
      taxonomyLevel === "genus" ||
      (!!latinName && !latinName.includes(" ") && latinName.length > 0);

    if (needsDisambiguation) {
      genusOnlyCount++;
    }

    let plantId: string | undefined;
    let disambiguated = false;
    let disambiguationMethod: string | undefined;

    // Step 2a: Try to resolve to a plant in dictionary
    if (latinName) {
      const byLatin = dictionary.findByLatinName(latinName);
      if (byLatin) {
        plantId = byLatin.latinName.toLowerCase().replace(/\s+/g, "_");
        logger.info("Resolved latin name to plant", {
          latinName,
          canonicalName: plantId,
        });
      }
    }

    // Try common name if Latin name didn't match
    if (!plantId && commonName) {
      const byCommon = dictionary.findByName(commonName);
      if (byCommon) {
        plantId = byCommon.latinName.toLowerCase().replace(/\s+/g, "_");
        logger.info("Resolved common name to plant", {
          commonName,
          canonicalName: plantId,
        });
      }
    }

    // Step 2b: If genus-only or not found, try disambiguation
    if (!plantId && needsDisambiguation && latinName && aiClient) {
      logger.info("Attempting disambiguation", { latinName });

      // Use the entity disambiguation module
      const { disambiguateEntity } = await import(
        "./entity-disambiguation.js"
      );

      const disambiguationResult = await disambiguateEntity(
        {
          entityName: latinName,
          context: entity.context,
          timestamp: entity.timestamp,
          videoTitle,
          nearbyEntities: rawEntities
            .filter((e) => e !== entity)
            .map((e) => e.entity)
            .slice(0, 5),
          vertical,
        },
        { dictionary, aiClient, logger },
      );

      if (disambiguationResult.resolved && disambiguationResult.selectedCandidate) {
        plantId = disambiguationResult.selectedCandidate.id;
        disambiguated = true;
        disambiguationMethod = "ai_disambiguation";
        entity.confidence = disambiguationResult.confidence;
        disambiguatedCount++;

        logger.info("Disambiguated plant", {
          latinName,
          plantId,
          confidence: disambiguationResult.confidence,
        });
      } else {
        logger.info("Could not disambiguate", { latinName });
      }
    }

    // Step 2c: If still not found but high confidence, use as-is
    if (!plantId && latinName && entity.confidence >= 0.7) {
      // In standalone mode, we don't auto-create database entries.
      // Instead, we assign a derived ID and flag it as unresolved.
      plantId = latinName.toLowerCase().replace(/\s+/g, "_");
      logger.info("Unresolved entity with high confidence", {
        latinName,
        derivedId: plantId,
      });
    }

    totalConfidence += entity.confidence;

    enhancedEntities.push({
      ...entity,
      plantId,
      taxonomyLevel: taxonomyLevel as string | undefined,
      disambiguated,
      disambiguationMethod,
      targetAudience: entity.metadata.targetAudience as string | undefined,
      cognitiveComplexity: complexity?.cognitive,
      practicalComplexity: complexity?.practical,
      emotionalComplexity: complexity?.emotional,
    });
  }

  // Step 3: Compute metrics
  const processingTime = Date.now() - startTime;
  const avgConfidence =
    rawEntities.length > 0 ? totalConfidence / rawEntities.length : 0;

  const metrics: ExtractionMetrics = {
    totalEntities: enhancedEntities.length,
    disambiguated: disambiguatedCount,
    genusOnlyCount,
    avgConfidence,
    processingTimeMs: processingTime,
    varietyHintsUsed,
  };

  logger.info("Entity enhancement complete", {
    processingTimeMs: processingTime,
    totalEntities: enhancedEntities.length,
    disambiguated: disambiguatedCount,
    genusOnly: genusOnlyCount,
    avgConfidencePct: (avgConfidence * 100).toFixed(1),
  });

  return {
    entities: enhancedEntities,
    metrics,
    varietyHintsForPrompt: varietyHintsFormatted,
  };
}
