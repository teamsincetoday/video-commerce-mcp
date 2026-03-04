/**
 * Confidence Calibration System
 *
 * Multi-factor confidence scoring for entity extraction.
 * Product-category agnostic: works for any type of entity.
 *
 * Ported from monolith lib/services/confidence-calibration.ts.
 * All business logic preserved; Prisma/Redis/logger dependencies removed.
 */

import type {
  CalibrationFactors,
  CalibratedResult,
  Logger,
} from "../types.js";
import { defaultLogger } from "../types.js";

/**
 * Calibrate confidence score using multiple factors.
 */
export function calibrateConfidence(
  rawConfidence: number,
  factors: CalibrationFactors,
): CalibratedResult {
  const warnings: string[] = [];
  let calibrated = rawConfidence;

  // Track individual bonuses for transparency
  const breakdown = {
    baseScore: rawConfidence,
    patternBonus: 0,
    dictionaryBonus: 0,
    temporalBonus: 0,
    contextBonus: 0,
    varietyBonus: 0,
    coOccurrenceBonus: 0,
    visualBonus: 0,
    metadataBonus: 0,
  };

  // 1. Pattern Match Bonus (up to +15%)
  if (factors.patternMatch) {
    const bonus = 0.15 * rawConfidence;
    calibrated += bonus;
    breakdown.patternBonus = bonus;
  }

  // 2. Dictionary Validation Bonus (up to +20%)
  if (factors.existsInDictionary) {
    let bonus = 0.2 * rawConfidence;
    if (factors.dictionaryConfidence) {
      // Scale bonus by dictionary match quality
      bonus *= factors.dictionaryConfidence;
    }
    calibrated += bonus;
    breakdown.dictionaryBonus = bonus;
  } else if (rawConfidence > 0.7) {
    // Warning: high confidence but not in dictionary
    warnings.push("Entity not found in canonical dictionary");
  }

  // 3. Temporal Signals Bonus (up to +25%)
  let temporalBonus = 0;
  if (factors.multipleMentions) {
    // Multiple mentions increase confidence significantly
    const frequencyBonus =
      Math.min(factors.mentionCount / 5, 1) * 0.15 * rawConfidence;
    temporalBonus += frequencyBonus;

    // Duration bonus
    const durationBonus =
      Math.min(factors.totalDuration / 120, 1) * 0.1 * rawConfidence;
    temporalBonus += durationBonus;
  } else if (factors.mentionCount === 1 && factors.totalDuration < 15) {
    // Single, brief mention - lower confidence
    warnings.push("Only mentioned once and briefly");
  }
  calibrated += temporalBonus;
  breakdown.temporalBonus = temporalBonus;

  // 4. Context Quality Bonus (up to +10%)
  if (factors.contextQuality > 0.7) {
    const bonus = factors.contextQuality * 0.1 * rawConfidence;
    calibrated += bonus;
    breakdown.contextBonus = bonus;
  } else if (factors.contextQuality < 0.3) {
    // Poor context quality
    calibrated *= 0.9; // Reduce by 10%
    warnings.push("Context quality is low");
  }

  // 5. Variety/Specificity Bonus (up to +10%)
  if (factors.hasVariety) {
    const bonus = factors.specificityLevel * 0.1 * rawConfidence;
    calibrated += bonus;
    breakdown.varietyBonus = bonus;
  }

  // 6. Co-occurrence Bonus (up to +8%)
  if (factors.mentionedWithKnownEntities) {
    const bonus =
      Math.min(factors.coOccurrenceCount / 3, 1) * 0.08 * rawConfidence;
    calibrated += bonus;
    breakdown.coOccurrenceBonus = bonus;
  }

  // 7. Visual Confirmation Bonus (up to +20%)
  if (factors.visualConfirmation) {
    const bonus = 0.2 * rawConfidence;
    calibrated += bonus;
    breakdown.visualBonus = bonus;
  }

  // 8. YouTube Metadata Enrichment
  let metadataBonus = 0;

  // Caption type adjustment
  if (factors.captionType === "manual") {
    metadataBonus += 0.05 * rawConfidence;
  } else if (factors.captionType === "auto") {
    calibrated *= 0.95; // 5% penalty
    warnings.push("Auto-generated captions may contain ASR errors");
  }

  // Tag match bonus
  if (factors.tagMatch) {
    metadataBonus += 0.1 * rawConfidence;
  }

  // Topic match bonus
  if (factors.topicMatch) {
    metadataBonus += 0.08 * rawConfidence;
  }

  // Description mention bonus
  if (factors.descriptionMention) {
    metadataBonus += 0.12 * rawConfidence;
  }

  // Vertical confidence adjustment
  if (factors.verticalConfidence !== undefined) {
    if (factors.verticalConfidence < 0.3) {
      calibrated *= 0.85; // 15% penalty for weak vertical match
      warnings.push("Video may not match target vertical");
    } else if (factors.verticalConfidence > 0.7) {
      metadataBonus += 0.05 * rawConfidence;
    }
  }

  calibrated += metadataBonus;
  breakdown.metadataBonus = metadataBonus;

  // Cap at 1.0
  calibrated = Math.min(calibrated, 1.0);

  // Calculate adjustment factor
  const adjustmentFactor =
    rawConfidence > 0 ? calibrated / rawConfidence : 1;

  // Determine reliability tier
  let reliability: "high" | "medium" | "low";
  if (
    calibrated >= 0.85 &&
    factors.existsInDictionary &&
    factors.multipleMentions
  ) {
    reliability = "high";
  } else if (calibrated >= 0.6) {
    reliability = "medium";
  } else {
    reliability = "low";
  }

  return {
    originalConfidence: rawConfidence,
    calibratedConfidence: calibrated,
    adjustmentFactor,
    confidenceBreakdown: breakdown,
    reliability,
    warnings,
  };
}

/**
 * Assess context quality.
 * Returns 0-1 score based on context clarity.
 */
export function assessContextQuality(context: string): number {
  let score = 0.5; // Base score

  // Length check (too short = vague, too long = verbose)
  const words = context.split(/\s+/).length;
  if (words >= 5 && words <= 25) {
    score += 0.2;
  } else if (words < 3) {
    score -= 0.2;
  }

  // Contains descriptive words
  const descriptiveWords = [
    "this",
    "that",
    "beautiful",
    "lovely",
    "perfect",
    "best",
    "grows",
    "plant",
    "needs",
    "prefers",
    "loves",
    "thrives",
    "variety",
    "cultivar",
    "species",
    "type",
    "called",
    "named",
  ];
  const hasDescriptive = descriptiveWords.some((word) =>
    context.toLowerCase().includes(word),
  );
  if (hasDescriptive) {
    score += 0.15;
  }

  // Contains specific details (numbers, measurements, colors)
  const hasSpecifics =
    /\d+|tall|short|wide|narrow|red|blue|purple|yellow|white|green/i.test(
      context,
    );
  if (hasSpecifics) {
    score += 0.15;
  }

  // Not vague or generic
  const vaguePatterns = [
    /this one/i,
    /that thing/i,
    /some kind/i,
    /you know/i,
    /sort of/i,
  ];
  const isVague = vaguePatterns.some((pattern) => pattern.test(context));
  if (isVague) {
    score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate specificity level.
 * How specific is this entity identification? 0 (generic) to 1 (cultivar-level).
 */
export function calculateSpecificityLevel(entity: {
  latinName?: string;
  commonName?: string;
  variety?: string;
  subspecies?: string;
  genus?: string;
}): number {
  let level = 0;

  // Has genus (base level)
  if (entity.latinName || entity.genus) {
    level = 0.3;
  }

  // Has species (genus + species)
  if (entity.latinName && entity.latinName.split(" ").length >= 2) {
    level = 0.6;
  }

  // Has subspecies
  if (entity.subspecies) {
    level = 0.8;
  }

  // Has variety/cultivar (most specific)
  if (entity.variety) {
    level = 1.0;
  }

  return level;
}

/**
 * Batch calibrate multiple entities.
 * Includes cross-entity analysis (co-occurrences, patterns).
 */
export function batchCalibrateConfidence(
  entities: Array<{
    entity: string;
    latinName?: string;
    commonName?: string;
    variety?: string;
    subspecies?: string;
    confidence: number;
    timestamp: string;
    context: string;
    patternMatch?: boolean;
    existsInDictionary?: boolean;
  }>,
  clusterData?: Array<{
    mentions: number;
    totalDuration: number;
    coOccurrences: number;
  }>,
  logger: Logger = defaultLogger,
): Array<CalibratedResult & { entity: string }> {
  const results: Array<CalibratedResult & { entity: string }> = [];

  // Build co-occurrence map
  const entityTimestamps = new Map<string, number[]>();
  for (const entity of entities) {
    const key = entity.latinName ?? entity.entity;
    if (!entityTimestamps.has(key)) {
      entityTimestamps.set(key, []);
    }
    entityTimestamps.get(key)!.push(parseTimestamp(entity.timestamp));
  }

  // Calibrate each entity
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    if (!entity) continue;
    const cluster = clusterData?.[i];

    // Count co-occurrences
    const entityKey = entity.latinName ?? entity.entity;
    const entityTimes = entityTimestamps.get(entityKey) ?? [];
    let coOccurrenceCount = 0;
    let mentionedWithKnownEntities = false;

    for (const [otherKey, otherTimes] of entityTimestamps.entries()) {
      if (otherKey === entityKey) continue;

      // Check if any timestamps are within 60 seconds
      for (const time of entityTimes) {
        const hasNearby = otherTimes.some(
          (otherTime) => Math.abs(time - otherTime) <= 60,
        );
        if (hasNearby) {
          coOccurrenceCount++;
          // Check if other entity is in dictionary
          const otherEntity = entities.find(
            (e) => (e.latinName ?? e.entity) === otherKey,
          );
          if (otherEntity?.existsInDictionary) {
            mentionedWithKnownEntities = true;
          }
        }
      }
    }

    // Build calibration factors
    const factors: CalibrationFactors = {
      patternMatch: entity.patternMatch ?? false,
      existsInDictionary: entity.existsInDictionary ?? false,
      multipleMentions: (cluster?.mentions ?? 1) > 1,
      mentionCount: cluster?.mentions ?? 1,
      totalDuration: cluster?.totalDuration ?? 30,
      contextQuality: assessContextQuality(entity.context),
      contextLength: entity.context.length,
      hasVariety: !!entity.variety,
      specificityLevel: calculateSpecificityLevel(entity),
      mentionedWithKnownEntities,
      coOccurrenceCount,
    };

    const result = calibrateConfidence(entity.confidence, factors);

    results.push({
      ...result,
      entity: entity.entity,
    });
  }

  if (results.length > 0) {
    const avgAdjustment =
      results.reduce((sum, r) => sum + r.adjustmentFactor, 0) / results.length;
    const highReliability = results.filter(
      (r) => r.reliability === "high",
    ).length;
    logger.info("Processed confidence calibration", {
      entityCount: entities.length,
      averageAdjustmentFactor: avgAdjustment.toFixed(2),
      highReliability,
      totalResults: results.length,
    });
  }

  return results;
}

/**
 * Parse timestamp string (HH:MM:SS or MM:SS) to seconds.
 */
function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  } else if (parts.length === 2) {
    return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  }
  return 0;
}
