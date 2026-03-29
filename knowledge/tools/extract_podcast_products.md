# extract_podcast_products — Operational Knowledge

Living document of what works, what fails, and parameter sweet spots for this tool.
Updated by whoever touches this tool — agent or human.

## What it does

Takes a podcast transcript + show metadata, returns structured product mentions with confidence scores, recommendation strength, speaker attribution, and aesthetic tags.

## Known good inputs

- **Transcript length sweet spot:** 2,000–15,000 words. Shorter transcripts have too few products to be useful. Longer ones increase LLM cost but don't proportionally increase extraction quality.
- **Show name matters:** The LLM uses show context for category inference. "Health Optimization Podcast" biases toward supplement/wellness categories. Generic names produce less accurate categorization.
- **Episode ID:** Used as cache key. Use a stable, unique identifier per episode. Date-stamped IDs (`show-2026-03-24`) prevent cache collisions. The smoke test bug (INC-2026-03-19) was caused by reusing `smoke-test-nl-001` across different content.

## Known failure modes

- **Cold start + LLM timeout:** First call after idle can take 46s if the LLM API is slow. Fixed in daef69d: timeout errors no longer trigger retries (was compounding delay via isRetryableError). Worst case now ~20s with 0 products returned.
- **Entity resolution gaps:** Same product under different names appears as separate entries ("Athletic Greens AG1" vs "AG1 Athletic Greens" vs "AG1"). The `brand` field exists but is not used for deduplication. Known limitation — address if traction signal arrives.
- **Negative sentiment not distinguished in trends:** A product mentioned negatively (host drops endorsement) still gets `trend: "rising"` if it appears in multiple episodes, because trending is based on episode presence, not sentiment. `avg_recommendation_strength` averages across episodes but doesn't flag polarity swings.
- **Hallucinated products:** Rare but observed in smoke testing — LLM occasionally returns products not in the transcript. Confidence scores for hallucinations tend to be <0.7. Filter by confidence threshold in downstream usage.

## Parameter sweet spots

| Parameter | Recommended | Notes |
|-----------|-------------|-------|
| `transcript` | 2k–15k words | Diminishing returns beyond 15k |
| `show_name` | Specific, descriptive | Helps LLM categorize correctly |
| `episode_id` | Unique, date-stamped | Prevents cache collision |

## Cost profile

- **Cache miss (new transcript):** ~$0.0004 LLM cost, 4–13 seconds
- **Cache hit:** $0.00, 5–15ms
- **Cache TTL:** 7 days (KV-based on Workers)

## What downstream consumers should know

- Filter by `confidence >= 0.7` to remove weak/hallucinated mentions
- `recommendation_strength` values: `"strong"` (host endorsement with promo code), `"moderate"` (genuine recommendation), `"mention"` (name-dropped), `"negative"` (explicitly dropped/criticized)
- `speaker` attribution: `"host"` endorsements convert better than `"guest"` mentions for affiliate use
- Cross-show analysis (`track_product_trends`) is more valuable than single-episode extraction — consensus picks across 3+ shows are highest-conviction affiliate targets
