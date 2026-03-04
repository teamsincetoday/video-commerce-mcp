/**
 * Gardening Vertical Configuration
 *
 * The default vertical — extracted from hardcoded patterns throughout
 * the MyGardenShows monolith. This config captures every domain-specific
 * keyword, pattern, prompt, and taxonomy used by the pipeline.
 *
 * Source patterns extracted from:
 * - lib/config/vertical-config.ts (GARDENING_VERTICAL)
 * - lib/services/multi-category-preprocessor.ts (COMMERCE_KEYWORDS, 500+ terms)
 * - lib/services/audience-taxonomy.ts (7 intent archetypes)
 * - lib/services/seasonal-context-extractor.ts (season/climate patterns)
 * - lib/services/enhanced-ner.ts (NER prompts, variety detection rules)
 * - lib/services/affiliate-auto-discovery/ (Awin/CJ config)
 */

import type { VerticalConfig } from "./vertical-config.js";

// ============================================================================
// GARDENING VERTICAL CONFIG
// ============================================================================

export const GARDENING_VERTICAL: VerticalConfig = {
  // ---- Identity ----
  id: "gardening",
  displayName: "Gardening & Plants",
  description:
    "Plants, tools, materials, seeds, and all things garden. " +
    "Supports Latin botanical names, cultivar detection, and 9 commerce categories.",
  version: "2.0.0",

  // ---- Entity Extraction ----
  primaryEntityType: "plant",
  primaryEntityTypePlural: "plants",

  entityPatterns: [
    {
      label: "Latin botanical name (Genus species)",
      regex: "\\b[A-Z][a-z]+\\s+[a-z]{3,}(?:\\s+[a-z]+)?\\b",
      regexFlags: "g",
      capitalization: "TitleCase",
      minWordLength: 3,
      excludePhrases: [
        "Hello everyone",
        "Good morning",
        "Good afternoon",
        "Thank you",
        "Welcome back",
        "See you",
        "Next time",
      ],
    },
    {
      label: "Cultivar in single quotes",
      regex: "'([A-Z][A-Za-z\\s-]+)'",
      regexFlags: "g",
      capitalization: "TitleCase",
      minWordLength: 2,
    },
  ],

  contentSignals: {
    inclusionKeywords: [
      "plant",
      "flower",
      "tree",
      "shrub",
      "garden",
      "grow",
      "soil",
      "seed",
      "root",
      "leaf",
      "bloom",
      "prune",
      "harvest",
      "compost",
      "mulch",
      "propagate",
      "transplant",
      "perennial",
      "annual",
      "evergreen",
      "deciduous",
      "greenhouse",
      "raised bed",
      "potting",
      "fertilizer",
    ],
    exclusionKeywords: [
      "sponsor",
      "promo code",
      "discount code",
      "affiliate link",
      "subscribe",
      "like and subscribe",
      "hit the bell",
      "notification",
      "patreon",
      "merch",
    ],
  },

  nerPrompt: {
    systemMessage:
      "You are a botanical expert AI specializing in plant identification " +
      "with particular expertise in recognizing cultivars, varieties, and subspecies.",

    promptTemplate:
      `Analyze the following PRE-FILTERED transcript from a gardening video and identify ALL plant names mentioned with their specific varieties when available.

NOTE: This transcript has been pre-filtered to contain only plant-related segments.

Pre-identified Latin names from pattern matching: {{latinNames}}

{{varietyHints}}

IMPORTANT: This audience is very sensitive to plant varieties and cultivars. They care deeply about specific varieties like "Lavandula angustifolia 'Hidcote'" vs just "Lavandula angustifolia". Always capture variety, cultivar, and subspecies information when mentioned.

CRITICAL VARIETY DETECTION RULES:
1. **Quoted Names** = Cultivars: Any name in single quotes is likely a cultivar
   Example: "I planted 'Munstead' last year" -> variety: "Munstead"
   Example: "'Black Beauty' zucchini" -> variety: "Black Beauty"

2. **After Keywords**: Look for variety names after these words/phrases:
   - "variety" / "cultivar" / "cv." / "form"
   - "called" / "named" / "known as"
   - "the" + capitalized name (e.g., "the Hidcote variety")

3. **Brand Names**: Some plants are sold under trade names
   - Example: "Proven Winners" is a brand, not a variety
   - Example: "Supertunia Vista Bubblegum" = trade name for a Petunia cultivar

4. **Color Varieties**: Color words after plant names often indicate varieties
   - "blue salvia" -> variety hint: "Blue"
   - "white hydrangea" -> could be species or variety, flag both

TRANSCRIPT:
{{transcript}}

Respond with a JSON array of objects, each with:
- entity: The most specific name mentioned (prefer Latin name + cultivar)
- metadata: { latinName, commonName, variety, genus, species, quantity }
- timestamp: approximate timestamp from transcript
- context: the sentence where mentioned
- confidence: 0-1 score`,

    modelName: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 4000,

    varietyDetectionRules: [
      "Quoted names in single quotes are cultivars",
      "Names after 'variety', 'cultivar', 'cv.', 'form' are variety identifiers",
      "Color words before/after plant names may indicate varieties",
      "Trade names (Proven Winners, etc.) are brands, not varieties",
      "F1/F2 designations indicate hybrid generation",
    ],
  },

  dictionaryPath: "data/plant-dictionary.json",

  // ---- Commerce Categories (9 categories, 500+ keywords) ----
  commerceCategories: [
    {
      id: "PLANT",
      displayName: "Plants",
      isPrimary: true,
      keywords: [
        // Common genera
        "lavender", "lavandula", "tomato", "solanum", "rose", "rosa", "maple", "acer",
        "salvia", "sage", "mint", "mentha", "basil", "ocimum", "thyme", "thymus",
        "rosemary", "rosmarinus", "oregano", "origanum", "hosta", "hydrangea",
        "clematis", "geranium", "petunia", "dahlia", "tulip", "tulipa", "narcissus",
        "daffodil", "iris", "lily", "lilium", "peony", "paeonia", "delphinium",
        // Gardening actions
        "plant", "planting", "prune", "pruning", "propagate", "propagating",
        "transplant", "transplanting", "sow", "sowing", "harvest", "harvesting",
        // Plant characteristics
        "flower", "flowers", "flowering", "bloom", "leaf", "leaves", "foliage",
        "perennial", "annual", "biennial", "evergreen", "deciduous",
        "hardy", "tender", "drought-tolerant", "shade-loving", "sun-loving",
      ],
    },
    {
      id: "TOOL",
      displayName: "Tools",
      keywords: [
        // Hand tools
        "spade", "fork", "hoe", "rake", "trowel", "dibber", "secateurs",
        "pruners", "shears", "loppers", "saw", "knife", "hori hori",
        // Power tools
        "mower", "lawnmower", "trimmer", "strimmer", "hedge trimmer", "chainsaw",
        "leaf blower", "cultivator", "tiller", "rotovator", "pressure washer",
        // Watering tools
        "hose", "hosepipe", "watering can", "sprinkler", "irrigation", "drip system",
        "spray bottle", "nozzle", "soaker hose", "watering system",
        // Maintenance tools
        "wheelbarrow", "cart", "bucket", "gloves", "kneeler", "kneeling pad",
        "tool belt", "sharpener", "oil", "grease", "maintenance kit",
      ],
      knownBrands: [
        "fiskars", "felco", "spear & jackson", "wilkinson sword", "gardena",
      ],
    },
    {
      id: "MATERIAL",
      displayName: "Materials",
      keywords: [
        // Soil amendments
        "soil", "compost", "mulch", "manure", "peat", "peat-free", "coir",
        "vermiculite", "perlite", "sand", "grit", "biochar", "worm castings",
        "leaf mold", "topsoil", "ericaceous",
        // Fertilizers
        "fertilizer", "fertiliser", "feed", "nutrients", "nitrogen", "phosphorus",
        "potassium", "npk", "organic fertilizer", "liquid feed", "slow release",
        "granular", "seaweed", "fish blood and bone", "bone meal", "chicken manure",
        // Pest control
        "pesticide", "insecticide", "fungicide", "herbicide", "nematodes",
        "slug pellets", "slug killer", "netting", "fleece", "horticultural fleece",
        "trap", "barrier", "copper tape", "diatomaceous earth",
        // Growing media
        "potting mix", "seed compost", "multi-purpose compost", "john innes",
        "growing medium", "growing bag", "peat-free compost",
      ],
    },
    {
      id: "STRUCTURE",
      displayName: "Structures",
      keywords: [
        "greenhouse", "polytunnel", "cold frame", "cloche", "grow tent",
        "raised bed", "planter", "pot", "container", "hanging basket",
        "window box", "grow bag", "fabric pot",
        "trellis", "obelisk", "arch", "pergola", "arbor", "gazebo",
        "fence", "fencing", "edging", "border", "path", "paving", "patio",
        "decking", "deck", "retaining wall",
        "shed", "storage", "bench", "table", "chair", "furniture",
        "water feature", "pond", "fountain", "bird bath",
      ],
    },
    {
      id: "SEED",
      displayName: "Seeds & Bulbs",
      keywords: [
        "seed", "seeds", "packet", "variety", "cultivar", "f1", "f2", "hybrid",
        "heirloom", "heritage", "organic seed", "treated seed", "pelleted",
        "germination", "sowing", "propagation", "seedling", "transplant",
        "bulb", "bulbs", "tuber", "tubers", "corm", "corms", "rhizome",
        "root cutting", "plug", "plugs", "young plant", "bare root",
      ],
      knownBrands: [
        "thompson & morgan", "suttons", "mr fothergills", "unwins", "johnsons",
      ],
    },
    {
      id: "BOOK",
      displayName: "Books & Guides",
      keywords: [
        "book", "guide", "manual", "encyclopedia", "handbook", "reference",
        "gardening book", "plant guide", "identification guide", "field guide",
        "rhs", "royal horticultural society", "kew", "kew gardens",
        "dk", "dorling kindersley", "timber press", "frances lincoln",
        "author", "published", "publisher", "isbn", "edition", "hardback",
        "paperback", "ebook", "kindle", "recommended reading", "must-read",
      ],
    },
    {
      id: "COURSE",
      displayName: "Courses & Workshops",
      keywords: [
        "course", "online course", "class", "workshop", "masterclass", "tutorial",
        "lesson", "training", "certification", "certificate", "diploma",
        "video course", "learn", "learning", "teach", "teaching", "instructor",
        "skillshare", "udemy", "coursera", "futurelearn", "rhs course",
        "horticulture course", "gardening course", "module", "curriculum",
      ],
    },
    {
      id: "EVENT",
      displayName: "Events & Shows",
      keywords: [
        "show", "garden show", "flower show", "festival", "fair", "exhibition",
        "event", "visit", "tour", "open garden", "open day",
        "chelsea flower show", "chelsea", "hampton court", "hampton court flower show",
        "tatton park", "rhs show", "malvern", "southport", "harrogate",
        "plant sale", "plant fair", "lecture", "talk", "demonstration",
        "garden club", "society", "national garden scheme", "ngs", "yellow book",
      ],
    },
    {
      id: "SERVICE",
      displayName: "Services",
      keywords: [
        "service", "design", "garden design", "landscape design", "landscaping",
        "maintenance", "garden maintenance", "consultation", "consult",
        "installation", "planting service", "landscape architect", "designer",
        "contractor", "gardener", "professional gardener", "expert", "specialist",
        "hire", "quote", "estimate", "project",
      ],
    },
    {
      id: "OTHER",
      displayName: "Other Products",
      keywords: [
        "product", "item", "equipment", "supply", "supplies", "kit",
        "bundle", "collection", "set", "package", "deal",
      ],
    },
  ],

  // ---- 7 Audience Intent Archetypes ----
  intentArchetypes: [
    {
      key: "seasonal_action",
      name: "Seasonal Action",
      description:
        "Viewers looking for what to do now in their garden; time-sensitive gardening tasks",
      weight: 0.9,
      triggerPhrases: [
        "this week in the garden",
        "now's the time to",
        "jobs for the weekend",
        "before the frost",
        "spring is here",
        "summer planting",
        "autumn cleanup",
        "winter preparation",
        "this month",
        "right now",
        "don't miss the window",
        "last chance to",
      ],
      ctaSuggestions: [
        "Shop seasonal essentials",
        "Get your [plant] before it sells out",
        "Order now for [season] delivery",
      ],
      dominantEmotions: ["urgency", "excitement", "motivation"],
    },
    {
      key: "learning_mastery",
      name: "Learning & Mastery",
      description:
        "Viewers wanting to develop skills and deepen gardening knowledge",
      weight: 0.7,
      triggerPhrases: [
        "how to",
        "step by step",
        "beginner",
        "advanced technique",
        "the secret to",
        "masterclass",
        "let me show you",
        "the trick is",
        "pro tip",
        "common mistake",
        "learn to",
        "guide to",
      ],
      ctaSuggestions: [
        "Enroll in our gardening course",
        "Download the complete guide",
        "Join the masterclass",
      ],
      dominantEmotions: ["curiosity", "determination", "satisfaction"],
    },
    {
      key: "product_purchase",
      name: "Product Purchase",
      description:
        "Viewers with direct purchase intent for tools, plants, or materials",
      weight: 0.95,
      triggerPhrases: [
        "I recommend",
        "my favorite",
        "best value",
        "link in description",
        "I use this",
        "worth every penny",
        "this is the one",
        "buy",
        "purchase",
        "order",
        "available at",
        "you can get",
        "check out",
      ],
      ctaSuggestions: [
        "Buy now",
        "Shop this product",
        "Compare prices",
        "Add to wishlist",
      ],
      dominantEmotions: ["desire", "confidence", "trust"],
    },
    {
      key: "aspirational_lifestyle",
      name: "Aspirational Lifestyle",
      description:
        "Viewers inspired by beautiful gardens, design, and garden lifestyle",
      weight: 0.6,
      triggerPhrases: [
        "dream garden",
        "garden tour",
        "before and after",
        "transformation",
        "beautiful",
        "stunning",
        "magical",
        "garden room",
        "outdoor living",
        "garden design",
        "cottage garden",
        "modern garden",
      ],
      ctaSuggestions: [
        "Get the look",
        "Book a garden design consultation",
        "Browse garden inspiration",
      ],
      dominantEmotions: ["aspiration", "wonder", "inspiration"],
    },
    {
      key: "problem_solving",
      name: "Problem Solving",
      description:
        "Viewers dealing with pests, diseases, or gardening challenges",
      weight: 0.8,
      triggerPhrases: [
        "problem",
        "pest",
        "disease",
        "dying",
        "yellow leaves",
        "not growing",
        "what's wrong with",
        "how to fix",
        "help",
        "struggling",
        "aphids",
        "blight",
        "rot",
        "slug",
        "weed",
      ],
      ctaSuggestions: [
        "Shop pest control solutions",
        "Get expert diagnosis",
        "Try this treatment",
      ],
      dominantEmotions: ["frustration", "concern", "relief"],
    },
    {
      key: "community_sharing",
      name: "Community & Sharing",
      description:
        "Viewers engaged in the social aspect of gardening; sharing results",
      weight: 0.4,
      triggerPhrases: [
        "comment below",
        "let me know",
        "share your",
        "community",
        "together",
        "our garden",
        "allotment",
        "garden club",
        "competition",
        "show me yours",
      ],
      ctaSuggestions: [
        "Join our community",
        "Share your garden photos",
        "Visit our forum",
      ],
      dominantEmotions: ["belonging", "pride", "connection"],
    },
    {
      key: "eco_regenerative",
      name: "Eco & Regenerative",
      description:
        "Viewers focused on sustainability, biodiversity, and eco-friendly gardening",
      weight: 0.5,
      triggerPhrases: [
        "organic",
        "sustainable",
        "wildlife",
        "biodiversity",
        "pollinator",
        "bee-friendly",
        "no-dig",
        "permaculture",
        "composting",
        "peat-free",
        "native plants",
        "rewilding",
        "carbon",
        "eco-friendly",
        "regenerative",
      ],
      ctaSuggestions: [
        "Shop peat-free compost",
        "Browse wildlife-friendly plants",
        "Switch to organic solutions",
      ],
      dominantEmotions: ["responsibility", "hope", "pride"],
    },
  ],

  // ---- Affiliate Networks ----
  affiliateNetworks: [
    {
      networkId: "awin",
      networkName: "Awin",
      enabled: true,
      searchKeywords: [
        "garden", "gardening", "plants", "seeds", "tools",
        "outdoor", "landscape", "horticulture",
      ],
      networkCategoryIds: ["13"], // Home & Garden
    },
    {
      networkId: "cj",
      networkName: "CJ Affiliate",
      enabled: true,
      searchKeywords: [
        "garden", "gardening", "home garden", "lawn care",
        "plant nursery", "outdoor living",
      ],
    },
    {
      networkId: "shareasale",
      networkName: "ShareASale",
      enabled: false,
      searchKeywords: [
        "garden supplies", "seeds", "plants online",
      ],
    },
    {
      networkId: "amazon",
      networkName: "Amazon Associates",
      enabled: true,
      searchKeywords: [
        "garden tools", "gardening books", "plant care",
        "seed starting", "raised bed kit",
      ],
    },
  ],

  // ---- Seasonal Config ----
  seasonal: {
    isSeasonDependent: true,
    seasonKeywords: {
      spring: [
        "spring", "march", "april", "may",
        "sowing", "seed starting", "first planting",
        "after the frost", "last frost", "spring equinox",
      ],
      summer: [
        "summer", "june", "july", "august",
        "watering", "deadheading", "summer pruning",
        "heat", "drought", "holiday watering",
      ],
      autumn: [
        "autumn", "fall", "september", "october", "november",
        "leaf fall", "autumn colour", "planting bulbs",
        "preparing for winter", "harvest", "apple picking",
      ],
      winter: [
        "winter", "december", "january", "february",
        "frost", "snow", "dormancy", "bare root",
        "winter pruning", "forcing bulbs", "winter protection",
      ],
    },
    regionKeywords: [
      "UK", "US", "Zone", "USDA zone", "RHS zone",
      "Mediterranean", "Tropical", "Temperate",
      "Northern hemisphere", "Southern hemisphere",
    ],
    weatherKeywords: [
      "frost", "freeze", "heat wave", "drought",
      "rain", "wet", "waterlogged", "snow", "wind",
    ],
  },

  // ---- Video Structure ----
  videoStructure: {
    skipIntroSeconds: 30,
    skipOutroSeconds: 30,
    minLengthForSkipping: 180, // 3 minutes
  },

  // ---- Filtering ----
  filteringAggressiveness: 0.7,
};
