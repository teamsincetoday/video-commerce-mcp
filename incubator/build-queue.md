# Build Queue

> Remi writes. Kai reads. Structured handoff from discovery → development.
> Format: one entry per opportunity. Kai moves to Completed when shipped.

## Queue

### podcast-commerce-mcp
- **Source**: Discovery report 2026-03-04 (market analysis at `incubator/discovery/2026-03.md`)
- **Rationale**: Podcast monetization market growing 35%+ annually. No existing MCP for agent-readable product extraction from podcasts. Fills clear ecosystem gap—top MCPs are infrastructure (browser automation, reasoning), not content extraction. Demand signal: podcast intelligence platforms (Podscan, Stacker) proving concept viability. Estimated addressable market: 2,000+ podcast networks + sponsors seeking agent-native product integration.
- **Traction evidence**:
  - Traction window: 2026-03-04 → 2026-03-18 (started yesterday)
  - Success thresholds: >40 tool calls week 1, >5 unique agents, cross-category extraction working
  - Market validation: Podcast ad revenue $1.9B (2023) → $2.6B (2026). Sponsorships $25-$50 CPM host-read. Video podcast consumption on Spotify +100% YoY.
  - No competitor MCP exists for this use case
- **Spec**:
  - Extract product mentions + recommendations from podcast transcripts
  - Speaker attribution + sentiment scoring on recommendations
  - Multi-category product NER (physical goods, SaaS, courses, affiliate)
  - Episode-to-episode trending analysis
  - x402 pricing: Free tier (1 extract/day), $0.001/extract above that
  - Inputs: podcast URL or transcript + category filters
  - Outputs: JSON array of products {name, category, mention_context, speaker, confidence, recommendation_strength, affiliate_link}
- **Priority**: P0 (start this week)
- **Added**: 2026-03-05
- **Status**: shipped — 2026-03-05 (lab day). 3 tools, 29/29 tests, clean build. `/home/jonathan/podcast-commerce-mcp/`. Needs npm publish (blocked on Jonathan).

## Template

```
### [Tool/Feature Name]
- **Source**: discovery report / signal / traction data
- **Rationale**: Why build this now (demand, commission, authority scores)
- **Traction evidence**: What data supports this (calls, agents, revenue, mentions)
- **Spec**: What it does, inputs, outputs, pricing tier
- **Priority**: P0 (this week) / P1 (next week) / P2 (backlog)
- **Added**: YYYY-MM-DD
- **Status**: queued / in-progress / shipped / pivoted
```

## Completed

*(entries move here when shipped or pivoted)*
