# Pricing Model

The Video Commerce Intelligence MCP is an intelligence-as-a-service platform. We help creators, agencies, and brands find missed monetization in video content. Users bring their own affiliate relationships — we provide the intelligence.

## How We Make Money

| Revenue Stream | Price | Target Customer |
|---------------|-------|-----------------|
| Creator subscriptions | $29-49/mo | YouTube creators with affiliate accounts |
| Agency subscriptions | $299-499/mo | Multi-channel management agencies |
| Micropayments (x402/API key) | $0.005-0.05/call | Agent builders, automation workflows |
| Brand monitoring | $299-999/mo | Garden brands, nurseries, tool manufacturers |

## Subscription Tiers

### Free Tier

- 5 calls per day (any tool)
- No authentication required
- Rate limited per IP address
- Intended for testing — shows creators what they're missing

### Creator ($29/mo)

- 500 analyses per month
- All 12 tools
- Bring-your-own affiliate matching (product names + where to buy, you add your links)
- For individual YouTube creators with 10K+ subscribers

### Pro Creator ($49/mo)

- 2,000 analyses per month
- All 12 tools + content gap reports + channel authority scoring
- For serious creators and small agencies (100K+ subs)

### Agency ($299/mo)

- 10,000 analyses per month
- Portfolio-level reporting across multiple channels
- Full API access for automation
- For creator management and affiliate marketing agencies

### Enterprise (Custom)

- Unlimited analyses + SLA + dedicated support
- Data licensing + custom integrations
- For platforms, brands, and MCNs

## Pay-Per-Call (Micropayments)

For agent builders and automation workflows. Available via x402 (USDC on Base) or API key.

### API Key Authentication

- API keys configured server-side via `API_KEYS` env var
- Clients send key via `X-API-Key` header
- Rate limits: 30/min, 500/hour, 5000/day per key

### x402 Micropayments

- Pay-per-call, no subscription
- USDC on Base network (low gas fees)
- Payment verified before execution
- Rate limits: 30/min, 500/hour, 5000/day per wallet

### Per-Tool Pricing

| Tool | Price (USDC) | Notes |
|------|-------------|-------|
| `analyze_video` (standard) | $0.02 | Full pipeline, ~$0.003 AI cost |
| `analyze_video` (deep) | $0.05 | Additional AI calls for quality + design context |
| `get_commercial_entities` | $0.005 | Entities only, may hit cache |
| `get_monetization_opportunities` | $0.01 | Scoring on existing or new analysis |
| `get_audience_insights` | $0.01 | Intent analysis |
| `discover_content_gaps` | $0.02 | Cross-video market analysis |
| `batch_analyze` (per video) | $0.015 | Bulk discount (vs $0.02 individual) |
| `discover_opportunities` | $0.02 | Convergence scoring |
| `scan_affiliate_programs` | $0.01 | Network search |
| `assess_channel_authority` | $0.01 | Channel evaluation |
| `map_category_affinity` | $0.005 | Cross-category mapping |
| `track_category_lifecycle` | $0.005 | Lifecycle state tracking |
| `get_seasonal_calendar` | $0.005 | Regional calendar |

## Brand Monitoring (Month 6+)

| Plan | Price | Includes |
|------|-------|----------|
| Brand Watch | $299/mo | Track 5 products across all analyzed videos, monthly reports |
| Brand Pro | $999/mo | Track 50 products, weekly reports, competitive analysis, trend alerts |

## Value Proposition (Why Users Pay)

### For Creators ($29/mo → finds $200+/mo in missed revenue)

> "Your video mentions 14 shoppable products. You linked 3 in your description. Here are the other 11 with product names, timestamps, and purchase categories."

The creator already has affiliate accounts (Amazon Associates, Awin, etc.). They just don't have time to find every product mention and match it. We do that in 3 seconds.

**ROI: 7x or higher.** Even finding $50/month in additional affiliate revenue makes the $29 subscription worthwhile.

### For Agencies ($299/mo → replaces $4K/mo analyst)

> "Across your 40 managed channels: 2,847 unmonetized product mentions this month. Estimated unrealized revenue: $34K."

A human analyst reviews ~10-15 videos/day and catches maybe 60% of mentions. We analyze every video, catch 90%+, and cost 13x less.

### For Agent Builders ($0.02/call → saves $50K+ build cost)

One MCP tool call returns what would take 5-7 separate APIs and months of engineering to build: domain-specific NER, commerce scoring, audience intent, market positioning.

## Cost Structure

| Component | Cost per call |
|-----------|--------------|
| YouTube transcript fetch | ~$0.00 (free API) |
| Token preprocessing (70-90% reduction) | ~$0.00 (local) |
| GPT-4o-mini NER extraction | ~$0.002-0.004 |
| Entity resolution (local dictionary) | ~$0.00 |
| Intelligence scoring (local) | ~$0.00 |
| **Total standard analysis** | **~$0.003** |
| **Gross margin** | **~85-95%** |

### Caching Savings

Repeated calls to the same video return cached results at zero AI cost. Cache TTL defaults to 7 days.

## Competitive Comparison

| Service | Cost | What You Get |
|---------|------|--------------|
| YouTube Data API | Free (quota limited) | Metadata only, no NER |
| Assembly AI / Deepgram | $0.10-0.30/video | Transcript only |
| OpenAI (DIY NER) | $0.05-0.20/video | Raw extraction, no domain knowledge |
| SEMrush / Ahrefs API | $0.10-0.50/query | Keyword data, no video context |
| **DIY total** | **$0.25-1.20/video** | Stitched together, no commerce scoring |
| **Video Commerce MCP** | **$0.02/video** | Complete commercial intelligence, cached |

**10-60x cost advantage** with better results (domain-specific NER, commerce scoring, market intelligence).

## x402 Payment Flow

1. Client sends MCP tool request
2. If no payment header and free tier exhausted, server returns HTTP 402 with pricing info
3. Client obtains USDC on Base network
4. Client includes x402 payment header in request
5. Server verifies payment via x402 facilitator
6. Tool executes and returns result
7. Payment receipt logged for both parties

For x402 protocol details, see the [x402 specification](https://github.com/coinbase/x402).

## Revenue Tracking

The server tracks revenue per tool and per agent wallet. Administrators can query usage statistics via the `UsageMetering` API:

- Total calls and revenue by tool
- Per-agent usage patterns
- Rate limit status
- Daily/weekly/monthly aggregates
