# Domain Expansion Guide

The Video Commerce Intelligence MCP is built on a domain-agnostic architecture. While gardening is the default (and most developed) vertical, the same pipeline can analyze video content in any product-oriented domain.

## How Verticals Work

Each vertical provides three things:

1. **Domain Dictionary** -- A JSON file mapping entity names to canonical forms (like `plant-dictionary-sample.json` for gardening)
2. **Category Keywords** -- Patterns that identify commerce items in transcripts (500+ for gardening)
3. **Prompt Tuning** -- Domain-specific instructions for the AI extraction model

The pipeline itself -- transcript fetching, preprocessing, NER extraction, entity resolution, commercial scoring, audience intent analysis -- is identical across verticals.

## Vertical Configuration Interface

```typescript
interface VerticalConfig {
  /** Unique identifier, e.g. "gardening", "cooking", "diy" */
  id: string;

  /** Display name, e.g. "Gardening", "Cooking & Food" */
  name: string;

  /** Domain dictionary: canonical entities with synonyms */
  dictionary: DomainDictionaryEntry[];

  /** Category keyword patterns for transcript preprocessing */
  categoryKeywords: CategoryKeywordSet;

  /** NER prompt tuning for the AI model */
  nerPrompt: {
    systemContext: string;
    entityTypes: string[];
    exampleExtractions: Array<{
      input: string;
      output: string[];
    }>;
  };

  /** Affiliate networks relevant to this vertical */
  affiliateNetworks: AffiliateNetwork[];

  /** Seasonal patterns specific to this vertical */
  seasonalPatterns?: SeasonalPattern[];
}
```

## Adding a New Vertical

### Step 1: Create the Domain Dictionary

Create a JSON file with canonical entities for your domain. Example for cooking:

```json
[
  {
    "name": "KitchenAid Stand Mixer",
    "category": "TOOL",
    "synonyms": ["KitchenAid", "stand mixer", "Kitchen Aid mixer"],
    "brands": ["KitchenAid"],
    "priceRange": { "min": 250, "max": 600 }
  },
  {
    "name": "San Marzano Tomatoes",
    "category": "MATERIAL",
    "synonyms": ["San Marzano", "DOP tomatoes"],
    "isShoppable": true
  }
]
```

### Step 2: Define Category Keywords

Each category needs keyword patterns that the preprocessor uses to identify relevant transcript segments. Example for cooking:

```typescript
const cookingKeywords: CategoryKeywordSet = {
  TOOL: {
    keywords: [
      "knife", "pan", "pot", "mixer", "blender", "oven",
      "thermometer", "mandoline", "immersion blender",
      "dutch oven", "cast iron", "sous vide"
    ],
    brands: [
      "KitchenAid", "Le Creuset", "All-Clad", "Vitamix",
      "Wusthof", "Global", "Lodge", "Thermapen"
    ]
  },
  MATERIAL: {
    keywords: [
      "flour", "sugar", "butter", "oil", "salt", "pepper",
      "vanilla", "chocolate", "yeast", "cream"
    ],
    brands: [
      "King Arthur", "Kerrygold", "Valrhona", "Maldon"
    ]
  }
};
```

### Step 3: Write NER Prompt Tuning

Provide domain context and examples so the AI model knows what to extract:

```typescript
const cookingNerPrompt = {
  systemContext: `You are analyzing a cooking/food video transcript.
Extract all mentioned ingredients, equipment, techniques, brands,
and recipe references. Pay attention to specific product names,
brand mentions, and professional terminology.`,

  entityTypes: [
    "ingredient", "tool", "technique", "recipe",
    "brand", "cuisine", "course_material"
  ],

  exampleExtractions: [
    {
      input: "I'm using my Vitamix to blend the San Marzano tomatoes",
      output: ["Vitamix (tool)", "San Marzano tomatoes (ingredient)"]
    }
  ]
};
```

### Step 4: Register the Vertical

```typescript
import { registerVertical } from "video-commerce-mcp";

registerVertical({
  id: "cooking",
  name: "Cooking & Food",
  dictionary: cookingDictionary,
  categoryKeywords: cookingKeywords,
  nerPrompt: cookingNerPrompt,
  affiliateNetworks: [
    { name: "Amazon Associates", id: "amazon", categories: ["kitchen"] },
    { name: "Sur La Table Affiliate", id: "surLaTable", categories: ["cookware"] }
  ],
  seasonalPatterns: [
    { event: "Thanksgiving", months: [10, 11], categories: ["turkey", "pies", "roasting"] },
    { event: "Grilling Season", months: [5, 6, 7, 8], categories: ["grills", "bbq", "marinades"] }
  ]
});
```

## Candidate Verticals

### Cooking / Food

- **Entity types**: ingredients, equipment, techniques, cuisines, recipes
- **Commerce items**: kitchen tools, specialty ingredients, cookware, cookbooks
- **Dictionary size estimate**: 2000+ entries
- **Affiliate networks**: Amazon, Sur La Table, Williams-Sonoma, specialty food retailers
- **Seasonal events**: Thanksgiving, Christmas baking, grilling season, harvest season

### DIY / Home Improvement

- **Entity types**: tools, materials, techniques, project types, safety equipment
- **Commerce items**: power tools, lumber, hardware, finishes, safety gear
- **Dictionary size estimate**: 3000+ entries
- **Affiliate networks**: Amazon, Home Depot, Lowes, Rockler
- **Seasonal events**: Spring renovation, holiday decorating, outdoor season

### Tech Reviews

- **Entity types**: products, specs, features, alternatives, accessories
- **Commerce items**: electronics, software, accessories, peripherals
- **Dictionary size estimate**: 1500+ entries (fast-changing)
- **Affiliate networks**: Amazon, B&H Photo, Best Buy, manufacturer direct
- **Seasonal events**: CES, Black Friday, back-to-school, product launch cycles

### Fashion / Beauty

- **Entity types**: products, brands, styles, occasions, materials
- **Commerce items**: clothing, accessories, beauty products, styling tools
- **Dictionary size estimate**: 5000+ entries
- **Affiliate networks**: Amazon, ASOS, Sephora, Nordstrom, brand affiliate programs
- **Seasonal events**: Fashion weeks, holiday gifting, summer/winter collections

### Fitness / Wellness

- **Entity types**: equipment, exercises, programs, supplements, body parts
- **Commerce items**: fitness equipment, supplements, apparel, trackers
- **Dictionary size estimate**: 1500+ entries
- **Affiliate networks**: Amazon, REI, MyProtein, Rogue Fitness
- **Seasonal events**: New Year resolutions, summer body prep, marathon season

## What Stays the Same Across Verticals

- Transcript fetching and preprocessing pipeline
- NER extraction framework (GPT-4o-mini)
- Entity resolution algorithm (Levenshtein + Jaro-Winkler)
- Commercial scoring methodology
- Audience intent archetypes (the 7 archetypes are universal)
- MCP tool interface and pricing
- Payment and metering infrastructure
- Cache system

## What Changes Per Vertical

- Domain dictionary (entities and synonyms)
- Category keyword patterns
- AI prompt context and examples
- Affiliate network configuration
- Seasonal calendar events
- Vertical-specific scoring weights (e.g., "botanical literacy" becomes "culinary technique depth")
