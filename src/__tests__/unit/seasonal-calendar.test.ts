/**
 * Unit tests for seasonal calendar region-aware output (Layer 2).
 *
 * Tests:
 * - Season detection by hemisphere
 * - Category inference from events
 * - Seasonal plant promotions
 * - Default gardening promotions
 * - Promotion status computation
 * - Slug generation
 */

import { describe, it, expect } from "vitest";
import {
  getCurrentSeason,
  inferCategoriesFromEvent,
  getSeasonalPlantPromotions,
  getDefaultGardeningPromotions,
  buildPromotionFromTemplate,
  computePromotionStatus,
  createSlug,
  getEventBadgeColor,
  type EthnobotanicalEvent,
} from "../../market-intelligence/commerce-calendar.js";

describe("Seasonal Calendar", () => {
  describe("getCurrentSeason", () => {
    it("returns a valid season string for northern hemisphere", () => {
      const season = getCurrentSeason("northern");
      expect(["spring", "summer", "autumn", "winter"]).toContain(season);
    });

    it("returns a valid season string for southern hemisphere", () => {
      const season = getCurrentSeason("southern");
      expect(["spring", "summer", "autumn", "winter"]).toContain(season);
    });

    it("defaults to northern hemisphere", () => {
      const season = getCurrentSeason();
      expect(["spring", "summer", "autumn", "winter"]).toContain(season);
    });
  });

  describe("inferCategoriesFromEvent", () => {
    it("infers plant and ornamental categories for flower shows", () => {
      const event: EthnobotanicalEvent = {
        event: "Chelsea Flower Show",
        month: 5,
        region: "UK",
        plantsInvolved: ["Rosa gallica", "Tulipa"],
        priority: "high",
      };

      const categories = inferCategoriesFromEvent(event);
      expect(categories).toContain("Plants");
      expect(categories).toContain("Ornamental Plants");
      expect(categories).toContain("Garden Design");
    });

    it("infers seed categories for sowing events", () => {
      const event: EthnobotanicalEvent = {
        event: "Spring Seed Sowing Festival",
        month: 3,
        region: "UK",
        plantsInvolved: ["Tomato", "Bean"],
        priority: "medium",
      };

      const categories = inferCategoriesFromEvent(event);
      expect(categories).toContain("Seeds");
      expect(categories).toContain("Propagation");
      expect(categories).toContain("Vegetable Seeds");
      expect(categories).toContain("Grow Your Own");
    });

    it("infers protection categories for winter events", () => {
      const event: EthnobotanicalEvent = {
        event: "Winter Frost Protection Week",
        month: 11,
        region: "UK",
        plantsInvolved: [],
        priority: "high",
      };

      const categories = inferCategoriesFromEvent(event);
      expect(categories).toContain("Garden Protection");
      expect(categories).toContain("Fleece");
    });

    it("infers herb categories from herb plants", () => {
      const event: EthnobotanicalEvent = {
        event: "Herb Garden Day",
        month: 6,
        region: "GLOBAL",
        plantsInvolved: ["Basil", "Mint", "Rosemary herb"],
        priority: "low",
      };

      const categories = inferCategoriesFromEvent(event);
      expect(categories).toContain("Herbs");
    });

    it("always includes Plants category", () => {
      const event: EthnobotanicalEvent = {
        event: "Generic Event",
        month: 1,
        region: "UK",
        plantsInvolved: [],
        priority: "low",
      };

      const categories = inferCategoriesFromEvent(event);
      expect(categories).toContain("Plants");
    });
  });

  describe("getSeasonalPlantPromotions", () => {
    it("generates promotions from ethnobotanical events", () => {
      const events: EthnobotanicalEvent[] = [
        {
          event: "Snowdrop Festival",
          month: 2,
          region: "UK",
          plantsInvolved: ["Galanthus nivalis"],
          priority: "high",
        },
        {
          event: "Summer Rose Week",
          month: 6,
          region: "UK",
          plantsInvolved: ["Rosa gallica"],
          priority: "medium",
        },
      ];

      const promotions = getSeasonalPlantPromotions(events, "UK", "northern");

      expect(promotions).toHaveLength(2);

      // High-priority should come first and have priority "high"
      const highPriority = promotions.find((p) => p.priority === "high");
      expect(highPriority).toBeDefined();
      expect(highPriority!.event).toBe("Snowdrop Festival");
      expect(highPriority!.plants).toContain("Galanthus nivalis");
      expect(highPriority!.badgeText).toBe("Snowdrop Festival");
    });

    it("returns empty promotions for empty events", () => {
      const promotions = getSeasonalPlantPromotions([]);
      expect(promotions).toHaveLength(0);
    });
  });

  describe("getDefaultGardeningPromotions", () => {
    it("returns predefined promotion templates", () => {
      const templates = getDefaultGardeningPromotions();
      expect(templates.length).toBeGreaterThan(0);

      // Should include Spring and Chelsea
      const spring = templates.find((t) => t.title.includes("Spring"));
      expect(spring).toBeDefined();

      const chelsea = templates.find((t) => t.title.includes("Chelsea"));
      expect(chelsea).toBeDefined();
      expect(chelsea!.region).toBe("UK");
    });

    it("each template has valid month ranges", () => {
      const templates = getDefaultGardeningPromotions();
      for (const template of templates) {
        expect(template.monthStart).toBeGreaterThanOrEqual(0);
        expect(template.monthStart).toBeLessThanOrEqual(11);
        expect(template.monthEnd).toBeGreaterThanOrEqual(0);
        expect(template.monthEnd).toBeLessThanOrEqual(11);
      }
    });
  });

  describe("buildPromotionFromTemplate", () => {
    it("builds a promotion with proper dates", () => {
      const templates = getDefaultGardeningPromotions();
      const template = templates[0]!;

      const promotion = buildPromotionFromTemplate(template, 2026);

      expect(promotion.title).toBe(template.title);
      expect(promotion.startDate).toBeInstanceOf(Date);
      expect(promotion.endDate).toBeInstanceOf(Date);
      expect(promotion.endDate.getTime()).toBeGreaterThan(
        promotion.startDate.getTime(),
      );
    });

    it("handles year-boundary promotions", () => {
      // Winter promotion spans Dec-Feb
      const winterTemplate = getDefaultGardeningPromotions().find(
        (t) => t.title.includes("Winter"),
      );
      if (winterTemplate) {
        const promotion = buildPromotionFromTemplate(winterTemplate, 2026);
        expect(promotion.endDate.getFullYear()).toBe(2027);
      }
    });
  });

  describe("computePromotionStatus", () => {
    it("marks active promotions as live", () => {
      const now = new Date();
      const promo = {
        id: "promo-1",
        title: "Current Sale",
        slug: "current-sale",
        startDate: new Date(now.getTime() - 86400000), // yesterday
        endDate: new Date(now.getTime() + 86400000), // tomorrow
        isActive: true,
        featured: true,
        displayOrder: 1,
      };

      const status = computePromotionStatus(promo);
      expect(status.isLive).toBe(true);
      expect(status.daysRemaining).toBe(1); // exactly 1 day remaining
      expect(status.progress).toBeGreaterThan(0);
      expect(status.progress).toBeLessThan(100);
    });

    it("marks inactive promotions as not live", () => {
      const now = new Date();
      const promo = {
        id: "promo-2",
        title: "Paused Sale",
        slug: "paused-sale",
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
        isActive: false,
        featured: false,
        displayOrder: 2,
      };

      const status = computePromotionStatus(promo);
      expect(status.isLive).toBe(false);
    });

    it("marks expired promotions as not live", () => {
      const promo = {
        id: "promo-3",
        title: "Old Sale",
        slug: "old-sale",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-31"),
        isActive: true,
        featured: false,
        displayOrder: 3,
      };

      const status = computePromotionStatus(promo);
      expect(status.isLive).toBe(false);
      expect(status.daysRemaining).toBe(0);
    });

    it("parses categories from JSON string", () => {
      const promo = {
        id: "promo-4",
        title: "Sale",
        slug: "sale",
        categories: '["Seeds", "Plants"]',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        isActive: true,
        featured: false,
        displayOrder: 1,
      };

      const status = computePromotionStatus(promo);
      expect(status.categories).toEqual(["Seeds", "Plants"]);
    });

    it("handles array categories directly", () => {
      const promo = {
        id: "promo-5",
        title: "Sale",
        slug: "sale",
        categories: ["Seeds", "Plants"],
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        isActive: true,
        featured: false,
        displayOrder: 1,
      };

      const status = computePromotionStatus(promo);
      expect(status.categories).toEqual(["Seeds", "Plants"]);
    });
  });

  describe("createSlug", () => {
    it("converts title to URL-friendly slug", () => {
      expect(createSlug("Spring Planting Sale")).toBe("spring-planting-sale");
      expect(createSlug("Chelsea Flower Show Week")).toBe(
        "chelsea-flower-show-week",
      );
    });

    it("removes special characters", () => {
      expect(createSlug("50% Off!")).toBe("50-off");
    });

    it("truncates to 100 characters", () => {
      const longTitle = "A".repeat(200);
      expect(createSlug(longTitle).length).toBeLessThanOrEqual(100);
    });
  });

  describe("getEventBadgeColor", () => {
    it("returns purple for high-priority events", () => {
      expect(getEventBadgeColor("high", "spring")).toBe("#8b5cf6");
    });

    it("returns season-specific colors for non-high priority", () => {
      expect(getEventBadgeColor("medium", "spring")).toBe("#10b981");
      expect(getEventBadgeColor("medium", "summer")).toBe("#f59e0b");
      expect(getEventBadgeColor("medium", "autumn")).toBe("#ef4444");
      expect(getEventBadgeColor("medium", "winter")).toBe("#3b82f6");
    });

    it("returns grey for unknown seasons", () => {
      expect(getEventBadgeColor("low", "unknown")).toBe("#6b7280");
    });
  });
});
