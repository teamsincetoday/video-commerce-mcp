import { describe, it, expect } from "vitest";
import {
  createSlug, computePromotionStatus, inferCategoriesFromEvent,
  getEventBadgeColor, getDefaultGardeningPromotions,
  type EthnobotanicalEvent,
} from "../../market-intelligence/commerce-calendar.js";

const mkEvent = (event: string, plants: string[] = []): EthnobotanicalEvent => ({
  event, month: 4, region: "UK", plantsInvolved: plants, priority: "medium",
});

describe("commerce-calendar", () => {
  describe("createSlug", () => {
    it("lowercases and hyphenates spaces", () => expect(createSlug("Spring Sale Now")).toBe("spring-sale-now"));
    it("strips special chars", () => expect(createSlug("Chelsea: Show!")).toBe("chelsea-show"));
    it("truncates at 100 chars", () => expect(createSlug("a".repeat(200))).toHaveLength(100));
    it("handles empty string", () => expect(createSlug("")).toBe(""));
  });

  describe("getEventBadgeColor", () => {
    it("returns purple for high priority", () => expect(getEventBadgeColor("high", "spring")).toBe("#8b5cf6"));
    it("high priority overrides season", () => expect(getEventBadgeColor("high", "winter")).toBe("#8b5cf6"));
    it("returns green for spring non-high", () => expect(getEventBadgeColor("medium", "spring")).toBe("#10b981"));
    it("returns amber for summer", () => expect(getEventBadgeColor("low", "summer")).toBe("#f59e0b"));
    it("falls back to gray for unknown season", () => expect(getEventBadgeColor("medium", "monsoon")).toBe("#6b7280"));
  });

  describe("inferCategoriesFromEvent", () => {
    it("always includes Plants", () =>
      expect(inferCategoriesFromEvent(mkEvent("Generic"))).toContain("Plants"));
    it("adds Ornamental Plants for flower events", () =>
      expect(inferCategoriesFromEvent(mkEvent("Chelsea Flower Show"))).toContain("Ornamental Plants"));
    it("adds Seeds for sow events", () =>
      expect(inferCategoriesFromEvent(mkEvent("Sow seeds now"))).toContain("Seeds"));
    it("adds Garden Protection for winter/frost events", () =>
      expect(inferCategoriesFromEvent(mkEvent("Winter frost alert"))).toContain("Garden Protection"));
    it("adds Vegetable Seeds for tomato plants", () =>
      expect(inferCategoriesFromEvent(mkEvent("Harvest", ["tomato"]))).toContain("Vegetable Seeds"));
    it("adds Herbs for basil plants", () =>
      expect(inferCategoriesFromEvent(mkEvent("Herb day", ["basil"]))).toContain("Herbs"));
  });

  describe("computePromotionStatus", () => {
    const base = {
      id: "p1", title: "T", slug: "t",
      startDate: new Date("2020-01-01"), endDate: new Date("2099-12-31"),
      isActive: true, featured: false, displayOrder: 0,
    };
    it("isLive when active and within date range", () =>
      expect(computePromotionStatus(base).isLive).toBe(true));
    it("not live when isActive false", () =>
      expect(computePromotionStatus({ ...base, isActive: false }).isLive).toBe(false));
    it("progress is between 0 and 100", () => {
      const { progress } = computePromotionStatus(base);
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(100);
    });
    it("parses JSON string arrays for categories", () =>
      expect(
        computePromotionStatus({ ...base, categories: '["Seeds","Bulbs"]' }).categories,
      ).toEqual(["Seeds", "Bulbs"]));
  });

  describe("getDefaultGardeningPromotions", () => {
    it("returns non-empty array with required shape", () => {
      const p = getDefaultGardeningPromotions();
      expect(p.length).toBeGreaterThan(0);
      expect(p[0]).toHaveProperty("title");
    });
  });
});
