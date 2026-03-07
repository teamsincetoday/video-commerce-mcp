# Video Commerce Intelligence MCP

AI-powered commercial intelligence from YouTube videos. Extract entities, score monetization opportunities, analyze audience intent, and discover market gaps -- all via the [Model Context Protocol](https://modelcontextprotocol.io).

Give it a YouTube URL. It tells you everything commercially interesting about it -- and what to create next.

## Quick Start

```bash
# Run directly (stdio transport, for local MCP use)
npx video-commerce-mcp

# Run as SSE server (for remote deployment)
npx video-commerce-mcp --transport sse --port 3001
```

**Requires:**
- `OPENAI_API_KEY` environment variable (GPT-4o-mini for entity extraction)
- **Optional:** Python 3 with `youtube-transcript-api` (`pip install youtube-transcript-api`) for reliable transcript fetching. Falls back to npm-based fetching if not available.

## Add to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "video-commerce": {
      "command": "npx",
      "args": ["video-commerce-mcp"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key"
      }
    }
  }
}
```

## Add to Claude Code

Create or edit `.claude/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "video-commerce": {
      "command": "npx",
      "args": ["video-commerce-mcp"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key"
      }
    }
  }
}
```

Or connect to a remote SSE server:

```json
{
  "mcpServers": {
    "video-commerce": {
      "type": "sse",
      "url": "https://your-server.example.com/sse"
    }
  }
}
```

## Tools (12)

### Layer 1 -- Video Intelligence

| Tool | Description | Price (USDC) |
|------|-------------|-------------|
| `analyze_video` | Full commercial intelligence analysis of a YouTube video (entities, monetization, audience, quality, skills, market position) | 0.02 / 0.05 (deep) |
| `get_commercial_entities` | Quick extraction of named entities with commercial categories and shoppability flags | 0.005 |
| `get_monetization_opportunities` | Ranked monetization strategies (affiliate, course, sponsored) with estimated revenue | 0.01 |
| `get_audience_insights` | Deep audience intent analysis with 7 archetypes, emotions, and recommended CTAs | 0.01 |
| `discover_content_gaps` | Market gap analysis -- content viewers want but that does not exist yet | 0.02 |
| `batch_analyze` | Multi-video analysis (up to 10) with cross-video comparison | 0.015/video |

### Layer 2 -- Market Intelligence

| Tool | Description | Price (USDC) |
|------|-------------|-------------|
| `discover_opportunities` | Convergence scoring: where demand, commission, and authority align | 0.02 |
| `scan_affiliate_programs` | Search affiliate networks (Awin, CJ, ShareASale) for matching programs | 0.01 |
| `assess_channel_authority` | 5-dimension channel scoring (reach, engagement, quality, trust, commercial) | 0.01 |
| `map_category_affinity` | Cross-category relationships for expansion and cross-selling paths | 0.005 |
| `track_category_lifecycle` | Category state tracking (emerging/growing/mature/declining) with signals | 0.005 |
| `get_seasonal_calendar` | Region-specific commerce calendar with demand multipliers | 0.005 |

## Pricing

**Free tier:** 5 calls/day (any tool) without payment, for testing and evaluation.

**Paid tier:** x402 micropayments in USDC on Base network. See the pricing column above for per-tool costs.

**API key auth:** Alternatively, configure API keys for authenticated access without x402.

| Tier | Access | Rate Limits |
|------|--------|-------------|
| Free | 5 calls/day | Per IP |
| API Key | Unlimited (within rate limits) | 30/min, 500/hr, 5000/day |
| x402 | Pay-per-call | 30/min, 500/hr, 5000/day |

## Example Usage

### analyze_video

**Input:**
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=abc123",
  "analysis_depth": "standard",
  "focus": ["entities", "monetization", "audience"]
}
```

**Output (abbreviated):**
```json
{
  "video_id": "abc123",
  "title": "See This Chef's Amazing Kitchen Garden",
  "commercial_intent_score": 82,
  "entities": [
    {
      "name": "Helenium 'Sahin's Early Flowerer'",
      "category": "plant",
      "confidence": 0.94,
      "is_shoppable": true,
      "monetization_potential": {
        "affiliate_score": 0.85,
        "course_relevance": 0.6
      }
    }
  ],
  "audience_intent": {
    "dominant_intent": "seasonal_action",
    "intents": [{ "type": "seasonal_action", "score": 0.89 }]
  },
  "monetization": {
    "opportunities": [
      { "strategy": "affiliate_commerce", "score": 0.87 }
    ]
  }
}
```

### discover_content_gaps

**Input:**
```json
{
  "category": "autumn perennials",
  "region": "UK"
}
```

**Output (abbreviated):**
```json
{
  "gaps": [
    {
      "topic": "helenium variety comparison",
      "demand_score": 0.78,
      "competition": 0.23,
      "opportunity_score": 0.85,
      "recommendation": "invest_now"
    }
  ],
  "emerging_topics": ["no-dig perennial borders"],
  "declining_topics": ["traditional herbaceous border maintenance"]
}
```

## Remote Deployment (SSE)

```bash
# Start SSE server
npx video-commerce-mcp --transport sse --port 3001

# Health check
curl http://localhost:3001/health
```

**Docker:**

```bash
docker build -t video-commerce-mcp .
docker run -p 3001:3001 -e OPENAI_API_KEY=sk-... video-commerce-mcp
```

## Configuration

Copy `.env.example` to `.env` and fill in your values. See the file for all available options.

**Required:**
- `OPENAI_API_KEY` -- OpenAI API key for GPT-4o-mini entity extraction

**Optional:**
- `X402_ENABLED` / `X402_WALLET_ADDRESS` -- Enable x402 micropayments
- `API_KEYS` -- Comma-separated API keys for authenticated access
- `FREE_TIER_DAILY_LIMIT` -- Free calls per day (default: 5)
- `ANALYSIS_CACHE_DIR` -- Cache directory (default: `~/.video-commerce-mcp/`)

## Programmatic Usage

```typescript
import { createServer, startStdioServer } from "video-commerce-mcp";

// Use the server factory
const server = createServer();

// Or start directly
await startStdioServer();
```

## Domain Expansion

The server is built on a domain-agnostic architecture. While the default vertical is gardening, the same pipeline works for:

- **Cooking** -- ingredients, equipment, techniques, cuisine styles
- **DIY / Home improvement** -- tools, materials, techniques, project types
- **Tech reviews** -- products, specs, alternatives, price points
- **Fashion / Beauty** -- products, brands, styles, occasions
- **Fitness** -- equipment, exercises, programs, supplements

Each vertical needs a domain dictionary, category keywords, and prompt tuning. The MCP framework stays identical.

See `docs/verticals.md` for implementation details.

## OpenClaw Integration

Running OpenClaw for content production? Install this skill from ClawHub:

```bash
clawhub install video-commerce-intelligence
```

Or wire it directly via McPorter:

```bash
mcporter add video-commerce-mcp
```

### Content team workflows

**After each episode drops:**

> "Analyze this week's episode and give me affiliate links for the show notes: https://youtu.be/abc123"

The agent calls `get_commercial_entities`, then `scan_affiliate_programs` for the top entities, and returns a formatted list ready to paste into your CMS.

**Planning next episode:**

> "What should we create next based on viewer demand in the startup tools space?"

The agent calls `discover_content_gaps` + `track_category_lifecycle` and returns the top 3 opportunities ranked by demand score and competition level.

**Seasonal calendar:**

> "What's coming up in the next 90 days that our audience will care about?"

The agent calls `get_seasonal_calendar` for your region and returns upcoming events with demand multipliers.

### OpenClaw agent config (direct MCP wiring)

```yaml
mcpServers:
  - name: video-commerce
    command: npx video-commerce-mcp
    env:
      OPENAI_API_KEY: "${OPENAI_API_KEY}"
      MCP_API_KEYS: "${YOUR_API_KEY}"
```

## Architecture

```
AI Agent (Claude, GPT, etc.)
     |
     | MCP Protocol (stdio or SSE)
     | x402 Payment Header (optional)
     v
Video Commerce Intelligence MCP
     |
     +-- Transcript Pipeline (fetch, preprocess, reduce tokens 70-90%)
     +-- NER Pipeline (extract, resolve, disambiguate, calibrate)
     +-- AI Orchestration (GPT-4o-mini, budget-managed)
     +-- Intelligence (audience intent, skills, quality, seasonal)
     +-- Market Intelligence (convergence, affiliates, authority, lifecycle)
     +-- Analysis Cache (SQLite, 7-day TTL)
     +-- Payment / Metering (x402, API key, free tier)
```

## License

MIT
