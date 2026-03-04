/**
 * Video Commerce Intelligence MCP Server
 *
 * Exposes 12 video commercial intelligence tools via the Model Context Protocol.
 * Supports stdio transport (local) and SSE transport (remote).
 *
 * Layer 1 -- Video Intelligence (6 tools):
 *   analyze_video, get_commercial_entities, get_monetization_opportunities,
 *   get_audience_insights, discover_content_gaps, batch_analyze
 *
 * Layer 2 -- Market Intelligence (6 tools):
 *   discover_opportunities, scan_affiliate_programs, assess_channel_authority,
 *   map_category_affinity, track_category_lifecycle, get_seasonal_calendar
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer as createHttpServer } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Pipeline Orchestrator (Layer 1)
import {
  PipelineOrchestrator,
  type PipelineOptions,
  type PipelineResult,
  type AnalysisDimension,
} from "./pipeline-orchestrator.js";
import { createAnalysisCache } from "./analysis-cache.js";

// Market Intelligence Orchestrator (Layer 2)
import {
  MarketIntelligenceOrchestrator,
  type MarketIntelOptions,
} from "./market-intelligence-orchestrator.js";

// Usage Metering
import { UsageMetering, createUsageMetering } from "./usage-metering.js";

// Payment Middleware
import {
  type PaymentMiddleware,
  type PaymentConfig,
  createPaymentMiddleware,
} from "./x402-middleware.js";

// ---------------------------------------------------------------------------
// Auth Context (AsyncLocalStorage for per-request auth propagation)
// ---------------------------------------------------------------------------

/**
 * Auth context extracted from HTTP headers (SSE transport) or defaults (stdio).
 * Propagated to tool handlers via AsyncLocalStorage so the payment middleware
 * can check API keys and x402 payment headers.
 */
interface AuthContext {
  apiKey?: string;
  paymentHeader?: string;
  agentId: string;
}

/**
 * AsyncLocalStorage instance for propagating auth context from the HTTP layer
 * to MCP tool handlers. For stdio transport, no context is set (returns undefined),
 * and the payment middleware runs in disabled mode.
 */
export const authStore = new AsyncLocalStorage<AuthContext>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVER_NAME = "video-commerce-intelligence";
const SERVER_VERSION = "0.1.0";

// YouTube URL regex for validation
const YOUTUBE_URL_REGEX =
  /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/;

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Create a successful MCP text response from a JSON-serializable object.
 */
function jsonResponse(data: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Create an MCP error response.
 */
function errorResponse(message: string, code?: string): CallToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: true,
          code: code ?? "INTERNAL_ERROR",
          message,
        }),
      },
    ],
  };
}

/**
 * Validate a YouTube URL format.
 */
function validateYouTubeUrl(url: string): { valid: boolean; error?: string } {
  if (!YOUTUBE_URL_REGEX.test(url)) {
    return {
      valid: false,
      error: `Invalid YouTube URL: "${url}". Expected format: https://youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID`,
    };
  }
  return { valid: true };
}

/**
 * Extract video ID from a YouTube URL.
 */
function extractVideoId(url: string): string {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? "unknown";
}

// ---------------------------------------------------------------------------
// Pipeline result → MCP response formatters
// ---------------------------------------------------------------------------

/**
 * Format a PipelineResult into the MCP response shape for analyze_video.
 */
function formatAnalysisResult(result: PipelineResult): unknown {
  return {
    video_id: result.videoId,
    title: result.title,
    channel: result.channel,
    duration_seconds: result.durationSeconds,
    language: result.language,
    analysis_timestamp: result.analysisTimestamp,
    analysis_depth: result.analysisDepth,
    commercial_intent_score: result.commercialIntentScore,
    entities: result.entities,
    monetization: result.monetization,
    audience_intent: result.audience
      ? {
          dominant_intent: result.audience.dominantIntent,
          intents: result.audience.intents,
          total_commercial_value: result.audience.totalCommercialValue,
          emotion_distribution: result.audience.emotionDistribution,
        }
      : undefined,
    quality: result.quality
      ? {
          editorial_tier: result.quality.editorialTier,
          teaching_score: result.quality.overallScore,
          visual_quality: result.quality.visualQuality,
          botanical_literacy: result.quality.botanicalLiteracy,
          content_depth: result.quality.contentDepth,
          standfirst: result.quality.standfirst,
        }
      : undefined,
    skills: result.skills
      ? {
          primary: result.skills.primary,
          prerequisites: result.skills.prerequisites,
          next_skills: result.skills.nextSkills,
          secondary_skills: result.skills.secondarySkills,
        }
      : undefined,
    market_position: result.market
      ? {
          seasonal_context: result.market.seasonalContext,
          commercial_potential: result.market.commercialPotential,
        }
      : undefined,
    _meta: {
      pipeline_version: result._meta.pipelineVersion,
      processing_time_ms: result._meta.processingTimeMs,
      ai_cost_usd: result._meta.aiCostUsd,
      cache_hit: result._meta.cacheHit,
      stages_completed: result._meta.stagesCompleted,
      stages_failed: result._meta.stagesFailed,
    },
  };
}

// ---------------------------------------------------------------------------
// Metered Tool Wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a tool handler with payment authorization, rate limiting, and usage metering.
 *
 * Flow per tool call:
 *   1. Read auth context from AsyncLocalStorage (set by SSE HTTP layer)
 *   2. Check rate limits (sliding window per agent)
 *   3. Check payment authorization (API key → x402 → free tier → 402 deny)
 *   4. Execute tool handler
 *   5. Record usage to SQLite with actual payment method and amount
 */
function meteredHandler<TArgs>(
  metering: UsageMetering,
  payments: PaymentMiddleware,
  toolName: string,
  handler: (args: TArgs, extra: unknown) => Promise<CallToolResult>,
): (args: TArgs, extra: unknown) => Promise<CallToolResult> {
  return async (args: TArgs, extra: unknown): Promise<CallToolResult> => {
    // Read auth context from AsyncLocalStorage (set by SSE transport layer)
    const authCtx = authStore.getStore();
    const agentId = authCtx?.agentId ?? "anonymous";

    // Check rate limits before doing any work
    const rateCheck = metering.checkRateLimit(agentId);
    if (!rateCheck.allowed) {
      return errorResponse(
        `Rate limit exceeded (${rateCheck.limitExceeded}). Retry after ${rateCheck.retryAfterSeconds}s.`,
        "RATE_LIMITED"
      );
    }

    // Check payment authorization
    const authResult = await payments.authorize({
      agentId,
      toolName,
      toolParams: args as Record<string, unknown>,
      apiKey: authCtx?.apiKey,
      paymentHeader: authCtx?.paymentHeader,
    });

    if (!authResult.authorized) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: true,
                code: "PAYMENT_REQUIRED",
                message: authResult.reason,
                ...(authResult.requiredPayment
                  ? { payment_required: authResult.requiredPayment }
                  : {}),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Map "disabled" → "free_tier" for metering (UsageEvent doesn't have "disabled")
    const paymentMethod: "free_tier" | "x402" | "api_key" =
      authResult.method === "disabled" ? "free_tier" : authResult.method;
    const amountUsd = authResult.receipt?.amount ?? 0;

    const start = Date.now();
    let success = true;
    let errorMessage: string | undefined;

    try {
      const result = await handler(args, extra);
      if (result.isError) {
        success = false;
        const text = result.content?.[0];
        if (text && "text" in text) {
          try {
            const parsed = JSON.parse(text.text) as { message?: string };
            errorMessage = parsed.message;
          } catch {
            errorMessage = text.text.slice(0, 200);
          }
        }
      }
      return result;
    } catch (err) {
      success = false;
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      try {
        metering.record({
          agentId,
          toolName,
          paymentMethod,
          amountUsd,
          processingTimeMs: Date.now() - start,
          success,
          errorMessage,
        });
      } catch {
        // Never let metering failures break tool execution
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Tool Registration
// ---------------------------------------------------------------------------

/**
 * Register all 12 MCP tools on the server.
 *
 * Layer 1 tools are wired to PipelineOrchestrator (AI-powered video analysis).
 * Layer 2 tools are wired to MarketIntelligenceOrchestrator (seed data + heuristics).
 */
function registerTools(
  server: McpServer,
  pipeline: PipelineOrchestrator,
  marketIntel: MarketIntelligenceOrchestrator,
  metering: UsageMetering,
  payments: PaymentMiddleware,
): void {
  // ==========================================================================
  // Layer 1 -- Video Intelligence Tools (6 tools)
  // ==========================================================================

  // ---- Tool 1: analyze_video ----
  server.tool(
    "analyze_video",
    "Full commercial intelligence analysis of a YouTube video. Returns structured intelligence across up to six dimensions: entities, monetization, audience intent, quality, skills, and market position. The flagship analysis tool.",
    {
      youtube_url: z.string().describe("YouTube video URL to analyze"),
      analysis_depth: z
        .enum(["standard", "deep"])
        .default("standard")
        .describe(
          "Analysis depth. 'standard' is faster/cheaper. 'deep' includes additional AI analysis for quality and design context."
        ),
      focus: z
        .array(
          z.enum([
            "entities",
            "monetization",
            "audience",
            "quality",
            "skills",
            "market",
          ])
        )
        .optional()
        .describe(
          "Optional list of dimensions to include. If omitted, all dimensions are returned."
        ),
    },
    meteredHandler(metering, payments, "analyze_video", async (args) => {
      try {
        const validation = validateYouTubeUrl(args.youtube_url as string);
        if (!validation.valid) {
          return errorResponse(validation.error!, "INVALID_INPUT");
        }
        const result = await pipeline.analyze({
          youtubeUrl: args.youtube_url as string,
          analysisDepth: (args.analysis_depth as "standard" | "deep") ?? "standard",
          focus: args.focus as AnalysisDimension[] | undefined,
        });
        return jsonResponse(formatAnalysisResult(result));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error during analysis";
        return errorResponse(message, "ANALYSIS_FAILED");
      }
    })
  );

  // ---- Tool 2: get_commercial_entities ----
  server.tool(
    "get_commercial_entities",
    "Quick extraction of named entities with commercial categories from a YouTube video. Faster and cheaper than full analysis -- returns entities only, no monetization scoring or audience intent.",
    {
      youtube_url: z.string().describe("YouTube video URL to extract entities from"),
      categories: z
        .array(
          z.enum([
            "plant",
            "tool",
            "material",
            "seed",
            "structure",
            "book",
            "course",
            "service",
            "event",
          ])
        )
        .optional()
        .describe(
          "Optional filter to specific commerce categories. If omitted, all categories are extracted."
        ),
    },
    meteredHandler(metering, payments, "get_commercial_entities", async (args) => {
      try {
        const validation = validateYouTubeUrl(args.youtube_url as string);
        if (!validation.valid) {
          return errorResponse(validation.error!, "INVALID_INPUT");
        }
        const result = await pipeline.analyze({
          youtubeUrl: args.youtube_url as string,
          analysisDepth: "standard",
          focus: ["entities"],
        });
        const categories = args.categories as string[] | undefined;
        let entities = result.entities ?? [];
        if (categories && categories.length > 0) {
          entities = entities.filter((e) => categories.includes(e.category));
        }
        const categoriesFound = [...new Set(entities.map((e) => e.category))];
        return jsonResponse({
          video_id: result.videoId,
          entities,
          total_count: entities.length,
          categories_found: categoriesFound,
          _meta: {
            processing_time_ms: result._meta.processingTimeMs,
            cache_hit: result._meta.cacheHit,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during entity extraction";
        return errorResponse(message, "EXTRACTION_FAILED");
      }
    })
  );

  // ---- Tool 3: get_monetization_opportunities ----
  server.tool(
    "get_monetization_opportunities",
    "Ranked monetization strategies for a video, including affiliate commerce, course creation, and sponsored content opportunities with estimated revenue potential.",
    {
      youtube_url: z
        .string()
        .optional()
        .describe(
          "YouTube video URL. Provide this OR analysis_id, not both."
        ),
      analysis_id: z
        .string()
        .optional()
        .describe(
          "ID from a previous analyze_video call. Provide this OR youtube_url, not both."
        ),
    },
    meteredHandler(metering, payments, "get_monetization_opportunities", async (args) => {
      try {
        if (!args.youtube_url && !args.analysis_id) {
          return errorResponse(
            "Either youtube_url or analysis_id must be provided.",
            "INVALID_INPUT"
          );
        }
        if (args.youtube_url) {
          const validation = validateYouTubeUrl(args.youtube_url as string);
          if (!validation.valid) {
            return errorResponse(validation.error!, "INVALID_INPUT");
          }
          const result = await pipeline.analyze({
            youtubeUrl: args.youtube_url as string,
            analysisDepth: "standard",
            focus: ["entities", "monetization"],
          });
          return jsonResponse({
            source: { type: "url", video_id: result.videoId },
            monetization: result.monetization,
            entities_analyzed: result.entities?.length ?? 0,
            _meta: {
              processing_time_ms: result._meta.processingTimeMs,
              cache_hit: result._meta.cacheHit,
            },
          });
        }
        // analysis_id lookup — not yet supported, return helpful error
        return errorResponse(
          "analysis_id lookup is not yet supported. Please provide a youtube_url instead.",
          "NOT_IMPLEMENTED"
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during monetization analysis";
        return errorResponse(message, "MONETIZATION_FAILED");
      }
    })
  );

  // ---- Tool 4: get_audience_insights ----
  server.tool(
    "get_audience_insights",
    "Deep audience intent analysis using 7-archetype taxonomy. Returns what viewers want to do after watching (buy, learn, solve), with emotion mapping, commercial value scores, and recommended CTAs per segment.",
    {
      youtube_url: z.string().describe("YouTube video URL to analyze audience intent for"),
    },
    meteredHandler(metering, payments, "get_audience_insights", async (args) => {
      try {
        const validation = validateYouTubeUrl(args.youtube_url as string);
        if (!validation.valid) {
          return errorResponse(validation.error!, "INVALID_INPUT");
        }
        const result = await pipeline.analyze({
          youtubeUrl: args.youtube_url as string,
          analysisDepth: "standard",
          focus: ["audience"],
        });
        return jsonResponse({
          video_id: result.videoId,
          dominant_intent: result.audience?.dominantIntent ?? null,
          intents: result.audience?.intents ?? [],
          total_commercial_value: result.audience?.totalCommercialValue ?? 0,
          emotion_distribution: result.audience?.emotionDistribution ?? {},
          _meta: {
            processing_time_ms: result._meta.processingTimeMs,
            cache_hit: result._meta.cacheHit,
          },
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during audience analysis";
        return errorResponse(message, "AUDIENCE_FAILED");
      }
    })
  );

  // ---- Tool 5: discover_content_gaps ----
  server.tool(
    "discover_content_gaps",
    "Market gap analysis for a topic or category. Returns content that viewers want but that doesn't exist yet, with demand scores, competition levels, and monetization angles. Cross-video analysis, not per-video.",
    {
      category: z
        .string()
        .describe(
          "Topic or category to analyze for content gaps (e.g., 'autumn perennials', 'raised bed gardening')"
        ),
      region: z
        .string()
        .optional()
        .describe(
          "Optional region filter for region-specific gap analysis (e.g., 'UK', 'US', 'EU')"
        ),
    },
    meteredHandler(metering, payments, "discover_content_gaps", async (args) => {
      try {
        // Content gaps is a market-intelligence operation, not a per-video pipeline call.
        // Use the market intel orchestrator's category affinity + lifecycle data.
        const category = args.category as string;
        const region = args.region as string | undefined;
        const affinity = marketIntel.mapCategoryAffinity(category);
        const lifecycle = marketIntel.trackCategoryLifecycle(category);
        return jsonResponse({
          category,
          region: region ?? "global",
          lifecycle_state: lifecycle.stage,
          transition_signals: lifecycle.signals,
          related_categories: affinity.relationships.slice(0, 10),
          gaps: affinity.relationships
            .filter((a) => a.affinityScore > 0.5 && a.relationshipType === "complementary")
            .map((a) => ({
              topic: a.targetCategory,
              affinity_score: a.affinityScore,
              relationship: a.relationshipType,
              opportunity: `Content combining ${category} with ${a.targetCategory} is underserved`,
            })),
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during content gap analysis";
        return errorResponse(message, "CONTENT_GAPS_FAILED");
      }
    })
  );

  // ---- Tool 6: batch_analyze ----
  server.tool(
    "batch_analyze",
    "Analyze multiple YouTube videos (up to 10) in a single request. For agents building content strategies or competitive analyses. Optionally includes cross-video comparison of shared entities and complementary topics.",
    {
      youtube_urls: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe("Array of YouTube video URLs to analyze (1-10 videos)"),
      analysis_depth: z
        .enum(["standard", "deep"])
        .default("standard")
        .describe("Analysis depth for all videos in the batch"),
      compare: z
        .boolean()
        .default(false)
        .describe(
          "Whether to include cross-video comparison (shared entities, complementary topics, combined audience map)"
        ),
    },
    meteredHandler(metering, payments, "batch_analyze", async (args) => {
      try {
        const urls = args.youtube_urls as string[];
        for (const url of urls) {
          const validation = validateYouTubeUrl(url);
          if (!validation.valid) {
            return errorResponse(validation.error!, "INVALID_INPUT");
          }
        }
        const depth = (args.analysis_depth as "standard" | "deep") ?? "standard";
        const compare = args.compare as boolean;

        // Run all analyses concurrently
        const settled = await Promise.allSettled(
          urls.map((url) =>
            pipeline.analyze({ youtubeUrl: url, analysisDepth: depth })
          )
        );

        const analyses = settled.map((s, i) => {
          if (s.status === "fulfilled") {
            const formatted = formatAnalysisResult(s.value) as Record<string, unknown>;
            return { ...formatted, status: "completed" };
          }
          return {
            video_id: extractVideoId(urls[i]!),
            url: urls[i],
            status: "failed",
            error: s.reason instanceof Error ? s.reason.message : String(s.reason),
          };
        });

        // Cross-video comparison if requested
        let comparison = null;
        if (compare) {
          const successful = settled
            .filter((s): s is PromiseFulfilledResult<PipelineResult> => s.status === "fulfilled")
            .map((s) => s.value);
          const allEntities = successful.flatMap((r) => r.entities ?? []);
          const entityCounts = new Map<string, number>();
          for (const e of allEntities) {
            entityCounts.set(e.name, (entityCounts.get(e.name) ?? 0) + 1);
          }
          const sharedEntities = [...entityCounts.entries()]
            .filter(([, count]) => count > 1)
            .map(([name, count]) => ({ name, appears_in: count }));
          comparison = {
            shared_entities: sharedEntities,
            videos_analyzed: successful.length,
          };
        }

        return jsonResponse({
          analyses,
          total: urls.length,
          completed: analyses.filter((a) => (a as Record<string, unknown>).status === "completed").length,
          failed: analyses.filter((a) => (a as Record<string, unknown>).status === "failed").length,
          analysis_depth: depth,
          comparison,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during batch analysis";
        return errorResponse(message, "BATCH_FAILED");
      }
    })
  );

  // ==========================================================================
  // Layer 2 -- Market Intelligence Tools (6 tools)
  // Wired to MarketIntelligenceOrchestrator
  // ==========================================================================

  // ---- Tool 7: discover_opportunities ----
  server.tool(
    "discover_opportunities",
    "Three-forces convergence scoring: where demand, commission, and authority align. Returns ranked opportunities with invest_now / watch_closely / test_small / skip recommendations.",
    {
      vertical: z
        .string()
        .default("gardening")
        .describe(
          "Vertical to scan for opportunities (e.g., 'gardening', 'cooking', 'diy')"
        ),
      min_score: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe(
          "Minimum convergence score to include (0-1). Higher values return fewer, stronger opportunities."
        ),
    },
    meteredHandler(metering, payments, "discover_opportunities", async (args) => {
      try {
        const opportunities = marketIntel.discoverOpportunities(
          args.vertical as string,
          args.min_score as number | undefined,
        );
        return jsonResponse({
          vertical: args.vertical,
          min_score: args.min_score ?? 0,
          opportunities,
          total_scanned: opportunities.length,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during opportunity discovery";
        return errorResponse(message, "DISCOVERY_FAILED");
      }
    })
  );

  // ---- Tool 8: scan_affiliate_programs ----
  server.tool(
    "scan_affiliate_programs",
    "Search affiliate networks for programs matching a category or vertical. Returns program details, commission rates, and relevance scores.",
    {
      category: z
        .string()
        .describe(
          "Category or niche to search affiliate programs for (e.g., 'garden tools', 'indoor plants')"
        ),
      networks: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of specific affiliate networks to search (e.g., ['awin', 'cj', 'shareasale']). If omitted, all supported networks are scanned."
        ),
    },
    meteredHandler(metering, payments, "scan_affiliate_programs", async (args) => {
      try {
        const result = await marketIntel.scanAffiliatePrograms(
          args.category as string,
          args.networks as string[] | undefined,
        );
        return jsonResponse(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during affiliate scan";
        return errorResponse(message, "AFFILIATE_SCAN_FAILED");
      }
    })
  );

  // ---- Tool 9: assess_channel_authority ----
  server.tool(
    "assess_channel_authority",
    "5-dimension channel authority scoring: reach, engagement, quality, trust, and commercial performance. Returns composite score and approval recommendation.",
    {
      channel_id: z
        .string()
        .optional()
        .describe(
          "YouTube channel ID. Provide this OR channel_url, not both."
        ),
      channel_url: z
        .string()
        .optional()
        .describe(
          "YouTube channel URL. Provide this OR channel_id, not both."
        ),
    },
    meteredHandler(metering, payments, "assess_channel_authority", async (args) => {
      try {
        if (!args.channel_id && !args.channel_url) {
          return errorResponse(
            "Either channel_id or channel_url must be provided.",
            "INVALID_INPUT"
          );
        }
        const channelId = (args.channel_id ?? args.channel_url ?? "unknown") as string;
        const result = await marketIntel.assessChannelAuthority(
          channelId,
          args.channel_url as string | undefined,
        );
        return jsonResponse(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during channel assessment";
        return errorResponse(message, "CHANNEL_ASSESSMENT_FAILED");
      }
    })
  );

  // ---- Tool 10: map_category_affinity ----
  server.tool(
    "map_category_affinity",
    "Cross-category relationship mapping. Given a category, returns related categories with affinity scores, relationship types, and expansion paths for cross-selling.",
    {
      category: z
        .string()
        .describe("Category to map relationships for (e.g., 'perennials', 'raised beds')"),
      depth: z
        .number()
        .int()
        .min(1)
        .max(5)
        .default(2)
        .describe(
          "How many levels of relationships to traverse (1-5). Higher values discover more distant connections."
        ),
    },
    meteredHandler(metering, payments, "map_category_affinity", async (args) => {
      try {
        const result = marketIntel.mapCategoryAffinity(
          args.category as string,
          args.depth as number,
        );
        return jsonResponse(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during affinity mapping";
        return errorResponse(message, "AFFINITY_FAILED");
      }
    })
  );

  // ---- Tool 11: track_category_lifecycle ----
  server.tool(
    "track_category_lifecycle",
    "Track the lifecycle state of a category: emerging, growing, mature, or declining. Returns current state, transition signals, and predicted next state with probability.",
    {
      category: z
        .string()
        .describe("Category to track lifecycle for (e.g., 'no-dig gardening', 'native plants')"),
    },
    meteredHandler(metering, payments, "track_category_lifecycle", async (args) => {
      try {
        const result = marketIntel.trackCategoryLifecycle(args.category as string);
        return jsonResponse(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during lifecycle tracking";
        return errorResponse(message, "LIFECYCLE_FAILED");
      }
    })
  );

  // ---- Tool 12: get_seasonal_calendar ----
  server.tool(
    "get_seasonal_calendar",
    "Region-specific commerce calendar with seasonal events, demand multipliers, and promotional timing intelligence. Returns upcoming events with category relevance and optimal pricing windows.",
    {
      region: z
        .string()
        .describe(
          "Region for the seasonal calendar (e.g., 'UK', 'US', 'NL', 'DE', 'AU')"
        ),
      months_ahead: z
        .number()
        .int()
        .min(1)
        .max(12)
        .default(3)
        .describe("Number of months ahead to include in the calendar (1-12)"),
    },
    meteredHandler(metering, payments, "get_seasonal_calendar", async (args) => {
      try {
        const result = marketIntel.getSeasonalCalendar(
          args.region as string,
          args.months_ahead as number,
        );
        return jsonResponse(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unknown error during calendar generation";
        return errorResponse(message, "CALENDAR_FAILED");
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Server Factory
// ---------------------------------------------------------------------------

/**
 * Options for creating the MCP server.
 */
export interface ServerOptions {
  /** Options for the Pipeline Orchestrator (Layer 1). */
  pipeline?: Partial<PipelineOptions>;
  /** Options for the Market Intelligence Orchestrator (Layer 2). */
  marketIntel?: MarketIntelOptions;
  /** Path to the SQLite database for usage metering. Defaults to `./data/cache.db`. */
  meteringDbPath?: string;
  /** Payment middleware configuration. Defaults to disabled (free access). */
  payment?: Partial<PaymentConfig>;
}

/**
 * Create and configure the MCP server with all 12 tools registered.
 * Every tool call is metered to SQLite for the incubator loops to read.
 */
export function createServer(options?: ServerOptions): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Resolve API keys from options or environment
  const openaiApiKey =
    options?.pipeline?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "";
  const youtubeApiKey =
    options?.pipeline?.youtubeApiKey ?? process.env.YOUTUBE_API_KEY;

  if (!openaiApiKey) {
    console.error(
      `[${SERVER_NAME}] WARNING: No OPENAI_API_KEY set. Layer 1 tools will fail on AI stages.`
    );
  }

  // Create the Pipeline Orchestrator for Layer 1 tools
  const cache = createAnalysisCache();
  const pipeline = new PipelineOrchestrator({
    openaiApiKey,
    youtubeApiKey,
    cache,
    plantDictionary: options?.pipeline?.plantDictionary,
    logger: options?.pipeline?.logger,
  });

  // Create the Market Intelligence Orchestrator for Layer 2 tools
  const marketIntel = new MarketIntelligenceOrchestrator(
    options?.marketIntel ?? {},
  );

  // Create Usage Metering — every tool call gets recorded
  const metering = createUsageMetering({
    dbPath: options?.meteringDbPath,
  });

  // Create Payment Middleware — disabled by default (all requests authorized)
  // Enable via X402_ENABLED=true env var or options.payment.enabled
  const freeTierLimit = process.env.FREE_TIER_DAILY_LIMIT
    ? parseInt(process.env.FREE_TIER_DAILY_LIMIT, 10)
    : undefined;
  const payments = createPaymentMiddleware({
    enabled:
      options?.payment?.enabled ?? process.env.X402_ENABLED === "true",
    freeTierDailyLimit:
      options?.payment?.freeTierDailyLimit ?? freeTierLimit ?? undefined,
    ...options?.payment,
  });

  registerTools(server, pipeline, marketIntel, metering, payments);

  return server;
}

// ---------------------------------------------------------------------------
// Transport Starters
// ---------------------------------------------------------------------------

/**
 * Start the MCP server with stdio transport (for local MCP use).
 */
export async function startStdioServer(options?: ServerOptions): Promise<void> {
  const server = createServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Start the MCP server with SSE transport (for remote deployment).
 *
 * Creates an HTTP server that handles:
 * - GET /sse -- establishes SSE stream
 * - POST /messages -- receives MCP messages from the client
 *
 * @param port - Port to listen on (default: 3001)
 */
export async function startSseServer(
  port = 3001,
  options?: ServerOptions,
): Promise<void> {
  const server = createServer(options);

  // Track active SSE transports and session-level auth by session ID
  const transports = new Map<string, SSEServerTransport>();
  const sessionAuth = new Map<
    string,
    { apiKey?: string; agentId: string }
  >();

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // CORS headers for remote clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Payment"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /sse -- establish SSE stream
    if (req.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);

      // Capture session-level auth from initial connection headers
      const authHeader = req.headers.authorization;
      const apiKey =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : undefined;
      if (apiKey) {
        sessionAuth.set(transport.sessionId, {
          apiKey,
          agentId: apiKey,
        });
      }

      transport.onclose = () => {
        transports.delete(transport.sessionId);
        sessionAuth.delete(transport.sessionId);
      };

      await server.connect(transport);
      await transport.start();
      return;
    }

    // POST /messages -- receive MCP messages (with auth context propagation)
    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing sessionId query parameter" }));
        return;
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "No active SSE session for this sessionId" })
        );
        return;
      }

      // Extract per-request auth headers
      const authHeader = req.headers.authorization;
      const paymentHeader = req.headers["x-payment"];
      const apiKey =
        typeof authHeader === "string" && authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : undefined;

      // Merge with session-level auth (per-request takes precedence)
      const sessAuth = sessionAuth.get(sessionId);
      const ctx: AuthContext = {
        apiKey: apiKey ?? sessAuth?.apiKey,
        paymentHeader:
          typeof paymentHeader === "string" ? paymentHeader : undefined,
        agentId:
          apiKey ??
          sessAuth?.agentId ??
          req.socket.remoteAddress ??
          "anonymous",
      };

      // Run inside AsyncLocalStorage so tool handlers can read auth context
      await authStore.run(ctx, async () => {
        await transport.handlePostMessage(req, res);
      });
      return;
    }

    // Health check
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          server: SERVER_NAME,
          version: SERVER_VERSION,
          active_sessions: transports.size,
        })
      );
      return;
    }

    // 404 for anything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(port, () => {
    console.error(
      `[${SERVER_NAME}] SSE server listening on http://localhost:${port}/sse`
    );
    console.error(
      `[${SERVER_NAME}] Health check: http://localhost:${port}/health`
    );
  });
}
