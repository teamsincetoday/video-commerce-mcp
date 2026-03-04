# Agent Onboarding Guide

How an AI agent discovers, connects to, and starts using the Video Commerce Intelligence MCP.

## What This MCP Does

The Video Commerce Intelligence MCP takes YouTube video URLs and returns structured commercial intelligence: what products are mentioned, how monetizable they are, what the audience wants to buy, and where the market gaps are.

Think of it as a commercial analyst for video content, available as a tool call.

## Step 1: Connect to the MCP

### Option A: Local (stdio)

If the MCP is configured in your MCP client (Claude Desktop, Claude Code, or any MCP-compatible agent), the server starts automatically when you make your first tool call.

The server runs as a local process using stdio transport. No network requests except to YouTube (transcripts) and OpenAI (entity extraction).

### Option B: Remote (SSE)

If connecting to a deployed instance, your MCP client connects via Server-Sent Events to the server URL (e.g., `https://your-server.example.com/sse`).

## Step 2: Discover Available Tools

The MCP exposes 12 tools, organized in two layers:

**Layer 1 -- Video Intelligence** (analyze individual videos):
- `analyze_video` -- The flagship tool. Full analysis.
- `get_commercial_entities` -- Just the entities. Fast and cheap.
- `get_monetization_opportunities` -- Revenue strategies.
- `get_audience_insights` -- What viewers want to do next.
- `discover_content_gaps` -- What content is missing.
- `batch_analyze` -- Analyze up to 10 videos at once.

**Layer 2 -- Market Intelligence** (cross-video, strategic):
- `discover_opportunities` -- Where to invest.
- `scan_affiliate_programs` -- Available affiliate programs.
- `assess_channel_authority` -- How good is this channel.
- `map_category_affinity` -- Related categories.
- `track_category_lifecycle` -- Is this topic growing or dying.
- `get_seasonal_calendar` -- When to promote what.

## Step 3: Start with analyze_video

The best way to start is with the `analyze_video` tool. Give it any YouTube URL:

```json
{
  "youtube_url": "https://www.youtube.com/watch?v=...",
  "analysis_depth": "standard"
}
```

This returns everything: entities, monetization opportunities, audience intent, quality score, skill graph, and market position. From there, you can drill deeper with specialized tools.

## Step 4: Common Agent Workflows

### Workflow A: Content Creator Optimization

Goal: Help a creator understand what to make next and how to monetize.

1. `analyze_video` on their recent videos (or `batch_analyze` for multiple)
2. Look at the `market_position.content_gaps_nearby` field -- these are topics their audience wants but they have not covered
3. Use `discover_content_gaps` with those topics to get demand/competition scores
4. Use `get_seasonal_calendar` to time content to peak demand periods

### Workflow B: Affiliate Marketing Opportunity

Goal: Find monetizable products in video content.

1. `get_commercial_entities` to extract all mentioned products
2. Filter for `is_shoppable: true` entities
3. `get_monetization_opportunities` for revenue estimates
4. `scan_affiliate_programs` for the product categories found

### Workflow C: Channel Evaluation

Goal: Assess whether a YouTube channel is worth partnering with.

1. `assess_channel_authority` with the channel URL
2. `analyze_video` on their top 3-5 videos
3. Review the quality scores and audience intent patterns
4. Use `discover_opportunities` to see if their niche has commercial potential

### Workflow D: Market Research

Goal: Find underserved content markets.

1. `discover_content_gaps` for a broad category (e.g., "gardening")
2. `track_category_lifecycle` for promising subcategories
3. `discover_opportunities` to find convergence of demand + commission + authority
4. `get_seasonal_calendar` to plan content timing

## Step 5: Understanding the Response

### Commercial Intent Score

Every analysis includes a `commercial_intent_score` (0-100). This is a composite metric:
- **80+**: Highly commercial, strong purchase intent
- **60-79**: Moderate commercial potential
- **40-59**: Some commercial elements but mainly educational
- **Below 40**: Primarily entertainment or non-commercial

### Entity Confidence

Each entity has a `confidence` score (0-1):
- **0.90+**: Very high confidence, specific product/plant name clearly mentioned
- **0.70-0.89**: High confidence, context supports the identification
- **0.50-0.69**: Moderate confidence, may need human verification
- **Below 0.50**: Low confidence, included for completeness

### Recommendation Levels

Market intelligence tools use four recommendation levels:
- **invest_now**: High confidence, act immediately
- **watch_closely**: Promising, monitor for signal strengthening
- **test_small**: Worth a small experiment
- **skip**: Not worth pursuing now

## Step 6: Handling Costs

### Free Tier

The first 5 calls per day are free (per IP/agent). No authentication needed. This is enough for evaluation and light usage.

### Paid Access

For production use, configure either:
- **x402 micropayments**: Pay per call in USDC on Base. Prices range from $0.005 to $0.05 per call.
- **API keys**: Configure API keys for authenticated unlimited access (within rate limits).

### Optimizing Costs

- Use `get_commercial_entities` ($0.005) instead of `analyze_video` ($0.02) when you only need entity extraction
- Results are cached for 7 days -- repeated calls to the same video are fast and still cached
- Use `batch_analyze` ($0.015/video) instead of individual `analyze_video` ($0.02/video) for multiple videos
- Layer 2 tools (market intelligence) are mostly $0.005-0.01 since they use local computation

## Step 7: Error Handling

The MCP returns structured errors:

```json
{
  "content": [{
    "type": "text",
    "text": "{\"error\": \"message\", \"code\": \"ERROR_CODE\"}"
  }],
  "isError": true
}
```

Common error codes:
- `INVALID_YOUTUBE_URL` -- URL format is not a valid YouTube video
- `TRANSCRIPT_NOT_FOUND` -- Video has no available transcript
- `ANALYSIS_FAILED` -- Pipeline error (usually transient, retry)
- `RATE_LIMITED` -- Too many requests, slow down
- `PAYMENT_REQUIRED` -- Free tier exhausted, payment needed

## Tips for Effective Use

1. **Start broad, then narrow.** Use `analyze_video` first, then drill into specific dimensions with cheaper tools.

2. **Cache awareness.** The server caches results for 7 days. The `meta.cached` field in responses tells you if you hit the cache. Cached responses are faster but the data may be up to 7 days old.

3. **Regional context matters.** Always pass a `region` parameter when available (especially for `discover_content_gaps` and `get_seasonal_calendar`). Regional data significantly improves relevance.

4. **Batch when possible.** If analyzing a channel's content library, use `batch_analyze` for up to 10 videos at once. It is cheaper and provides cross-video comparison insights.

5. **Layer 2 for strategy.** Layer 1 tools analyze individual videos. Layer 2 tools analyze markets. Use Layer 2 when making strategic decisions about what content to create or which niches to enter.
