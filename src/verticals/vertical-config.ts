/**
 * Vertical Configuration Interface
 *
 * Defines the contract for a content vertical (gardening, cooking, DIY, etc.).
 * Each vertical provides its own domain dictionary, category keywords,
 * NER prompts, entity patterns, audience intent taxonomy, and affiliate
 * network configuration.
 *
 * The MCP pipeline is domain-agnostic; all domain-specific knowledge lives
 * in the vertical config. Adding a new vertical means implementing this
 * interface -- no pipeline code changes required.
 *
 * See spec: "Each vertical needs: a domain dictionary, category keywords,
 * and prompt tuning. The MCP framework stays identical."
 */

// ============================================================================
// ENTITY PATTERN
// ============================================================================

/**
 * A pattern for detecting domain-specific entities in transcript text.
 *
 * Example for gardening: Latin botanical names (Genus species).
 * Example for cooking: recipe quantity patterns ("2 cups flour").
 */
export interface EntityPattern {
  /** Human-readable label for this pattern. */
  label: string;

  /**
   * Regular expression for entity detection.
   * Must use named groups where possible for structured extraction.
   * Serialized as a string to allow JSON storage.
   */
  regex: string;

  /** Flags for the regex (default: "gi"). */
  regexFlags?: string;

  /** Expected capitalization (for validation/filtering). */
  capitalization?: "TitleCase" | "UPPERCASE" | "lowercase" | "any";

  /** Minimum word length to avoid false positives. */
  minWordLength?: number;

  /** Phrases to exclude even if they match the regex. */
  excludePhrases?: string[];
}

// ============================================================================
// CONTENT SIGNALS
// ============================================================================

/**
 * Keywords and patterns for filtering relevant vs irrelevant transcript content.
 * Used by the transcript preprocessor to retain domain-relevant segments
 * and discard filler.
 */
export interface ContentSignals {
  /** Keywords indicating relevant content. */
  inclusionKeywords: string[];

  /** Keywords indicating irrelevant content (sponsor, CTA, etc.). */
  exclusionKeywords?: string[];
}

// ============================================================================
// COMMERCE CATEGORY
// ============================================================================

/**
 * A commerce category with associated detection keywords.
 *
 * Gardening has 9 categories (PLANT, TOOL, MATERIAL, etc.).
 * Cooking might have: INGREDIENT, EQUIPMENT, TECHNIQUE, RECIPE, etc.
 */
export interface CommerceCategoryConfig {
  /** Category identifier (used in entity tagging). */
  id: string;

  /** Human-readable display name. */
  displayName: string;

  /** Detection keywords (matched against transcript segments). */
  keywords: string[];

  /** Whether this category contains the primary domain entities. */
  isPrimary?: boolean;

  /** Brands commonly mentioned in this category (for brand recognition). */
  knownBrands?: string[];
}

// ============================================================================
// AUDIENCE INTENT ARCHETYPE
// ============================================================================

/**
 * An audience intent archetype for the vertical.
 *
 * Gardening has 7 archetypes (seasonal_action, learning_mastery, etc.).
 * Each vertical defines its own intent taxonomy.
 */
export interface IntentArchetype {
  /** Unique key (e.g., "seasonal_action"). */
  key: string;

  /** Human-readable name. */
  name: string;

  /** Description of this intent. */
  description: string;

  /** Commercial/engagement weight (0-1, higher = more valuable). */
  weight: number;

  /** Trigger phrases in transcripts. */
  triggerPhrases: string[];

  /** Suggested calls-to-action for this intent. */
  ctaSuggestions: string[];

  /** Dominant emotions associated with this intent. */
  dominantEmotions: string[];
}

// ============================================================================
// AFFILIATE NETWORK CONFIG
// ============================================================================

/**
 * Configuration for affiliate networks relevant to this vertical.
 */
export interface AffiliateNetworkConfig {
  /** Network identifier (e.g., "awin", "cj", "shareasale"). */
  networkId: string;

  /** Human-readable name. */
  networkName: string;

  /** Whether the scanner should search this network. */
  enabled: boolean;

  /** Default search keywords for program discovery. */
  searchKeywords: string[];

  /** Category IDs in the network's taxonomy (if applicable). */
  networkCategoryIds?: string[];
}

// ============================================================================
// NER PROMPT CONFIG
// ============================================================================

/**
 * NER prompt configuration for a vertical.
 * Controls how the AI model extracts entities from transcripts.
 */
export interface NERPromptConfig {
  /** System message for the NER model. */
  systemMessage: string;

  /** User prompt template. Supports placeholders: {{transcript}}, {{latinNames}}, {{varietyHints}}, {{entityType}}. */
  promptTemplate: string;

  /** Model name (e.g., "gpt-4o-mini"). */
  modelName: string;

  /** Model temperature (0-1). */
  temperature: number;

  /** Max output tokens. */
  maxTokens: number;

  /** Variety/cultivar detection rules specific to this vertical. */
  varietyDetectionRules?: string[];
}

// ============================================================================
// VIDEO STRUCTURE CONFIG
// ============================================================================

/**
 * Assumptions about video structure for this vertical.
 * Controls intro/outro skipping during preprocessing.
 */
export interface VideoStructureConfig {
  /** Seconds to skip at the start of the video (intro). */
  skipIntroSeconds: number;

  /** Seconds to skip at the end of the video (outro). */
  skipOutroSeconds: number;

  /** Minimum video length (seconds) to apply intro/outro skipping. */
  minLengthForSkipping: number;
}

// ============================================================================
// SEASONAL CONFIG
// ============================================================================

/**
 * Seasonal patterns for this vertical.
 * Used by the seasonal context extractor and commerce calendar.
 */
export interface SeasonalConfig {
  /** Whether this vertical is season-dependent. */
  isSeasonDependent: boolean;

  /** Season keywords mapped to seasons. */
  seasonKeywords?: Record<string, string[]>;

  /** Region/climate keywords. */
  regionKeywords?: string[];

  /** Weather-related keywords relevant to this vertical. */
  weatherKeywords?: string[];
}

// ============================================================================
// MAIN VERTICAL CONFIG INTERFACE
// ============================================================================

/**
 * Complete configuration for a content vertical.
 *
 * This is the central interface that defines everything the MCP pipeline
 * needs to analyze content in a specific domain.
 *
 * Implementors must provide:
 * - Identity (id, displayName)
 * - Entity extraction config (patterns, NER prompts, dictionary path)
 * - Commerce categories with keywords (500+ for gardening)
 * - Audience intent taxonomy
 * - Affiliate network config
 * - Seasonal patterns
 * - Video structure assumptions
 */
export interface VerticalConfig {
  // ---- Identity ----

  /** Unique vertical identifier (e.g., "gardening", "cooking", "diy"). */
  id: string;

  /** Human-readable display name. */
  displayName: string;

  /** Short description. */
  description: string;

  /** Version of this vertical config (for tracking changes). */
  version: string;

  // ---- Entity Extraction ----

  /** What are we extracting? (e.g., "plant", "ingredient", "tool"). */
  primaryEntityType: string;

  /** Plural form (e.g., "plants", "ingredients", "tools"). */
  primaryEntityTypePlural: string;

  /** Specialized regex patterns for entity detection. */
  entityPatterns: EntityPattern[];

  /** Content relevance signals for transcript filtering. */
  contentSignals: ContentSignals;

  /** NER prompt configuration. */
  nerPrompt: NERPromptConfig;

  /**
   * Path to the domain dictionary JSON file (relative to package root).
   * The dictionary implements the DomainDictionaryEntry[] schema.
   * For gardening: plant-dictionary.json
   * For cooking: ingredient-dictionary.json
   */
  dictionaryPath?: string;

  // ---- Commerce Categories ----

  /** Commerce categories with detection keywords. */
  commerceCategories: CommerceCategoryConfig[];

  // ---- Audience Intent ----

  /** Audience intent archetypes for this vertical. */
  intentArchetypes: IntentArchetype[];

  // ---- Affiliate Networks ----

  /** Affiliate network configurations. */
  affiliateNetworks: AffiliateNetworkConfig[];

  // ---- Seasonal ----

  /** Seasonal configuration. */
  seasonal: SeasonalConfig;

  // ---- Video Structure ----

  /** Video structure assumptions. */
  videoStructure: VideoStructureConfig;

  // ---- Filtering ----

  /** Preprocessing aggressiveness (0-1, where 1 = most aggressive). */
  filteringAggressiveness: number;
}
