/**
 * Awin Program Scanner Service
 *
 * Automatically discovers affiliate programs from the Awin network
 * using AI-powered relevance filtering and geolocation extraction.
 *
 * Features:
 * - Scans Awin Advertiser API for programs
 * - Uses AI (configurable) to filter relevant programs
 * - Extracts supplier location from program descriptions
 * - Geocodes locations to lat/lng coordinates via Nominatim
 *
 * Ported from monolith: lib/services/affiliate-auto-discovery/awin-scanner.ts
 * Removed: Prisma, openai-service-registry, logger import.
 * Made API credentials configurable via constructor.
 */

import type { AIClient, Logger } from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// TYPES
// ============================================================================

export interface AwinAdvertiser {
  advertiserId: number;
  advertiserName: string;
  primaryRegion: string;
  programTerms: string;
  commissionGroups: Array<{
    groupName: string;
    minCommission: number;
    maxCommission: number;
  }>;
  cookiePeriod: number; // days
  averageOrderValue?: number;
  programUrl?: string;
  description?: string;
}

export interface DiscoveredProgram {
  advertiserId: number;
  advertiserName: string;
  relevanceScore: number;
  relevanceReason: string;
  supplierCountry?: string;
  supplierRegion?: string;
  supplierCity?: string;
  supplierLatitude?: number;
  supplierLongitude?: number;
  verticals: ProgramVerticals;
  commission: {
    min: number;
    max: number;
  };
  cookieDuration: number;
  avgOrderValue?: number;
}

export interface ProgramVerticals {
  supportsPlants: boolean;
  supportsSeeds: boolean;
  supportsTools: boolean;
  supportsMaterials: boolean;
  supportsBooks: boolean;
  supportsMedia: boolean;
  supportsCourses: boolean;
  supportsEvents: boolean;
  supportsGardenShows: boolean;
}

export interface RelevanceAnalysis {
  isRelevant: boolean;
  relevanceScore: number; // 0-100
  reason: string;
  verticals: ProgramVerticals;
}

export interface LocationData {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  confidence: number; // 0-100
}

export interface AwinScannerOptions {
  awinApiKey: string;
  aiClient?: AIClient;
  /** User-Agent string for geocoding requests. */
  geocodeUserAgent?: string;
  /** Minimum relevance score to include (default: 50). */
  minRelevanceScore?: number;
  logger?: Logger;
}

// ============================================================================
// SCANNER
// ============================================================================

export class AwinProgramScanner {
  private awinApiKey: string;
  private aiClient?: AIClient;
  private geocodeCache: Map<string, LocationData> = new Map();
  private geocodeUserAgent: string;
  private minRelevanceScore: number;
  private logger: Logger;

  constructor(options: AwinScannerOptions) {
    this.awinApiKey = options.awinApiKey;
    this.aiClient = options.aiClient;
    this.geocodeUserAgent =
      options.geocodeUserAgent ?? "VideoCommerceIntelligence/1.0";
    this.minRelevanceScore = options.minRelevanceScore ?? 50;
    this.logger = options.logger ?? defaultLogger;
  }

  /**
   * Main entry point: Discover all relevant programs from Awin.
   */
  async discoverPrograms(
    vertical: string = "gardening",
  ): Promise<DiscoveredProgram[]> {
    this.logger.info("Starting Awin program discovery", { vertical });

    // Step 1: Fetch all advertisers from Awin
    const advertisers = await this.fetchAwinAdvertisers();
    this.logger.info("Found advertisers in Awin network", {
      count: advertisers.length,
    });

    // Step 2: Filter relevant programs using AI
    const relevantPrograms: DiscoveredProgram[] = [];

    for (let i = 0; i < advertisers.length; i++) {
      const advertiser = advertisers[i]!;
      this.logger.info("Analyzing advertiser", {
        progress: `${i + 1}/${advertisers.length}`,
        advertiserName: advertiser.advertiserName,
      });

      const relevance = await this.analyzeRelevance(advertiser, vertical);

      if (
        relevance.isRelevant &&
        relevance.relevanceScore >= this.minRelevanceScore
      ) {
        const location = await this.extractLocation(advertiser);

        relevantPrograms.push({
          advertiserId: advertiser.advertiserId,
          advertiserName: advertiser.advertiserName,
          relevanceScore: relevance.relevanceScore,
          relevanceReason: relevance.reason,
          supplierCountry: location.country,
          supplierRegion: location.region,
          supplierCity: location.city,
          supplierLatitude: location.latitude,
          supplierLongitude: location.longitude,
          verticals: relevance.verticals,
          commission: {
            min: Math.min(
              ...advertiser.commissionGroups.map((g) => g.minCommission),
              0,
            ),
            max: Math.max(
              ...advertiser.commissionGroups.map((g) => g.maxCommission),
              0,
            ),
          },
          cookieDuration: advertiser.cookiePeriod,
          avgOrderValue: advertiser.averageOrderValue,
        });
      }
    }

    this.logger.info("Discovery complete", {
      relevantProgramsFound: relevantPrograms.length,
    });
    return relevantPrograms;
  }

  // ==========================================================================
  // AWIN API
  // ==========================================================================

  /**
   * Fetch advertisers from Awin API.
   */
  async fetchAwinAdvertisers(): Promise<AwinAdvertiser[]> {
    const url = "https://api.awin.com/advertisers";

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.awinApiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Awin API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    return (data as Array<Record<string, unknown>>).map(
      (adv: Record<string, unknown>) => ({
        advertiserId: adv.advertiserId as number,
        advertiserName: adv.advertiserName as string,
        primaryRegion:
          ((adv.primaryRegion as Record<string, string>)?.name as string) ||
          "Unknown",
        programTerms: (adv.programTerms as string) || "",
        commissionGroups:
          (
            (adv.commissionGroups as Array<Record<string, unknown>>) || []
          ).map((g: Record<string, unknown>) => ({
            groupName: g.groupName as string,
            minCommission:
              ((g.percentage as Record<string, number>)?.min as number) || 0,
            maxCommission:
              ((g.percentage as Record<string, number>)?.max as number) || 0,
          })) || [],
        cookiePeriod: (adv.cookiePeriod as number) || 30,
        averageOrderValue: adv.averageOrderValue as number | undefined,
        programUrl: adv.programUrl as string | undefined,
        description: adv.description as string | undefined,
      }),
    );
  }

  // ==========================================================================
  // RELEVANCE ANALYSIS
  // ==========================================================================

  /**
   * Use AI to analyze if a program is relevant to the given vertical.
   */
  async analyzeRelevance(
    advertiser: AwinAdvertiser,
    vertical: string = "gardening",
  ): Promise<RelevanceAnalysis> {
    if (!this.aiClient) {
      // No AI client: return a low-confidence default
      return {
        isRelevant: false,
        relevanceScore: 0,
        reason: "No AI client configured for relevance analysis",
        verticals: emptyVerticals(),
      };
    }

    const prompt = `Analyze if this affiliate program is relevant for a ${vertical} YouTube channel that covers topics like: plants, seeds, garden tools, gardening books, courses, materials (compost, fertilizers), and garden shows/events.

Program Name: ${advertiser.advertiserName}
Description: ${advertiser.description || "No description provided"}
Program Terms: ${advertiser.programTerms}

Respond in JSON format:
{
  "isRelevant": boolean,
  "relevanceScore": number (0-100),
  "reason": "brief explanation",
  "verticals": {
    "supportsPlants": boolean,
    "supportsSeeds": boolean,
    "supportsTools": boolean,
    "supportsMaterials": boolean,
    "supportsBooks": boolean,
    "supportsMedia": boolean,
    "supportsCourses": boolean,
    "supportsEvents": boolean,
    "supportsGardenShows": boolean
  }
}

Be strict: only mark as relevant if directly related to ${vertical}, not general home/lifestyle.`;

    try {
      const response = await this.aiClient.complete({
        systemPrompt:
          "You are an expert at analyzing affiliate programs for relevance. Respond only with valid JSON.",
        userPrompt: prompt,
        model: "gpt-4o-mini",
        temperature: 0.3,
        maxTokens: 500,
      });

      const analysis = JSON.parse(response.content);
      return {
        isRelevant: analysis.isRelevant,
        relevanceScore: analysis.relevanceScore,
        reason: analysis.reason,
        verticals: analysis.verticals || emptyVerticals(),
      };
    } catch (error) {
      this.logger.error(
        "Error analyzing relevance",
        error instanceof Error ? error : undefined,
        { advertiserName: advertiser.advertiserName },
      );
      return {
        isRelevant: false,
        relevanceScore: 0,
        reason: "Analysis failed",
        verticals: emptyVerticals(),
      };
    }
  }

  // ==========================================================================
  // LOCATION EXTRACTION
  // ==========================================================================

  /**
   * Extract location data from advertiser information using AI + geocoding.
   */
  async extractLocation(advertiser: AwinAdvertiser): Promise<LocationData> {
    if (!this.aiClient) {
      return { confidence: 0 };
    }

    const prompt = `Extract the company location (country, region, city) from this information:

Company Name: ${advertiser.advertiserName}
Primary Region: ${advertiser.primaryRegion}
Description: ${advertiser.description || "N/A"}
Program URL: ${advertiser.programUrl || "N/A"}

Respond in JSON format:
{
  "country": "full country name or null",
  "region": "state/province or null",
  "city": "city name or null",
  "confidence": number (0-100)
}`;

    try {
      const response = await this.aiClient.complete({
        systemPrompt:
          "You are an expert at extracting location information from company data. Respond only with valid JSON.",
        userPrompt: prompt,
        model: "gpt-4o-mini",
        temperature: 0.2,
        maxTokens: 200,
      });

      const extracted = JSON.parse(response.content);

      if (extracted.country) {
        const geocoded = await this.geocodeLocation(
          extracted.country,
          extracted.region,
          extracted.city,
        );

        return {
          country: extracted.country,
          region: extracted.region,
          city: extracted.city,
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          confidence: extracted.confidence,
        };
      }

      return { confidence: 0 };
    } catch (error) {
      this.logger.error(
        "Error extracting location",
        error instanceof Error ? error : undefined,
        { advertiserName: advertiser.advertiserName },
      );
      return { confidence: 0 };
    }
  }

  /**
   * Geocode a location to latitude/longitude using OpenStreetMap Nominatim.
   */
  async geocodeLocation(
    country: string,
    region?: string,
    city?: string,
  ): Promise<{ latitude?: number; longitude?: number }> {
    const cacheKey = [city, region, country].filter(Boolean).join(", ");

    if (this.geocodeCache.has(cacheKey)) {
      const cached = this.geocodeCache.get(cacheKey)!;
      return { latitude: cached.latitude, longitude: cached.longitude };
    }

    const query = [city, region, country].filter(Boolean).join(", ");

    try {
      // Respect rate limit: 1 request per second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": this.geocodeUserAgent },
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const results = (await response.json()) as Array<{
        lat: string;
        lon: string;
      }>;

      if (results.length > 0) {
        const result = results[0]!;
        const locationData: LocationData = {
          country,
          region,
          city,
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          confidence: 100,
        };
        this.geocodeCache.set(cacheKey, locationData);
        return {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
        };
      }

      return {};
    } catch (error) {
      this.logger.error(
        "Error geocoding location",
        error instanceof Error ? error : undefined,
        { query },
      );
      return {};
    }
  }

  // ==========================================================================
  // REGION INFERENCE
  // ==========================================================================

  /**
   * Infer region from country name.
   */
  inferRegionFromCountry(country?: string): string {
    if (!country) return "OTHER";
    const countryLower = country.toLowerCase();

    if (
      countryLower.includes("united kingdom") ||
      countryLower.includes("uk") ||
      countryLower === "england" ||
      countryLower === "scotland" ||
      countryLower === "wales"
    ) {
      return "UK";
    }

    const euCountries = [
      "germany",
      "france",
      "netherlands",
      "belgium",
      "spain",
      "italy",
      "ireland",
      "denmark",
      "sweden",
      "finland",
      "austria",
      "portugal",
      "poland",
      "czech",
      "hungary",
      "romania",
      "greece",
    ];
    if (euCountries.some((eu) => countryLower.includes(eu))) {
      return "EU";
    }

    if (
      countryLower.includes("united states") ||
      countryLower.includes("usa") ||
      countryLower.includes("canada")
    ) {
      return "NA";
    }

    if (
      countryLower.includes("australia") ||
      countryLower.includes("new zealand")
    ) {
      return "AU";
    }

    return "OTHER";
  }

  // ==========================================================================
  // REPORT
  // ==========================================================================

  /**
   * Generate a discovery report.
   */
  generateReport(programs: DiscoveredProgram[]): string {
    if (programs.length === 0) return "No programs discovered.";

    const byVertical = {
      plants: programs.filter((p) => p.verticals.supportsPlants).length,
      seeds: programs.filter((p) => p.verticals.supportsSeeds).length,
      tools: programs.filter((p) => p.verticals.supportsTools).length,
      materials: programs.filter((p) => p.verticals.supportsMaterials).length,
      books: programs.filter((p) => p.verticals.supportsBooks).length,
      media: programs.filter((p) => p.verticals.supportsMedia).length,
      courses: programs.filter((p) => p.verticals.supportsCourses).length,
      events: programs.filter((p) => p.verticals.supportsEvents).length,
      gardenShows: programs.filter((p) => p.verticals.supportsGardenShows)
        .length,
    };

    const withLocation = programs.filter(
      (p) => p.supplierLatitude && p.supplierLongitude,
    ).length;
    const avgRelevance =
      programs.reduce((sum, p) => sum + p.relevanceScore, 0) / programs.length;

    const topPrograms = [...programs]
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10)
      .map(
        (p, i) =>
          `${i + 1}. ${p.advertiserName} (${p.relevanceScore}/100) - ${p.supplierCity || p.supplierCountry || "Location unknown"}`,
      )
      .join("\n");

    return [
      `AFFILIATE DISCOVERY REPORT`,
      `==========================`,
      ``,
      `Total Programs Discovered: ${programs.length}`,
      `Programs with Location Data: ${withLocation} (${Math.round((withLocation / programs.length) * 100)}%)`,
      `Average Relevance Score: ${avgRelevance.toFixed(1)}/100`,
      ``,
      `Coverage by Vertical:`,
      `- Plants: ${byVertical.plants}`,
      `- Seeds: ${byVertical.seeds}`,
      `- Tools: ${byVertical.tools}`,
      `- Materials: ${byVertical.materials}`,
      `- Books: ${byVertical.books}`,
      `- Media: ${byVertical.media}`,
      `- Courses: ${byVertical.courses}`,
      `- Events: ${byVertical.events}`,
      `- Garden Shows: ${byVertical.gardenShows}`,
      ``,
      `Top Programs:`,
      topPrograms,
    ].join("\n");
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function emptyVerticals(): ProgramVerticals {
  return {
    supportsPlants: false,
    supportsSeeds: false,
    supportsTools: false,
    supportsMaterials: false,
    supportsBooks: false,
    supportsMedia: false,
    supportsCourses: false,
    supportsEvents: false,
    supportsGardenShows: false,
  };
}
