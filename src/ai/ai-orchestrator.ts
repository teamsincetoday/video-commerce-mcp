/**
 * AI Orchestrator Service
 *
 * Unified batching service that harmonizes multiple AI tasks into
 * single API calls for cost and performance optimization.
 *
 * Benefits:
 * - 50-80% cost reduction through token efficiency
 * - 3-5x faster processing (reduced API overhead)
 * - Improved accuracy via shared context
 * - Better rate limit management
 *
 * Ported from monolith lib/services/ai-orchestrator.ts.
 * Standalone: uses OpenAI SDK directly, no monolith dependencies.
 *
 * Usage:
 * ```typescript
 * import { AIOrchestrator } from 'video-commerce-mcp';
 *
 * const orchestrator = new AIOrchestrator({ apiKey: process.env.OPENAI_API_KEY! });
 *
 * const result = await orchestrator.processVideo({
 *   transcript: '...',
 *   videoId: '...',
 *   includeLanguageDetection: true,
 *   includeEntityExtraction: true,
 *   includeCommerceItems: true,
 *   includeActions: true,
 * });
 *
 * // result.entities => [{name, confidence, ...}]
 * // result.commerceItems => [{name, category, ...}]
 * // result.actions => [{label, keyword, ...}]
 * ```
 */

import OpenAI from "openai";
import type { Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface VideoProcessingTask {
  transcript: string;
  videoId: string;
  videoTitle?: string;

  // Which tasks to include (customize per use case)
  includeLanguageDetection?: boolean;
  includeEntityExtraction?: boolean;
  includeDisambiguation?: boolean;
  includeCommercialIntent?: boolean;
  includeCommerceItems?: boolean;
  includeActions?: boolean;
}

export interface VideoProcessingResult {
  videoId: string;

  // Language detection
  language?: {
    code: string;
    name: string;
    confidence: number;
  };

  // Entity extraction
  entities?: Array<{
    name: string;
    scientificName?: string;
    category: string;
    confidence: number;
    mentions: Array<{ timestamp: string; text: string }>;
    isShoppable: boolean;
  }>;

  // Disambiguation
  disambiguated?: Array<{
    originalName: string;
    resolvedName: string;
    scientificName?: string;
    reason: string;
  }>;

  // Commercial intent
  commercialIntent?: {
    hasShoppableItems: boolean;
    score: number;
    recommendations: string[];
  };

  // Commerce items (tools, materials, products)
  commerceItems?: Array<{
    name: string;
    category:
      | "TOOL"
      | "MATERIAL"
      | "SEED"
      | "BOOK"
      | "COURSE"
      | "SERVICE"
      | "STRUCTURE"
      | "EVENT"
      | "OTHER";
    timestamp?: string;
    confidence: number; // 0-100
    context?: string;
  }>;

  // Action intents (things viewers can do)
  actions?: Array<{
    category:
      | "PLANTING"
      | "PRUNING"
      | "WATERING"
      | "FERTILIZING"
      | "HARVESTING"
      | "MAINTENANCE"
      | "DESIGN"
      | "TROUBLESHOOTING"
      | "OTHER";
    label: string;
    text: string;
    keyword: string;
    timestamp?: string;
  }>;

  // Metadata
  tokensUsed: number;
  processingTimeMs: number;
  costEstimate: number;
}

export interface AffiliateProcessingTask {
  programs: Array<{
    id: string;
    name: string;
    description?: string;
    programTerms?: string;
    programUrl?: string;
  }>;
}

export interface AffiliateProcessingResult {
  programs: Array<{
    id: string;
    isRelevant: boolean;
    relevanceScore: number;
    reason: string;
    verticals: {
      supportsPlants: boolean;
      supportsSeeds: boolean;
      supportsTools: boolean;
      supportsMaterials: boolean;
      supportsBooks: boolean;
      supportsMedia: boolean;
      supportsCourses: boolean;
      supportsEvents: boolean;
      supportsGardenShows: boolean;
    };
    location?: {
      country?: string;
      city?: string;
      confidence: number;
    };
  }>;
  tokensUsed: number;
  processingTimeMs: number;
  costEstimate: number;
}

export interface OrchestratorStats {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  callsSaved: number;
  tokensSaved: number;
  costSaved: number;
  avgTokensPerCall: number;
  avgCostPerCall: string;
  savingsPercentage: string;
}

export interface AIOrchestratorOptions {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  logger?: Logger;
}

// ============================================================================
// COST CONSTANTS
// ============================================================================

/** GPT-4o-mini pricing: $0.150 per 1M input tokens */
const GPT4O_MINI_INPUT_COST_PER_TOKEN = 0.00000015;

/** GPT-4o-mini pricing: $0.600 per 1M output tokens */
const GPT4O_MINI_OUTPUT_COST_PER_TOKEN = 0.0000006;

// ============================================================================
// AI ORCHESTRATOR CLASS
// ============================================================================

export class AIOrchestrator {
  private openai: OpenAI;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private logger: Logger;

  private stats = {
    totalCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    callsSaved: 0,
    tokensSaved: 0,
    costSaved: 0,
  };

  constructor(options: AIOrchestratorOptions) {
    this.openai = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model ?? "gpt-4o-mini";
    this.temperature = options.temperature ?? 0.3;
    this.maxTokens = options.maxTokens ?? 3000;
    this.logger = options.logger ?? defaultLogger;
  }

  /**
   * Process video with multiple AI tasks in a single API call.
   * This is the core of the MCP -- a single GPT call returns up to 6 structured outputs.
   */
  async processVideo(
    task: VideoProcessingTask
  ): Promise<VideoProcessingResult> {
    const startTime = Date.now();

    // Build unified prompt that handles all requested tasks
    const userPrompt = this.buildVideoProcessingPrompt(task);

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a gardening content analysis expert. Analyze the provided video transcript and return a JSON object with the requested analysis tasks. Be thorough and accurate. Respond with valid JSON only.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      let content = response.choices[0]?.message?.content ?? "{}";

      // Remove markdown code blocks if present (```json ... ```)
      content = content
        .replace(/^```(?:json)?\s*\n?/gm, "")
        .replace(/\n?```\s*$/gm, "")
        .trim();

      const result = JSON.parse(content);

      // Calculate metrics
      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;
      const tokensUsed = promptTokens + completionTokens;
      const processingTimeMs = Date.now() - startTime;
      const costEstimate =
        promptTokens * GPT4O_MINI_INPUT_COST_PER_TOKEN +
        completionTokens * GPT4O_MINI_OUTPUT_COST_PER_TOKEN;

      // Update stats
      this.updateStats(tokensUsed, costEstimate, task);

      return {
        videoId: task.videoId,
        language: result.language,
        entities: result.entities,
        disambiguated: result.disambiguated,
        commercialIntent: result.commercialIntent,
        commerceItems: result.commerceItems,
        actions: result.actions,
        tokensUsed,
        processingTimeMs,
        costEstimate,
      };
    } catch (error) {
      this.logger.error(
        "AI Orchestrator error",
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Process affiliate programs with batched relevance + location analysis.
   */
  async processAffiliatePrograms(
    task: AffiliateProcessingTask
  ): Promise<AffiliateProcessingResult> {
    const startTime = Date.now();

    const userPrompt = this.buildAffiliateBatchPrompt(task);

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing affiliate programs for gardening relevance and extracting supplier locations. Respond with valid JSON only.",
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: this.temperature,
        max_tokens: 2000,
      });

      let content = response.choices[0]?.message?.content ?? "{}";

      // Remove markdown code blocks if present (```json ... ```)
      content = content
        .replace(/^```(?:json)?\s*\n?/gm, "")
        .replace(/\n?```\s*$/gm, "")
        .trim();

      const result = JSON.parse(content);

      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;
      const tokensUsed = promptTokens + completionTokens;
      const processingTimeMs = Date.now() - startTime;
      const costEstimate =
        promptTokens * GPT4O_MINI_INPUT_COST_PER_TOKEN +
        completionTokens * GPT4O_MINI_OUTPUT_COST_PER_TOKEN;

      // Calculate savings (vs individual calls)
      const unbatchedCalls = task.programs.length * 2; // 2 calls per program
      const callsSaved = unbatchedCalls - 1;
      const tokensSaved = tokensUsed * 0.4; // Estimate 40% token savings
      const costSaved = costEstimate * 0.5; // Estimate 50% cost savings

      this.stats.callsSaved += callsSaved;
      this.stats.tokensSaved += tokensSaved;
      this.stats.costSaved += costSaved;

      return {
        programs: result.programs,
        tokensUsed,
        processingTimeMs,
        costEstimate,
      };
    } catch (error) {
      this.logger.error(
        "Affiliate batch processing error",
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  }

  /**
   * Build unified prompt for video processing.
   *
   * CRITICAL: These prompts are core IP. Every word matters for extraction quality.
   * Do not modify without A/B testing the change.
   */
  private buildVideoProcessingPrompt(task: VideoProcessingTask): string {
    const tasks: string[] = [];
    const jsonStructure: Record<string, unknown> = {};

    if (task.includeLanguageDetection) {
      tasks.push("1. Detect the language of the transcript");
      jsonStructure.language = {
        code: "ISO 639-1 language code",
        name: "Full language name",
        confidence: "number 0-100",
      };
    }

    if (task.includeEntityExtraction) {
      tasks.push(
        "2. Extract ALL plant entities mentioned throughout the ENTIRE transcript",
        "   Be COMPREHENSIVE - include EVERY plant, flower, vegetable, herb, tree, shrub mentioned:",
        "   - Look for both common names AND scientific names",
        "   - Include obvious plants (roses, tomatoes) AND less common ones",
        "   - Include plants mentioned in passing, even briefly",
        "   - Include vegetables, herbs, fruits, ornamentals, trees, shrubs, perennials, annuals",
        "   - Include wild plants and cultivated plants",
        "   IMPORTANT: Extract AT LEAST 10-15 plants if this is a typical gardening show episode",
        "   Include full botanical details when available:",
        "   - Common name (e.g., \"Mexican sunflower\")",
        '   - Scientific name (e.g., "Tithonia rotundifolia")',
        "   - Variety/cultivar (e.g., \"Sahin's Early\", \"Hidcote\") - include in BOTH name and scientificName",
        "   When in doubt about whether something is a plant mention, INCLUDE IT with lower confidence"
      );
      jsonStructure.entities = [
        {
          name: 'Common name with variety (e.g., "Helenium \'Sahin\'s Early\'")',
          scientificName:
            'Full scientific name with variety (e.g., "Helenium \'Sahin\'s Early\'")',
          category: "plants",
          confidence: "number 0-100",
          mentions: [{ timestamp: "HH:MM:SS or null", text: "context snippet" }],
          isShoppable: "boolean - can this be purchased?",
        },
      ];
    }

    if (task.includeDisambiguation) {
      tasks.push(
        "3. Disambiguate any ambiguous plant names (e.g., \"Rose\" -> Rosa genus vs rose hip)"
      );
      jsonStructure.disambiguated = [
        {
          originalName: "Ambiguous name from transcript",
          resolvedName: "Resolved/preferred name",
          scientificName: "Scientific name if applicable",
          reason: "Brief explanation of disambiguation",
        },
      ];
    }

    if (task.includeCommercialIntent) {
      tasks.push(
        "4. Analyze commercial intent - identify products viewers might want to buy"
      );
      jsonStructure.commercialIntent = {
        hasShoppableItems: "boolean",
        score: "number 0-100 indicating shopping potential",
        recommendations: ["List of specific products mentioned to sell"],
      };
    }

    if (task.includeCommerceItems) {
      tasks.push(
        "5. Extract shoppable items (tools, materials, seeds, books, courses, etc.)",
        "   IMPORTANT: DO NOT include plant species, varieties, or cultivars as commerce items.",
        "   Plants are extracted separately in step 2. Only extract NON-PLANT commercial products:",
        "   - TOOL: stakes, pruners, spades, trowels, knives, secateurs, watering cans, etc.",
        "   - MATERIAL: compost, fertilizer, grit, sand, perlite, mulch, peat-free compost, etc.",
        "   - SEED: seed packets (but NOT live plants)",
        "   - STRUCTURE: pots, containers, raised beds, greenhouse, cold frames, etc.",
        "   - BOOK/COURSE: gardening books, online courses, workshops",
        "   - SERVICE: garden design, landscaping services",
        "   - OTHER: anything else shoppable that is NOT a plant",
        "   TIMESTAMP REQUIREMENT: For each item, find the timestamp where it is mentioned in the transcript.",
        "   Look for the [HH:MM:SS] or [MM:SS] marker in the transcript near where the item is discussed.",
        "   Use the EARLIEST timestamp where the item is first mentioned or shown."
      );
      jsonStructure.commerceItems = [
        {
          name: "Product/tool name (NOT plant names)",
          category:
            "TOOL|MATERIAL|SEED|BOOK|COURSE|SERVICE|STRUCTURE|EVENT|OTHER",
          timestamp:
            "HH:MM:SS from transcript (REQUIRED - find where this item is mentioned)",
          confidence: "number 0-100",
          context: "Brief context where it was mentioned",
        },
      ];
    }

    if (task.includeActions) {
      tasks.push(
        "6. Extract action intents (gardening activities viewers learn about)",
        "   TIMESTAMP REQUIREMENT: For each action, find the timestamp where it is demonstrated or discussed.",
        "   Look for the [HH:MM:SS] or [MM:SS] marker in the transcript near where the action occurs.",
        "   Use the timestamp where the action is FIRST mentioned or demonstrated."
      );
      jsonStructure.actions = [
        {
          category:
            "PLANTING|PRUNING|WATERING|FERTILIZING|HARVESTING|MAINTENANCE|DESIGN|TROUBLESHOOTING|OTHER",
          label: 'Clear action description (e.g., "Plant tomato seeds")',
          text: "Full context from transcript",
          keyword: 'Main action verb (e.g., "plant", "prune")',
          timestamp:
            "HH:MM:SS from transcript (REQUIRED - find where this action occurs)",
        },
      ];
    }

    return `Analyze this gardening video transcript:

**Video Title:** ${task.videoTitle ?? "Unknown"}
**Video ID:** ${task.videoId}

**Transcript:**
${task.transcript.slice(0, 100000)} ${task.transcript.length > 100000 ? "...(truncated)" : ""}

**Tasks:**
${tasks.join("\n")}

**Required JSON Structure:**
\`\`\`json
${JSON.stringify(jsonStructure, null, 2)}
\`\`\`

Respond with valid JSON matching the structure above.`;
  }

  /**
   * Build batched prompt for affiliate program analysis.
   */
  private buildAffiliateBatchPrompt(task: AffiliateProcessingTask): string {
    const programsText = task.programs
      .map(
        (p, i) => `
### Program ${i + 1}
ID: ${p.id}
Name: ${p.name}
Description: ${p.description ?? "N/A"}
Program Terms: ${p.programTerms ?? "N/A"}
URL: ${p.programUrl ?? "N/A"}
`
      )
      .join("\n");

    return `Analyze these ${task.programs.length} affiliate programs for gardening relevance and extract supplier locations.

${programsText}

For EACH program, determine:
1. **Relevance:** Is it related to gardening? (plants, seeds, tools, materials, books, courses, events, garden shows)
2. **Verticals:** Which specific categories does it support?
3. **Location:** What is the supplier's country and city?

Respond with JSON:
\`\`\`json
{
  "programs": [
    {
      "id": "program ID from above",
      "isRelevant": boolean,
      "relevanceScore": number 0-100,
      "reason": "brief explanation",
      "verticals": {
        "supportsPlants": boolean,
        "supportsSeeds": boolean,
        "supportsTools": boolean,
        "supportsMaterials": boolean,
        "supportsBooks": boolean,
        "supportsMedia": boolean,
        "supportsCourses": boolean,
        "supportsEvents": boolean,
        "supportsGardenShows": boolean
      },
      "location": {
        "country": "full country name or null",
        "city": "city name or null",
        "confidence": number 0-100
      }
    }
  ]
}
\`\`\`

Be strict: only mark as relevant if DIRECTLY related to gardening (not general home/lifestyle).`;
  }

  /**
   * Update statistics.
   */
  private updateStats(
    tokensUsed: number,
    cost: number,
    task: VideoProcessingTask
  ): void {
    this.stats.totalCalls++;
    this.stats.totalTokens += tokensUsed;
    this.stats.totalCost += cost;

    // Calculate what it would have cost unbatched
    let unbatchedCalls = 0;
    if (task.includeLanguageDetection) unbatchedCalls++;
    if (task.includeEntityExtraction) unbatchedCalls++;
    if (task.includeDisambiguation) unbatchedCalls += 3; // Typical 3 entities
    if (task.includeCommercialIntent) unbatchedCalls++;
    if (task.includeCommerceItems) unbatchedCalls++;
    if (task.includeActions) unbatchedCalls++;

    this.stats.callsSaved += Math.max(0, unbatchedCalls - 1);

    // Estimate 40% token savings from batching
    const unbatchedTokens = tokensUsed / 0.6; // If batched uses 60%, unbatched would use 100%
    this.stats.tokensSaved += unbatchedTokens - tokensUsed;
    this.stats.costSaved +=
      ((unbatchedTokens - tokensUsed) / 1000000) * 0.15;
  }

  /**
   * Get cost savings statistics.
   */
  getStats(): OrchestratorStats {
    return {
      ...this.stats,
      avgTokensPerCall:
        this.stats.totalCalls > 0
          ? Math.round(this.stats.totalTokens / this.stats.totalCalls)
          : 0,
      avgCostPerCall:
        this.stats.totalCalls > 0
          ? (this.stats.totalCost / this.stats.totalCalls).toFixed(4)
          : "0.0000",
      savingsPercentage:
        this.stats.totalCost > 0
          ? (
              (this.stats.costSaved /
                (this.stats.totalCost + this.stats.costSaved)) *
              100
            ).toFixed(1) + "%"
          : "0%",
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      callsSaved: 0,
      tokensSaved: 0,
      costSaved: 0,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an AIOrchestrator instance.
 *
 * @param apiKey - OpenAI API key. Defaults to OPENAI_API_KEY env var.
 * @param options - Optional overrides for model, temperature, maxTokens.
 */
export function createAIOrchestrator(
  apiKey?: string,
  options?: Partial<Omit<AIOrchestratorOptions, "apiKey">>
): AIOrchestrator {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  return new AIOrchestrator({ apiKey: key, ...options });
}
