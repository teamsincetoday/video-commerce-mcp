/**
 * Commerce Calendar Service
 *
 * Seasonal commerce events with demand multipliers, region-specific promotions,
 * and ethnobotanical calendar integration.
 *
 * Ported from monolith: lib/services/commerce-calendar.ts
 * Removed: Prisma queries, external calendar imports.
 * Kept: All promotion types, default gardening promotions, region mapping,
 * seasonal plant promotion logic, category inference.
 */

// ============================================================================
// TYPES
// ============================================================================

export type PromotionType =
  | "sale"
  | "flash-deal"
  | "seasonal"
  | "holiday"
  | "clearance"
  | "ethnobotanical";

export type PromotionRegion = "UK" | "US" | "EU" | "AU" | "GLOBAL";

export interface PromotionData {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  type: PromotionType;
  region: PromotionRegion | null;
  season: string | null;
  month: number | null;
  bannerImageUrl: string | null;
  badgeText: string | null;
  badgeColor: string | null;
  categories: string[];
  productIds: string[];
  keywords: string[];
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  featured: boolean;
  displayOrder: number;
  // Computed fields
  isLive: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  progress: number; // 0-100
  // Ethnobotanical fields
  ethnobotanicalEvent?: string;
  plantsInvolved?: string[];
}

export interface CreatePromotionInput {
  title: string;
  description?: string;
  type: PromotionType;
  region?: PromotionRegion;
  season?: string;
  month?: number;
  bannerImageUrl?: string;
  badgeText?: string;
  badgeColor?: string;
  categories?: string[];
  productIds?: string[];
  keywords?: string[];
  startDate: Date;
  endDate: Date;
  featured?: boolean;
  displayOrder?: number;
  ethnobotanicalEvent?: string;
  plantsInvolved?: string[];
}

export interface SeasonalPlantPromotion {
  event: string;
  region: PromotionRegion;
  plants: string[];
  keywords: string[];
  description: string;
  priority: "high" | "medium" | "low";
  badgeText: string;
  badgeColor: string;
  suggestedCategories: string[];
}

/** A simplified ethnobotanical event for the standalone package. */
export interface EthnobotanicalEvent {
  event: string;
  month: number;
  region: string;
  plantsInvolved: string[];
  priority: "high" | "medium" | "low";
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Create URL-friendly slug from title.
 */
export function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 100);
}

/**
 * Compute promotion status fields from raw promotion data.
 */
export function computePromotionStatus(promo: {
  id: string;
  title: string;
  description?: string | null;
  slug: string;
  type?: string;
  region?: string | null;
  season?: string | null;
  month?: number | null;
  bannerImageUrl?: string | null;
  badgeText?: string | null;
  badgeColor?: string | null;
  categories?: string | string[] | null;
  productIds?: string | string[] | null;
  keywords?: string | string[] | null;
  startDate: Date | string;
  endDate: Date | string;
  isActive: boolean;
  featured: boolean;
  displayOrder: number;
}): PromotionData {
  const now = new Date();
  const startDate = new Date(promo.startDate);
  const endDate = new Date(promo.endDate);

  const isLive = now >= startDate && now <= endDate && promo.isActive;

  const msRemaining = Math.max(0, endDate.getTime() - now.getTime());
  const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));

  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsed = now.getTime() - startDate.getTime();
  const progress =
    totalDuration > 0
      ? Math.min(100, Math.max(0, (elapsed / totalDuration) * 100))
      : 0;

  // Handle both JSON string and array formats
  const parseArray = (val: string | string[] | null | undefined): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  };

  return {
    id: promo.id,
    title: promo.title,
    description: promo.description ?? null,
    slug: promo.slug,
    type: (promo.type as PromotionType) || "sale",
    region: (promo.region as PromotionRegion) || null,
    season: promo.season ?? null,
    month: promo.month ?? null,
    bannerImageUrl: promo.bannerImageUrl ?? null,
    badgeText: promo.badgeText ?? null,
    badgeColor: promo.badgeColor ?? null,
    categories: parseArray(promo.categories),
    productIds: parseArray(promo.productIds),
    keywords: parseArray(promo.keywords),
    startDate,
    endDate,
    isActive: promo.isActive,
    featured: promo.featured,
    displayOrder: promo.displayOrder,
    isLive,
    daysRemaining,
    hoursRemaining,
    progress,
  };
}

// ============================================================================
// SEASON DETECTION
// ============================================================================

/**
 * Get current season based on hemisphere.
 */
export function getCurrentSeason(
  hemisphere: "northern" | "southern" = "northern",
): string {
  const month = new Date().getMonth() + 1; // 1-12
  if (hemisphere === "northern") {
    if (month >= 3 && month <= 5) return "spring";
    if (month >= 6 && month <= 8) return "summer";
    if (month >= 9 && month <= 11) return "autumn";
    return "winter";
  }
  // Southern hemisphere: seasons are inverted
  if (month >= 3 && month <= 5) return "autumn";
  if (month >= 6 && month <= 8) return "winter";
  if (month >= 9 && month <= 11) return "spring";
  return "summer";
}

// ============================================================================
// CATEGORY INFERENCE
// ============================================================================

/**
 * Infer product categories from an ethnobotanical event.
 */
export function inferCategoriesFromEvent(
  event: EthnobotanicalEvent,
): string[] {
  const categories: Set<string> = new Set(["Plants"]);
  const eventLower = event.event.toLowerCase();

  if (eventLower.includes("flower") || eventLower.includes("show")) {
    categories.add("Ornamental Plants");
    categories.add("Garden Design");
  }
  if (eventLower.includes("seed") || eventLower.includes("sow")) {
    categories.add("Seeds");
    categories.add("Propagation");
  }
  if (eventLower.includes("harvest") || eventLower.includes("fruit")) {
    categories.add("Garden Tools");
    categories.add("Storage");
  }
  if (eventLower.includes("winter") || eventLower.includes("frost")) {
    categories.add("Garden Protection");
    categories.add("Fleece");
  }
  if (eventLower.includes("spring") || eventLower.includes("plant")) {
    categories.add("Bulbs");
    categories.add("Compost");
  }

  for (const plant of event.plantsInvolved) {
    const plantLower = plant.toLowerCase();
    if (
      plantLower.includes("rose") ||
      plantLower.includes("tulip") ||
      plantLower.includes("peony")
    ) {
      categories.add("Ornamental Plants");
    }
    if (
      plantLower.includes("tomato") ||
      plantLower.includes("bean") ||
      plantLower.includes("potato")
    ) {
      categories.add("Vegetable Seeds");
      categories.add("Grow Your Own");
    }
    if (
      plantLower.includes("apple") ||
      plantLower.includes("pear") ||
      plantLower.includes("berry")
    ) {
      categories.add("Fruit Trees");
      categories.add("Soft Fruit");
    }
    if (
      plantLower.includes("herb") ||
      plantLower.includes("basil") ||
      plantLower.includes("mint")
    ) {
      categories.add("Herbs");
    }
  }

  return Array.from(categories);
}

// ============================================================================
// SEASONAL PLANT PROMOTIONS
// ============================================================================

/**
 * Get badge color based on event priority and season.
 */
export function getEventBadgeColor(
  priority: "high" | "medium" | "low",
  season: string,
): string {
  if (priority === "high") return "#8b5cf6"; // Purple for high-priority events

  const seasonColors: Record<string, string> = {
    spring: "#10b981",
    summer: "#f59e0b",
    autumn: "#ef4444",
    winter: "#3b82f6",
  };

  return seasonColors[season] || "#6b7280";
}

/**
 * Get seasonal plant promotions from ethnobotanical events.
 *
 * Callers provide the events; this function generates promotions.
 */
export function getSeasonalPlantPromotions(
  events: EthnobotanicalEvent[],
  region: PromotionRegion = "UK",
  hemisphere: "northern" | "southern" = "northern",
): SeasonalPlantPromotion[] {
  const season = getCurrentSeason(hemisphere);
  const promotions: SeasonalPlantPromotion[] = [];

  // High-priority events become featured promotions
  const highPriority = events.filter((e) => e.priority === "high");
  for (const event of highPriority) {
    promotions.push({
      event: event.event,
      region,
      plants: event.plantsInvolved,
      keywords: [
        event.event.toLowerCase(),
        ...event.plantsInvolved.map((p) => `${p} plants`),
      ],
      description: `Celebrate ${event.event} with these featured plants and gardening essentials.`,
      priority: "high",
      badgeText: event.event,
      badgeColor: getEventBadgeColor("high", season),
      suggestedCategories: inferCategoriesFromEvent(event),
    });
  }

  // Regular events become standard promotions
  const regular = events.filter((e) => e.priority !== "high");
  for (const event of regular) {
    promotions.push({
      event: event.event,
      region,
      plants: event.plantsInvolved,
      keywords: [
        event.event.toLowerCase(),
        ...event.plantsInvolved.slice(0, 3).map((p) => p.toLowerCase()),
      ],
      description: `${event.event} - Shop plants and supplies for this seasonal occasion.`,
      priority: event.priority === "medium" ? "medium" : "low",
      badgeText: event.event.split(" ").slice(0, 2).join(" "),
      badgeColor: getEventBadgeColor(event.priority, season),
      suggestedCategories: inferCategoriesFromEvent(event),
    });
  }

  return promotions;
}

// ============================================================================
// DEFAULT GARDENING PROMOTIONS
// ============================================================================

/** A default promotion template with month/day boundaries instead of Date objects. */
export interface DefaultPromotionTemplate {
  title: string;
  description?: string;
  type: PromotionType;
  season?: string;
  region?: PromotionRegion;
  badgeText?: string;
  badgeColor?: string;
  categories?: string[];
  keywords?: string[];
  monthStart: number; // 0-indexed month
  dayStart: number;
  monthEnd: number;
  dayEnd: number;
  featured?: boolean;
}

/**
 * Get default gardening promotions.
 * Pre-defined seasonal events for the gardening vertical.
 */
export function getDefaultGardeningPromotions(): DefaultPromotionTemplate[] {
  return [
    {
      title: "Spring Planting Sale",
      description:
        "Get ready for spring with deals on seeds, bulbs, and starter plants",
      type: "seasonal",
      season: "spring",
      region: "UK",
      badgeText: "Spring Sale",
      badgeColor: "#10b981",
      categories: ["Seeds", "Bulbs", "Plants"],
      keywords: ["spring planting", "seeds", "bulbs", "starter plants"],
      monthStart: 2, // March
      dayStart: 1,
      monthEnd: 4, // May
      dayEnd: 31,
      featured: true,
    },
    {
      title: "Chelsea Flower Show Week",
      description:
        "Celebrate the Chelsea Flower Show with exclusive deals",
      type: "seasonal",
      season: "spring",
      region: "UK",
      badgeText: "Chelsea Week",
      badgeColor: "#8b5cf6",
      categories: ["Plants", "Garden Tools", "Furniture"],
      keywords: ["chelsea flower show", "garden design", "ornamental"],
      monthStart: 4, // May
      dayStart: 20,
      monthEnd: 4,
      dayEnd: 27,
      featured: true,
    },
    {
      title: "Eisheiligen - Ice Saints Sale",
      description:
        "Traditional frost protection period - stock up on fleece and cloches",
      type: "seasonal",
      season: "spring",
      region: "EU",
      badgeText: "Eisheiligen",
      badgeColor: "#3b82f6",
      categories: ["Garden Protection", "Fleece", "Cloches"],
      keywords: [
        "eisheiligen",
        "ice saints",
        "frost protection",
        "cold sensitive plants",
      ],
      monthStart: 4, // May
      dayStart: 11,
      monthEnd: 4,
      dayEnd: 15,
      featured: true,
    },
    {
      title: "Summer Growing Essentials",
      description:
        "Everything you need for a productive summer garden",
      type: "seasonal",
      season: "summer",
      region: "GLOBAL",
      badgeText: "Summer Deals",
      badgeColor: "#f59e0b",
      categories: ["Watering", "Plant Food", "Garden Tools"],
      keywords: ["summer gardening", "watering", "feeding"],
      monthStart: 5, // June
      dayStart: 1,
      monthEnd: 7, // August
      dayEnd: 31,
    },
    {
      title: "Autumn Harvest Sale",
      description:
        "Stock up on tools and supplies for the harvest season",
      type: "seasonal",
      season: "autumn",
      region: "GLOBAL",
      badgeText: "Harvest Sale",
      badgeColor: "#ef4444",
      categories: ["Garden Tools", "Storage", "Composting"],
      keywords: ["harvest", "autumn garden", "composting"],
      monthStart: 8, // September
      dayStart: 1,
      monthEnd: 10, // November
      dayEnd: 30,
    },
    {
      title: "Black Friday Garden Deals",
      description:
        "Massive discounts on garden equipment and tools",
      type: "sale",
      region: "GLOBAL",
      badgeText: "Up to 50% Off",
      badgeColor: "#1f2937",
      categories: ["Garden Tools", "Equipment", "Furniture"],
      keywords: ["black friday", "deals", "discount"],
      monthStart: 10, // November
      dayStart: 24,
      monthEnd: 10,
      dayEnd: 27,
      featured: true,
    },
    {
      title: "Winter Planning & Preparation",
      description:
        "Plan next year's garden with books, tools, and winter protection",
      type: "seasonal",
      season: "winter",
      region: "UK",
      badgeText: "Winter Prep",
      badgeColor: "#3b82f6",
      categories: ["Books", "Garden Protection", "Planning"],
      keywords: ["winter garden", "planning", "protection"],
      monthStart: 11, // December
      dayStart: 1,
      monthEnd: 1, // February
      dayEnd: 28,
    },
  ];
}

/**
 * Build PromotionData from a default template for a given year.
 */
export function buildPromotionFromTemplate(
  template: DefaultPromotionTemplate,
  year: number,
): CreatePromotionInput {
  const startDate = new Date(year, template.monthStart, template.dayStart);
  const endDate = new Date(
    year,
    template.monthEnd,
    template.dayEnd,
    23,
    59,
    59,
  );

  // Handle promotions that span year boundary
  if (template.monthEnd < template.monthStart) {
    endDate.setFullYear(year + 1);
  }

  return {
    title: template.title,
    description: template.description,
    type: template.type,
    region: template.region,
    season: template.season,
    badgeText: template.badgeText,
    badgeColor: template.badgeColor,
    categories: template.categories,
    keywords: template.keywords,
    startDate,
    endDate,
    featured: template.featured,
  };
}
