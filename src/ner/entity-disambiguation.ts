/**
 * Entity Disambiguation System
 *
 * Resolves ambiguous entity names using context, nearby entities,
 * and optionally AI for close-call decisions.
 * Product-category agnostic: works for any domain.
 *
 * Ported from monolith lib/services/entity-disambiguation.ts.
 * All business logic preserved; Prisma/OpenAI registry dependencies replaced
 * with PlantDictionary interface and optional AIClient.
 */

import type {
  EntityDisambiguationContext,
  DisambiguationCandidate,
  EntityDisambiguationResult,
  PlantDictionary,
  AIClient,
  Logger,
} from "../types.js";
import { defaultLogger } from "../types.js";

/**
 * Options for the disambiguation system.
 */
export interface DisambiguationOptions {
  dictionary: PlantDictionary;
  aiClient?: AIClient;
  logger?: Logger;
}

/**
 * Disambiguate entity using multiple strategies.
 */
export async function disambiguateEntity(
  context: EntityDisambiguationContext,
  options: DisambiguationOptions,
): Promise<EntityDisambiguationResult> {
  const { dictionary, aiClient, logger = defaultLogger } = options;

  logger.info("Resolving ambiguous entity", {
    entityName: context.entityName,
  });

  // Step 1: Find potential candidates from dictionary
  const candidates = findCandidates(
    context.entityName,
    dictionary,
  );

  if (candidates.length === 0) {
    return {
      originalName: context.entityName,
      resolved: false,
      selectedCandidate: null,
      alternatives: [],
      confidence: 0,
      reasoning: "No matching entities found in dictionary",
    };
  }

  if (candidates.length === 1) {
    const candidate = candidates[0];
    if (!candidate) {
      return {
        originalName: context.entityName,
        resolved: false,
        selectedCandidate: null,
        alternatives: [],
        confidence: 0,
        reasoning: "No candidate found despite length check",
      };
    }
    return {
      originalName: context.entityName,
      resolved: true,
      selectedCandidate: candidate,
      alternatives: [],
      confidence: 0.95,
      reasoning: "Exact match found in dictionary",
    };
  }

  // Step 2: Score candidates using context
  const scoredCandidates = scoreCandidates(candidates, context);

  // Step 3: Use AI if top candidates are close in score
  const topCandidate = scoredCandidates[0];
  const secondCandidate = scoredCandidates[1];

  if (!topCandidate) {
    return {
      originalName: context.entityName,
      resolved: false,
      selectedCandidate: null,
      alternatives: [],
      confidence: 0,
      reasoning: "No scored candidates available",
    };
  }

  let finalCandidate: DisambiguationCandidate = topCandidate;
  let confidence = topCandidate.matchScore;
  let reasoning = topCandidate.reason;

  // If top two are within 10% score and AI client is available, use AI
  if (
    aiClient &&
    scoredCandidates.length > 1 &&
    secondCandidate &&
    secondCandidate.matchScore >= topCandidate.matchScore * 0.9
  ) {
    logger.info("Close match, using AI for final decision");
    const aiResult = await disambiguateWithAI(
      scoredCandidates.slice(0, 3),
      context,
      aiClient,
      logger,
    );
    if (aiResult) {
      finalCandidate = aiResult.candidate;
      confidence = aiResult.confidence;
      reasoning = aiResult.reasoning;
    }
  }

  return {
    originalName: context.entityName,
    resolved: true,
    selectedCandidate: finalCandidate,
    alternatives: scoredCandidates.slice(1, 4),
    confidence,
    reasoning,
  };
}

/**
 * Batch disambiguate multiple entities.
 */
export async function batchDisambiguate(
  entities: Array<{
    entityName: string;
    context: string;
    timestamp: string;
  }>,
  globalContext: {
    videoCategory?: string;
    channelName?: string;
    videoTitle?: string;
    vertical: string;
  },
  options: DisambiguationOptions,
): Promise<Map<string, EntityDisambiguationResult>> {
  const { logger = defaultLogger } = options;
  const results = new Map<string, EntityDisambiguationResult>();

  // Build entity timeline for nearby entity detection
  const entityTimeline = entities.map((e, i) => ({
    ...e,
    index: i,
    timestampSeconds: parseTimestamp(e.timestamp),
  }));

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const timelineEntry = entityTimeline[i];

    if (!entity || !timelineEntry) continue;

    // Find nearby entities (within 60 seconds)
    const currentTime = timelineEntry.timestampSeconds;
    const nearbyEntities = entityTimeline
      .filter((e) => {
        const timeDiff = Math.abs(e.timestampSeconds - currentTime);
        return e.index !== i && timeDiff <= 60;
      })
      .map((e) => e.entityName);

    const disambiguationContext: EntityDisambiguationContext = {
      entityName: entity.entityName,
      context: entity.context,
      timestamp: entity.timestamp,
      nearbyEntities,
      ...globalContext,
    };

    const result = await disambiguateEntity(disambiguationContext, options);
    results.set(entity.entityName, result);
  }

  const resolvedCount = Array.from(results.values()).filter(
    (r) => r.resolved,
  ).length;
  logger.info("Batch disambiguation complete", {
    resolvedCount,
    totalEntities: entities.length,
  });

  return results;
}

/**
 * Detect potentially ambiguous entity names.
 * Returns entities that might need disambiguation.
 */
export function detectAmbiguousEntities(
  entities: Array<{
    entity: string;
    latinName?: string;
    commonName?: string;
    confidence: number;
  }>,
): Array<{ entity: string; reason: string }> {
  const ambiguous: Array<{ entity: string; reason: string }> = [];

  for (const entity of entities) {
    // Common name only (no Latin name)
    if (!entity.latinName && entity.commonName) {
      ambiguous.push({
        entity: entity.entity,
        reason: "Common name only - no Latin name provided",
      });
      continue;
    }

    // Single-word entity (might be incomplete)
    if (entity.entity.split(/\s+/).length === 1 && entity.confidence < 0.7) {
      ambiguous.push({
        entity: entity.entity,
        reason: "Single word with low confidence",
      });
      continue;
    }

    // Known ambiguous terms (customize per vertical)
    const knownAmbiguous = [
      "rose",
      "lily",
      "palm",
      "pine",
      "sage",
      "mint",
      "basil",
    ];
    if (
      knownAmbiguous.some((term) =>
        entity.entity.toLowerCase().includes(term),
      ) &&
      !entity.latinName
    ) {
      ambiguous.push({
        entity: entity.entity,
        reason: "Known ambiguous common name",
      });
      continue;
    }
  }

  return ambiguous;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Find candidate entities from dictionary.
 */
function findCandidates(
  entityName: string,
  dictionary: PlantDictionary,
): DisambiguationCandidate[] {
  const normalizedName = entityName.toLowerCase().trim();
  const allPlants = dictionary.getAll();

  const matchedPlants = allPlants
    .map((plant) => {
      const latinMatch = plant.latinName
        .toLowerCase()
        .includes(normalizedName);
      const commonMatch = plant.commonNames.some((name) =>
        name.toLowerCase().includes(normalizedName),
      );

      return {
        plant,
        match: latinMatch || commonMatch,
      };
    })
    .filter((entry) => entry.match)
    .slice(0, 10);

  return matchedPlants.map(({ plant }) => {
    const canonicalName = plant.latinName.toLowerCase().replace(/\s+/g, "_");

    // Calculate base match score
    let matchScore = 0;
    if (plant.latinName.toLowerCase() === normalizedName) {
      matchScore = 1.0;
    } else if (
      plant.commonNames.some(
        (name) => name.toLowerCase() === normalizedName,
      )
    ) {
      matchScore = 0.95;
    } else if (plant.latinName.toLowerCase().includes(normalizedName)) {
      matchScore = 0.7;
    } else if (
      plant.commonNames.some((name) =>
        name.toLowerCase().includes(normalizedName),
      )
    ) {
      matchScore = 0.6;
    }

    return {
      id: canonicalName,
      canonicalName,
      latinName: plant.latinName,
      commonNames: plant.commonNames,
      category: canonicalName.split("_")[0] ?? "unknown",
      matchScore,
      reason: "Dictionary match",
    };
  });
}

/**
 * Score candidates using context analysis.
 */
function scoreCandidates(
  candidates: DisambiguationCandidate[],
  context: EntityDisambiguationContext,
): DisambiguationCandidate[] {
  const scoredCandidates = candidates.map((candidate) => {
    let score = candidate.matchScore;
    let reason = candidate.reason;

    // Boost score if genus matches nearby entities
    const genus = (candidate.latinName.split(" ")[0] ?? "").toLowerCase();
    const hasRelatedEntity = context.nearbyEntities.some((entity) =>
      entity.toLowerCase().startsWith(genus),
    );
    if (hasRelatedEntity) {
      score *= 1.2;
      reason += "; Related entities mentioned nearby";
    }

    // Boost score if context contains Latin genus
    if (context.context.toLowerCase().includes(genus)) {
      score *= 1.15;
      reason += "; Genus mentioned in context";
    }

    // Boost score if variety is mentioned in context
    if (
      candidate.canonicalName.includes("_") &&
      context.context.toLowerCase().includes("variety")
    ) {
      score *= 1.1;
      reason += "; Variety context detected";
    }

    // Cap at 1.0
    score = Math.min(score, 1.0);

    return {
      ...candidate,
      matchScore: score,
      reason,
    };
  });

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.matchScore - a.matchScore);

  return scoredCandidates;
}

/**
 * Use AI to disambiguate between close candidates.
 */
async function disambiguateWithAI(
  candidates: DisambiguationCandidate[],
  context: EntityDisambiguationContext,
  aiClient: AIClient,
  logger: Logger,
): Promise<{
  candidate: DisambiguationCandidate;
  confidence: number;
  reasoning: string;
} | null> {
  try {
    const candidatesList = candidates
      .map(
        (c, i) => `${i + 1}. ${c.latinName} (${c.commonNames.join(", ")})`,
      )
      .join("\n");

    const systemPrompt =
      "You are a botanical expert. Given an ambiguous plant name and context, select the most likely candidate. Respond with JSON only: { \"selectedIndex\": number, \"confidence\": number, \"reasoning\": string }";

    const userPrompt = `Entity: "${context.entityName}"
Vertical: ${context.vertical}
Context: "${context.context}"
Video title: ${context.videoTitle ?? "unknown"}
Channel: ${context.channelName ?? "unknown"}
Nearby entities: ${context.nearbyEntities.join(", ") || "none"}

Candidates:
${candidatesList}

Which candidate (1-${candidates.length}) is the correct match?`;

    const response = await aiClient.complete({
      systemPrompt,
      userPrompt,
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 300,
    });

    const result = JSON.parse(response.content) as {
      selectedIndex: number;
      confidence: number;
      reasoning: string;
    };
    const selectedIndex = result.selectedIndex - 1; // Convert to 0-based

    if (selectedIndex >= 0 && selectedIndex < candidates.length) {
      const candidate = candidates[selectedIndex];
      if (candidate) {
        return {
          candidate,
          confidence: result.confidence,
          reasoning: result.reasoning,
        };
      }
    }

    return null;
  } catch (error) {
    logger.error(
      "AI disambiguation failed",
      error instanceof Error ? error : undefined,
    );
    return null;
  }
}

/**
 * Parse timestamp to seconds.
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
