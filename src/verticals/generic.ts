/**
 * Generic (Fallback) Vertical Configuration
 *
 * Used when no specific vertical can be detected. Provides minimal
 * commerce categories and intent archetypes that work across any domain.
 * Low filteringAggressiveness to avoid discarding relevant content.
 */

import type { VerticalConfig } from "./vertical-config.js";

export const GENERIC_VERTICAL: VerticalConfig = {
  // ---- Identity ----
  id: "generic",
  displayName: "General Content",
  description:
    "Fallback vertical for content that does not match a specific domain. " +
    "Generic product extraction with minimal filtering.",
  version: "1.0.0",

  // ---- Entity Extraction ----
  primaryEntityType: "product",
  primaryEntityTypePlural: "products",

  entityPatterns: [],

  contentSignals: {
    inclusionKeywords: [
      "buy", "purchase", "recommend", "product", "use", "try",
      "available", "link", "shop", "review", "best", "top",
    ],
    exclusionKeywords: [
      "subscribe", "like and subscribe", "hit the bell",
    ],
  },

  nerPrompt: {
    systemMessage:
      "You are a product extraction AI. Identify all specific products, " +
      "brands, tools, services, and shoppable items mentioned in the content.",

    promptTemplate:
      `Analyze the following transcript and identify all specific products, brands, tools, " +
      "services, or shoppable items mentioned.

TRANSCRIPT:
{{transcript}}

Respond with a JSON array of objects, each with:
- entity: The product or item name
- metadata: { brand, category, quantity }
- timestamp: approximate timestamp from transcript (if available)
- context: the sentence where mentioned
- confidence: 0-1 score`,

    modelName: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 2000,
  },

  // ---- Commerce Categories ----
  commerceCategories: [
    {
      id: "PRODUCT",
      displayName: "Products",
      isPrimary: true,
      keywords: [
        "product", "item", "buy", "purchase", "shop", "store",
        "brand", "model", "version", "edition", "release",
        "recommend", "review", "rating", "worth", "value",
        "kit", "bundle", "set", "pack", "package",
      ],
    },
    {
      id: "SERVICE",
      displayName: "Services",
      keywords: [
        "service", "subscription", "plan", "tier", "pricing",
        "platform", "tool", "software", "app", "application",
        "course", "program", "membership", "access",
      ],
    },
    {
      id: "OTHER",
      displayName: "Other",
      keywords: [
        "link in description", "check out", "available at",
        "affiliate", "sponsor", "ad", "advertisement",
      ],
    },
  ],

  // ---- Intent Archetypes ----
  intentArchetypes: [
    {
      key: "product_purchase",
      name: "Product Purchase",
      description: "Viewers with direct purchase intent",
      weight: 0.9,
      triggerPhrases: [
        "I recommend", "my favorite", "link in description",
        "I use this", "buy", "purchase", "order", "check out",
      ],
      ctaSuggestions: ["Buy now", "Shop this", "Learn more"],
      dominantEmotions: ["desire", "confidence"],
    },
    {
      key: "learning",
      name: "Learning",
      description: "Viewers wanting to learn or improve",
      weight: 0.6,
      triggerPhrases: [
        "how to", "step by step", "beginner", "guide",
        "let me show you", "tutorial", "learn",
      ],
      ctaSuggestions: ["Download the guide", "Enroll now"],
      dominantEmotions: ["curiosity", "determination"],
    },
    {
      key: "research",
      name: "Research",
      description: "Viewers comparing options before purchasing",
      weight: 0.7,
      triggerPhrases: [
        "best", "compare", "review", "vs", "versus",
        "pros and cons", "worth it", "should I buy",
      ],
      ctaSuggestions: ["Compare options", "Read full review"],
      dominantEmotions: ["curiosity", "caution"],
    },
  ],

  // ---- Affiliate Networks ----
  affiliateNetworks: [
    {
      networkId: "amazon",
      networkName: "Amazon Associates",
      enabled: true,
      searchKeywords: ["products", "items", "tools"],
    },
    {
      networkId: "shareasale",
      networkName: "ShareASale",
      enabled: false,
      searchKeywords: ["products"],
    },
  ],

  // ---- Seasonal Config ----
  seasonal: {
    isSeasonDependent: false,
  },

  // ---- Video Structure ----
  videoStructure: {
    skipIntroSeconds: 15,
    skipOutroSeconds: 15,
    minLengthForSkipping: 120,
  },

  // ---- Filtering ----
  // Very low aggressiveness — do not discard content for unknown domains
  filteringAggressiveness: 0.1,
};
