# Tool Reference

Complete reference for all 12 tools exposed by the Video Commerce Intelligence MCP Server.

---

## Layer 1 -- Video Intelligence

### analyze_video

Full commercial intelligence analysis of a YouTube video. The flagship tool. Returns up to six intelligence dimensions: entities, monetization, audience intent, content quality, skill graph, and market position.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `youtube_url` | string | Yes | Full YouTube URL (youtube.com/watch?v= or youtu.be/) |
| `analysis_depth` | `"standard"` or `"deep"` | No | Standard uses one AI call; deep adds quality and design context analysis. Default: `"standard"` |
| `focus` | string[] | No | Which dimensions to include: `"entities"`, `"monetization"`, `"audience"`, `"quality"`, `"skills"`, `"market"`. Default: all six |

**Example Input:**
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "analysis_depth": "standard",
  "focus": ["entities", "monetization", "audience"]
}
```

**Example Output:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "title": "Autumn Border Planting Masterclass",
  "channel": "Garden Answer",
  "duration_seconds": 1247,
  "language": "en",
  "analysis_timestamp": "2026-03-03T12:00:00Z",
  "commercial_intent_score": 82,
  "entities": [
    {
      "name": "Helenium 'Sahin's Early Flowerer'",
      "scientific_name": "Helenium autumnale 'Sahin's Early Flowerer'",
      "category": "plant",
      "confidence": 0.94,
      "is_shoppable": true,
      "mentions": [
        {
          "timestamp_seconds": 142,
          "context": "This helenium has been flowering since July..."
        }
      ],
      "monetization_potential": {
        "affiliate_score": 0.85,
        "course_relevance": 0.6,
        "content_gap": 0.4
      }
    },
    {
      "name": "Felco No. 2 Secateurs",
      "category": "tool",
      "confidence": 0.88,
      "is_shoppable": true,
      "mentions": [
        {
          "timestamp_seconds": 89,
          "context": "Using my trusty Felco twos..."
        }
      ],
      "monetization_potential": {
        "affiliate_score": 0.92,
        "review_opportunity": 0.7,
        "comparison_content": 0.8
      }
    }
  ],
  "audience_intent": {
    "dominant_intent": "seasonal_action",
    "intents": [
      {
        "type": "seasonal_action",
        "score": 0.89,
        "emotion": "motivation",
        "commercial_value": 0.9,
        "recommended_cta": "Shop autumn planting essentials"
      }
    ]
  },
  "quality": {
    "editorial_tier": "FEATURED",
    "teaching_score": 78,
    "visual_quality": 85,
    "botanical_literacy": 92,
    "standfirst": "A masterclass in autumn border planting with bold perennials"
  },
  "skills": {
    "primary": {
      "name": "autumn_border_planting",
      "level": "intermediate",
      "teaching_quality": 82
    },
    "prerequisites": ["soil_preparation", "perennial_basics"],
    "next_skills": ["color_theory_planting", "winter_structure"]
  },
  "market_position": {
    "trend_direction": "rising",
    "competition_level": 0.45,
    "content_gaps_nearby": [
      "autumn container planting",
      "helenium varieties comparison"
    ],
    "estimated_monthly_search_volume": 12400
  },
  "meta": {
    "cached": false,
    "processing_time_ms": 12500,
    "ai_cost_usd": 0.003,
    "pipeline_stages": ["transcript", "preprocess", "ner", "intelligence"]
  }
}
```

**Pricing:** 0.02 USDC (standard) / 0.05 USDC (deep)

---

### get_commercial_entities

Quick extraction of named entities with commercial categories. Faster and cheaper than full analysis -- ideal for agents that just need the entity list.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `youtube_url` | string | Yes | Full YouTube URL |
| `categories` | string[] | No | Filter to specific categories: `"plant"`, `"tool"`, `"material"`, `"seed"`, `"structure"`, `"book"`, `"course"`, `"service"`, `"event"`. Default: all |

**Example Input:**
```json
{
  "youtube_url": "https://www.youtube.com/watch?v=abc123",
  "categories": ["plant", "tool"]
}
```

**Example Output:**
```json
{
  "video_id": "abc123",
  "entity_count": 18,
  "entities": [
    {
      "name": "Lavandula angustifolia 'Hidcote'",
      "category": "plant",
      "confidence": 0.91,
      "is_shoppable": true,
      "mention_count": 3
    },
    {
      "name": "Felco No. 2 Secateurs",
      "category": "tool",
      "confidence": 0.88,
      "is_shoppable": true,
      "mention_count": 1
    }
  ]
}
```

**Pricing:** 0.005 USDC

---

### get_monetization_opportunities

Given a video URL or a previous analysis, returns ranked monetization strategies with estimated revenue potential.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `youtube_url` | string | Yes | Full YouTube URL |

**Example Output:**
```json
{
  "video_id": "abc123",
  "opportunities": [
    {
      "strategy": "affiliate_commerce",
      "score": 0.87,
      "entities_applicable": 14,
      "estimated_revenue_per_1k_views": 4.20,
      "recommended_products": [
        "Helenium 'Sahin's Early'",
        "Felco No. 2"
      ],
      "reasoning": "High purchase intent (0.89), 14 shoppable entities, autumn buying season"
    },
    {
      "strategy": "course_creation",
      "score": 0.72,
      "skill_foundation": "autumn_border_planting",
      "prerequisite_coverage": 0.8,
      "reasoning": "Strong teaching quality (82), clear skill progression, intermediate level with high demand"
    },
    {
      "strategy": "sponsored_content",
      "score": 0.65,
      "brand_fit_categories": [
        "garden_tools",
        "compost",
        "plant_nurseries"
      ],
      "reasoning": "Channel authority 78, trusted editorial voice, natural product integration"
    }
  ]
}
```

**Pricing:** 0.01 USDC

---

### get_audience_insights

Deep audience intent analysis. Maps viewer intent to 7 archetypes with emotions, commercial values, and recommended CTAs.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `youtube_url` | string | Yes | Full YouTube URL |

**7 Intent Archetypes:**

1. **seasonal_action** -- Viewers ready to act on seasonal timing
2. **problem_solving** -- Viewers looking to fix a specific issue
3. **aspiration** -- Viewers dreaming about a future garden/project
4. **education** -- Viewers learning a new skill or concept
5. **comparison** -- Viewers comparing products or approaches
6. **maintenance** -- Viewers maintaining existing work
7. **entertainment** -- Viewers watching for enjoyment

**Example Output:**
```json
{
  "video_id": "abc123",
  "dominant_intent": "seasonal_action",
  "intents": [
    {
      "type": "seasonal_action",
      "score": 0.89,
      "emotion": "motivation",
      "commercial_value": 0.9,
      "recommended_cta": "Shop autumn planting essentials",
      "viewer_segment": "Active gardeners preparing for autumn"
    },
    {
      "type": "education",
      "score": 0.65,
      "emotion": "curiosity",
      "commercial_value": 0.5,
      "recommended_cta": "Start the autumn planting course",
      "viewer_segment": "Beginner gardeners learning perennial care"
    }
  ],
  "high_value_segments": [
    {
      "segment": "Autumn plant buyers",
      "estimated_size_pct": 0.45,
      "average_basket_value": 42.50
    }
  ]
}
```

**Pricing:** 0.01 USDC

---

### discover_content_gaps

Given a topic or category, returns market gaps -- content that viewers want but that does not exist yet.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | Yes | Topic or category to analyze (e.g., "autumn perennials", "raised beds") |
| `region` | string | No | Region for localized data (e.g., "UK", "US", "NL"). Default: global |

**Example Input:**
```json
{
  "category": "autumn perennials",
  "region": "UK"
}
```

**Example Output:**
```json
{
  "category": "autumn perennials",
  "region": "UK",
  "gaps": [
    {
      "topic": "helenium variety comparison",
      "demand_score": 0.78,
      "competition": 0.23,
      "opportunity_score": 0.85,
      "estimated_monthly_searches": 2400,
      "trend": "rising",
      "recommendation": "invest_now",
      "monetization_angles": ["affiliate", "sponsored"]
    },
    {
      "topic": "late-season aster combinations",
      "demand_score": 0.65,
      "competition": 0.31,
      "opportunity_score": 0.71,
      "estimated_monthly_searches": 1800,
      "trend": "stable",
      "recommendation": "watch_closely",
      "monetization_angles": ["affiliate"]
    }
  ],
  "emerging_topics": [
    "no-dig perennial borders",
    "wildlife-friendly autumn planting"
  ],
  "declining_topics": [
    "traditional herbaceous border maintenance"
  ]
}
```

**Pricing:** 0.02 USDC

---

### batch_analyze

Analyze multiple videos (up to 10) in a single request. Returns individual analyses plus a cross-video comparison showing shared entities, complementary topics, and combined audience insights.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `youtube_urls` | string[] | Yes | Array of YouTube URLs (max 10) |
| `analysis_depth` | `"standard"` or `"deep"` | No | Default: `"standard"` |
| `compare` | boolean | No | Include cross-video comparison. Default: true |

**Example Input:**
```json
{
  "youtube_urls": [
    "https://www.youtube.com/watch?v=abc123",
    "https://www.youtube.com/watch?v=def456",
    "https://www.youtube.com/watch?v=ghi789"
  ],
  "analysis_depth": "standard",
  "compare": true
}
```

**Example Output:**
```json
{
  "videos_analyzed": 3,
  "results": [
    { "video_id": "abc123", "...": "full analysis" },
    { "video_id": "def456", "...": "full analysis" },
    { "video_id": "ghi789", "...": "full analysis" }
  ],
  "comparison": {
    "shared_entities": [
      { "name": "Felco No. 2 Secateurs", "appears_in": 3, "avg_confidence": 0.90 }
    ],
    "unique_entities_per_video": {
      "abc123": ["Helenium 'Sahin's Early'"],
      "def456": ["Dahlia 'Bishop of Llandaff'"],
      "ghi789": ["Rudbeckia fulgida"]
    },
    "complementary_topics": [
      "autumn border maintenance",
      "late-season color combinations"
    ],
    "combined_audience_map": {
      "seasonal_action": 0.82,
      "education": 0.71
    }
  }
}
```

**Pricing:** 0.015 USDC per video (bulk discount vs 0.02 for individual)

---

## Layer 2 -- Market Intelligence

### discover_opportunities

Convergence scoring: identifies where demand, commission potential, and authority align. Returns opportunities ranked with actionable recommendations.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `vertical` | string | No | Vertical to analyze (default: "gardening") |
| `min_score` | number | No | Minimum convergence score threshold (0-1). Default: 0.3 |

**Recommendation Levels:**
- `invest_now` -- High convergence, strong signal, immediate action recommended
- `watch_closely` -- Good potential, monitor for strengthening signals
- `test_small` -- Moderate potential, worth a small experiment
- `skip` -- Low convergence, not worth pursuing now

**Example Output:**
```json
{
  "vertical": "gardening",
  "opportunities": [
    {
      "category": "native plants",
      "convergence_score": 0.87,
      "demand_score": 0.82,
      "commission_score": 0.79,
      "authority_score": 0.91,
      "recommendation": "invest_now",
      "reasoning": "Rising trend, strong affiliate programs, high channel authority in this space",
      "content_suggestions": [
        "native plant garden design",
        "best native plants by region"
      ]
    }
  ],
  "market_overview": {
    "total_categories_analyzed": 42,
    "invest_now_count": 3,
    "watch_closely_count": 8,
    "test_small_count": 12,
    "skip_count": 19
  }
}
```

**Pricing:** 0.02 USDC

---

### scan_affiliate_programs

Search affiliate networks (Awin, CJ, ShareASale) for programs matching a category or vertical.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | Yes | Category to search (e.g., "garden tools", "plant nurseries") |
| `region` | string | No | Region filter (e.g., "UK", "US"). Default: all |

**Example Input:**
```json
{
  "category": "garden tools",
  "region": "UK"
}
```

**Example Output:**
```json
{
  "category": "garden tools",
  "region": "UK",
  "programs": [
    {
      "name": "Crocus.co.uk",
      "network": "awin",
      "commission_rate": 0.08,
      "commission_type": "percentage",
      "cookie_duration_days": 30,
      "relevance_score": 0.92,
      "categories": ["plants", "garden tools", "garden furniture"],
      "url": "https://www.awin.com/..."
    },
    {
      "name": "Harrod Horticultural",
      "network": "awin",
      "commission_rate": 0.06,
      "commission_type": "percentage",
      "cookie_duration_days": 45,
      "relevance_score": 0.85,
      "categories": ["garden structures", "garden tools"],
      "url": "https://www.awin.com/..."
    }
  ],
  "summary": {
    "total_found": 14,
    "avg_commission_rate": 0.07,
    "best_commission_rate": 0.12,
    "networks_covered": ["awin", "cj"]
  }
}
```

**Pricing:** 0.01 USDC

---

### assess_channel_authority

5-dimension channel authority scoring. Evaluates a YouTube channel across reach, engagement, quality, trust, and commercial performance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `channel_url` | string | Yes | YouTube channel URL or @handle |

**5 Dimensions:**
1. **Reach** -- Subscriber count, view counts, growth trajectory
2. **Engagement** -- Like ratio, comment rate, community activity
3. **Quality** -- Production value, editorial consistency, content depth
4. **Trust** -- Expertise signals, citations, industry recognition
5. **Commercial** -- Monetization maturity, product integration, affiliate readiness

**Example Output:**
```json
{
  "channel": "Garden Answer",
  "channel_url": "https://youtube.com/@GardenAnswer",
  "overall_score": 78,
  "dimensions": {
    "reach": { "score": 85, "signals": ["1.2M subscribers", "rising trajectory"] },
    "engagement": { "score": 72, "signals": ["4.2% like ratio", "active comments"] },
    "quality": { "score": 82, "signals": ["high production value", "consistent uploads"] },
    "trust": { "score": 76, "signals": ["expert credentials", "industry partnerships"] },
    "commercial": { "score": 68, "signals": ["some affiliate links", "sponsored content"] }
  },
  "confidence": 0.85,
  "recommendation": "Strong channel for affiliate partnerships and sponsored content"
}
```

**Pricing:** 0.01 USDC

---

### map_category_affinity

Cross-category relationship mapping. Given a category, returns related categories with affinity scores, relationship types, and expansion paths for cross-selling.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | Yes | Category to map relationships for |
| `depth` | number | No | Traversal depth (1-5). Default: 2 |

**Example Input:**
```json
{
  "category": "perennials",
  "depth": 2
}
```

**Example Output:**
```json
{
  "category": "perennials",
  "related": [
    {
      "category": "garden design",
      "affinity_score": 0.82,
      "relationship": "complementary",
      "shared_keywords": ["border planting", "color theory"],
      "cross_sell_potential": 0.75
    },
    {
      "category": "soil preparation",
      "affinity_score": 0.71,
      "relationship": "prerequisite",
      "shared_keywords": ["soil amendment", "mulching"],
      "cross_sell_potential": 0.60
    }
  ],
  "expansion_paths": [
    {
      "from": "perennials",
      "to": "native plants",
      "via": "garden design",
      "path_strength": 0.68
    }
  ]
}
```

**Pricing:** 0.005 USDC

---

### track_category_lifecycle

Track the lifecycle state of a category. Categories move through stages: emerging, growing, mature, declining. Returns current state, transition signals, and predicted next state.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `category` | string | Yes | Category to track |

**Lifecycle Stages:**
- **emerging** -- New category, low content volume, rising interest signals
- **growing** -- Accelerating content production and audience interest
- **mature** -- Stable content volume, established audience, competitive
- **declining** -- Decreasing interest, content fatigue

**Example Output:**
```json
{
  "category": "no-dig gardening",
  "current_stage": "growing",
  "stage_entered_at": "2025-08-15T00:00:00Z",
  "confidence": 0.82,
  "signals": {
    "positive": [
      "Search volume +45% YoY",
      "New creator content +30%",
      "Strong affiliate commission rates"
    ],
    "negative": [
      "Increasing competition from established channels"
    ]
  },
  "predicted_next_stage": "mature",
  "transition_probability": 0.65,
  "estimated_transition": "6-12 months",
  "recommendation": "Invest now while competition is still moderate"
}
```

**Pricing:** 0.005 USDC

---

### get_seasonal_calendar

Region-specific commerce calendar with seasonal events, demand multipliers, and promotional timing intelligence.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `region` | string | Yes | Region code (e.g., "UK", "US", "NL", "DE", "AU") |
| `months_ahead` | number | No | How many months ahead to include (1-12). Default: 3 |

**Example Input:**
```json
{
  "region": "UK",
  "months_ahead": 3
}
```

**Example Output:**
```json
{
  "region": "UK",
  "current_season": "early_spring",
  "events": [
    {
      "name": "Spring Planting Season",
      "start_date": "2026-03-01",
      "end_date": "2026-05-31",
      "demand_multiplier": 2.4,
      "relevant_categories": [
        "seeds",
        "perennials",
        "garden tools",
        "compost"
      ],
      "promotional_tip": "Seed and bulb promotions peak in March. Garden tool demand rises through April."
    },
    {
      "name": "Chelsea Flower Show",
      "start_date": "2026-05-19",
      "end_date": "2026-05-23",
      "demand_multiplier": 1.8,
      "relevant_categories": [
        "garden design",
        "premium plants",
        "garden tours"
      ],
      "promotional_tip": "Content about show gardens and designer plants converts well during and after the event."
    }
  ],
  "upcoming_peaks": [
    {
      "category": "seeds",
      "peak_month": "March",
      "demand_multiplier": 3.1
    }
  ]
}
```

**Pricing:** 0.005 USDC
