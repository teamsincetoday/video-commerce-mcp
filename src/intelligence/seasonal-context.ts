/**
 * Seasonal Context Extractor
 *
 * Purpose: Extract season and climate information from video transcripts
 * for gardening content. Critical for providing relevant, timely content
 * to users based on their location and current season.
 *
 * ZERO-COST: Pure regex-based extraction, no AI calls needed.
 * All seasonal patterns, region detection, and weather indicators
 * are preserved from the original.
 *
 * Ported from monolith lib/services/seasonal-context-extractor.ts.
 * Fully standalone: no external dependencies.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SeasonalContext {
  /** Detected seasons mentioned in video */
  seasons: Array<"spring" | "summer" | "autumn" | "fall" | "winter">;

  /** Detected months mentioned (1-12) */
  months: number[];

  /** Climate/region indicators */
  climate: {
    regions: string[]; // e.g., "UK", "Zone 7", "Mediterranean", "Tropical"
    hemisphere?: "northern" | "southern";
    hardiness?: string; // USDA zone if mentioned
  };

  /** Timing indicators */
  timing: {
    isSeasonSpecific: boolean; // true if video is only relevant to specific seasons
    isTemperate: boolean; // true if focused on temperate gardening
    isTropical: boolean; // true if focused on tropical gardening
    isYearRound: boolean; // true if applicable year-round
  };

  /** Weather/temperature mentions */
  weather: {
    frostMentioned: boolean;
    heatMentioned: boolean;
    droughtMentioned: boolean;
    wetConditionsMentioned: boolean;
  };

  /** Confidence score (0-1) */
  confidence: number;
}

// ============================================================================
// EXTRACTION
// ============================================================================

/**
 * Extract seasonal context from transcript.
 *
 * Uses regex pattern matching to detect:
 * - Seasons (spring, summer, autumn, fall, winter)
 * - Months (January-December)
 * - Regions and climate zones (UK, USA, USDA zones, etc.)
 * - Weather conditions (frost, heat, drought, wet)
 * - Year-round indicators
 *
 * @param transcript - Full transcript text
 * @returns Seasonal context with confidence score
 */
export function extractSeasonalContext(transcript: string): SeasonalContext {
  const lowerTranscript = transcript.toLowerCase();

  // Initialize result
  const context: SeasonalContext = {
    seasons: [],
    months: [],
    climate: {
      regions: [],
    },
    timing: {
      isSeasonSpecific: false,
      isTemperate: false,
      isTropical: false,
      isYearRound: false,
    },
    weather: {
      frostMentioned: false,
      heatMentioned: false,
      droughtMentioned: false,
      wetConditionsMentioned: false,
    },
    confidence: 0.5,
  };

  // ===== SEASON DETECTION =====
  const seasonPatterns: Record<string, RegExp> = {
    spring:
      /\b(spring|springtime|early spring|late spring|spring season)\b/gi,
    summer:
      /\b(summer|summertime|early summer|mid summer|late summer|summer season)\b/gi,
    autumn: /\b(autumn|autumnal|fall season)\b/gi,
    fall: /\b(fall|falling leaves)\b/gi,
    winter:
      /\b(winter|wintertime|early winter|late winter|winter season)\b/gi,
  };

  for (const [season, pattern] of Object.entries(seasonPatterns)) {
    const matches = lowerTranscript.match(pattern);
    if (matches && matches.length > 0) {
      context.seasons.push(
        season as "spring" | "summer" | "autumn" | "fall" | "winter",
      );
      context.confidence += 0.1;
    }
  }

  // ===== MONTH DETECTION =====
  const monthPatterns = [
    { name: "january", number: 1, pattern: /\b(january|jan\b)/gi },
    { name: "february", number: 2, pattern: /\b(february|feb\b)/gi },
    { name: "march", number: 3, pattern: /\b(march|mar\b)/gi },
    { name: "april", number: 4, pattern: /\b(april|apr\b)/gi },
    { name: "may", number: 5, pattern: /\b(may)\b/gi },
    { name: "june", number: 6, pattern: /\b(june|jun\b)/gi },
    { name: "july", number: 7, pattern: /\b(july|jul\b)/gi },
    { name: "august", number: 8, pattern: /\b(august|aug\b)/gi },
    { name: "september", number: 9, pattern: /\b(september|sept|sep\b)/gi },
    { name: "october", number: 10, pattern: /\b(october|oct\b)/gi },
    { name: "november", number: 11, pattern: /\b(november|nov\b)/gi },
    { name: "december", number: 12, pattern: /\b(december|dec\b)/gi },
  ];

  for (const month of monthPatterns) {
    if (month.pattern.test(lowerTranscript)) {
      context.months.push(month.number);
      context.confidence += 0.05;
    }
  }

  // ===== REGION/CLIMATE DETECTION =====
  const regionPatterns = [
    {
      region: "UK",
      pattern:
        /\b(uk|united kingdom|britain|british|england|scotland|wales)\b/gi,
    },
    {
      region: "USA",
      pattern: /\b(usa|united states|america|american)\b/gi,
    },
    { region: "Europe", pattern: /\b(europe|european)\b/gi },
    {
      region: "Australia",
      pattern: /\b(australia|australian|aussie)\b/gi,
    },
    { region: "Mediterranean", pattern: /\b(mediterranean)\b/gi },
    { region: "Tropical", pattern: /\b(tropical|tropics)\b/gi },
    { region: "Temperate", pattern: /\b(temperate)\b/gi },
    {
      region: "Northern Hemisphere",
      pattern: /\b(northern hemisphere)\b/gi,
    },
    {
      region: "Southern Hemisphere",
      pattern: /\b(southern hemisphere)\b/gi,
    },
  ];

  for (const { region, pattern } of regionPatterns) {
    if (pattern.test(lowerTranscript)) {
      context.climate.regions.push(region);
      context.confidence += 0.08;

      // Detect hemisphere
      if (
        region === "Northern Hemisphere" ||
        region === "UK" ||
        region === "USA" ||
        region === "Europe"
      ) {
        context.climate.hemisphere = "northern";
      } else if (
        region === "Southern Hemisphere" ||
        region === "Australia"
      ) {
        context.climate.hemisphere = "southern";
      }

      // Detect climate type
      if (region === "Tropical") {
        context.timing.isTropical = true;
      } else if (region === "Temperate") {
        context.timing.isTemperate = true;
      }
    }
  }

  // ===== USDA HARDINESS ZONE DETECTION =====
  const zonePattern =
    /\b(zone|hardiness zone|usda zone|growing zone)\s+([0-9]{1,2}[a-b]?)\b/gi;
  const zoneMatches = lowerTranscript.match(zonePattern);
  if (zoneMatches) {
    context.climate.hardiness = zoneMatches[0];
    context.confidence += 0.1;
  }

  // ===== WEATHER CONDITION DETECTION =====
  if (/\b(frost|frosted|frosty|freezing|freeze)\b/gi.test(lowerTranscript)) {
    context.weather.frostMentioned = true;
    context.confidence += 0.05;
  }

  if (
    /\b(heat|hot|scorching|sweltering|heatwave)\b/gi.test(lowerTranscript)
  ) {
    context.weather.heatMentioned = true;
    context.confidence += 0.05;
  }

  if (
    /\b(drought|dry|arid|water shortage)\b/gi.test(lowerTranscript)
  ) {
    context.weather.droughtMentioned = true;
    context.confidence += 0.05;
  }

  if (
    /\b(wet|rain|rainy|damp|moisture|waterlogged)\b/gi.test(lowerTranscript)
  ) {
    context.weather.wetConditionsMentioned = true;
    context.confidence += 0.05;
  }

  // ===== TIMING ANALYSIS =====
  // Determine if content is season-specific
  if (context.seasons.length > 0 && context.seasons.length <= 2) {
    context.timing.isSeasonSpecific = true;
  }

  // Check for year-round indicators
  if (
    /\b(year.round|all year|anytime|any time|throughout the year)\b/gi.test(
      lowerTranscript,
    )
  ) {
    context.timing.isYearRound = true;
    context.confidence += 0.1;
  }

  // Infer temperate if frost is mentioned
  if (context.weather.frostMentioned) {
    context.timing.isTemperate = true;
  }

  // Normalize confidence (cap at 1.0)
  context.confidence = Math.min(1.0, context.confidence);

  return context;
}

// ============================================================================
// SUMMARY HELPERS
// ============================================================================

/**
 * Get human-readable season summary.
 */
export function getSeasonSummary(context: SeasonalContext): string {
  if (context.timing.isYearRound) {
    return "Year-round";
  }

  if (context.seasons.length === 0 && context.months.length === 0) {
    return "Not season-specific";
  }

  const parts: string[] = [];

  if (context.seasons.length > 0) {
    const uniqueSeasons = [...new Set(context.seasons)];
    parts.push(
      uniqueSeasons
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(", "),
    );
  }

  if (context.months.length > 0 && context.months.length <= 3) {
    const monthNames = context.months.map((m) => getMonthName(m));
    parts.push(monthNames.join(", "));
  }

  return parts.join(" - ") || "Variable";
}

/**
 * Get month name from number.
 */
function getMonthName(month: number): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[month - 1] || "Unknown";
}

/**
 * Get climate summary.
 */
export function getClimateSummary(context: SeasonalContext): string {
  if (context.climate.regions.length === 0) {
    return "Not region-specific";
  }

  const parts: string[] = [];

  if (context.climate.hardiness) {
    parts.push(context.climate.hardiness);
  }

  if (context.climate.hemisphere) {
    parts.push(`${context.climate.hemisphere} hemisphere`);
  }

  if (context.timing.isTemperate) {
    parts.push("Temperate");
  } else if (context.timing.isTropical) {
    parts.push("Tropical");
  }

  const uniqueRegions = [...new Set(context.climate.regions)];
  parts.push(...uniqueRegions.slice(0, 2));

  return parts.join(", ");
}

// ============================================================================
// RELEVANCE CHECK
// ============================================================================

/**
 * Check if video is relevant for user's current season.
 *
 * Uses hemisphere-aware season mapping to determine if content
 * is timely for the user's location and current date.
 *
 * @param context - Seasonal context from the video
 * @param userMonth - User's current month (1-12)
 * @param userHemisphere - User's hemisphere
 * @returns Whether content is relevant and optional reason
 */
export function isRelevantForSeason(
  context: SeasonalContext,
  userMonth: number,
  userHemisphere: "northern" | "southern",
): { relevant: boolean; reason?: string } {
  // Year-round content is always relevant
  if (context.timing.isYearRound) {
    return { relevant: true };
  }

  // Not season-specific is always relevant
  if (!context.timing.isSeasonSpecific) {
    return { relevant: true };
  }

  // Check if user's month is mentioned
  if (context.months.length > 0) {
    if (context.months.includes(userMonth)) {
      return { relevant: true };
    }

    // Check adjacent months (+/-1 month window)
    const adjacentMonths = [
      userMonth === 1 ? 12 : userMonth - 1,
      userMonth,
      userMonth === 12 ? 1 : userMonth + 1,
    ];

    if (context.months.some((m) => adjacentMonths.includes(m))) {
      return { relevant: true, reason: "Near-season content" };
    }
  }

  // Check hemisphere match
  if (
    context.climate.hemisphere &&
    context.climate.hemisphere !== userHemisphere
  ) {
    return { relevant: false, reason: "Wrong hemisphere (seasons reversed)" };
  }

  // Check season match
  if (context.seasons.length > 0) {
    const userSeason = getSeasonFromMonth(userMonth, userHemisphere);
    if (context.seasons.includes(userSeason)) {
      return { relevant: true };
    }

    return {
      relevant: false,
      reason: `Not in season (video is ${context.seasons.join("/")} content)`,
    };
  }

  // Default to relevant if uncertain
  return { relevant: true };
}

/**
 * Get season from month and hemisphere.
 */
function getSeasonFromMonth(
  month: number,
  hemisphere: "northern" | "southern",
): "spring" | "summer" | "autumn" | "winter" {
  if (hemisphere === "northern") {
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
  } else {
    // Southern hemisphere - seasons are reversed
    if (month >= 9 && month <= 11) return "spring";
    if (month >= 12 || month <= 2) return "summer";
    if (month >= 3 && month <= 5) return "autumn";
    return "winter";
  }
}
