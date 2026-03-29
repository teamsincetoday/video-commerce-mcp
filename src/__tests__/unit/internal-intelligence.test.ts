import { describe, it, expect } from "vitest";
import {
  calculateInternalDemand,
  calculateInternalCommission,
  calculateInternalAuthority,
  calculateInternalConvergence,
  type DemandData,
  type CommissionData,
  type AuthorityData,
} from "../../market-intelligence/internal-intelligence.js";

const noop = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const demand = (): DemandData => ({
  totalKeywordMatches: 20, avgKeywordWeight: 1.5, videoMentions: 50,
  commerceItems: 30, totalViews: 500000, avgViewsPerVideo: 10000,
  totalProcessedVideos: 100, totalCommerceItems: 200,
  recentAvgViews: 12000, olderAvgViews: 10000,
});
const commission = (): CommissionData => ({
  relevantAffiliateCount: 5, estimatedCommissionRate: 8,
  availableProducts: 100, totalProducts: 500,
  affiliateLinkCount: 30, totalEntityLinks: 200,
});
const authority = (): AuthorityData => ({
  creators: [{ channelId: "ch1", channelName: "GardenPro", videoCount: 5, totalViews: 50000, avgRating: 4.5, avgEntities: 10, avgCommerceItems: 5 }],
  totalUniqueChannels: 50,
});

describe("calculateInternalDemand", () => {
  it("returns demandScore in [0, 100] with valid data", () => {
    const r = calculateInternalDemand(demand());
    expect(r.demandScore).toBeGreaterThan(0); expect(r.demandScore).toBeLessThanOrEqual(100);
  });
  it("returns 0 score and 0 confidence when all zeros", () => {
    const z = { totalKeywordMatches: 0, avgKeywordWeight: 0, videoMentions: 0, commerceItems: 0, totalViews: 0, avgViewsPerVideo: 0, totalProcessedVideos: 0, totalCommerceItems: 0, recentAvgViews: 0, olderAvgViews: 0 };
    const r = calculateInternalDemand(z);
    expect(r.demandScore).toBe(0); expect(r.confidence).toBe(0);
  });
  it("detects rising trend when recent > older * 1.2", () => {
    expect(calculateInternalDemand({ ...demand(), recentAvgViews: 15000, olderAvgViews: 10000 }).signals.recentTrend).toBe("rising");
  });
  it("detects declining trend when recent < older * 0.8", () => {
    expect(calculateInternalDemand({ ...demand(), recentAvgViews: 5000, olderAvgViews: 10000 }).signals.recentTrend).toBe("declining");
  });
  it("caps demandScore at 100 with extreme inputs", () => {
    expect(calculateInternalDemand({ ...demand(), totalKeywordMatches: 10000, avgKeywordWeight: 10 }).demandScore).toBeLessThanOrEqual(100);
  });
});

describe("calculateInternalCommission", () => {
  it("returns commissionScore in [0, 100] with valid data", () => {
    const r = calculateInternalCommission(commission());
    expect(r.commissionScore).toBeGreaterThan(0); expect(r.commissionScore).toBeLessThanOrEqual(100);
  });
  it("confidence floor is 50 even with zero affiliates", () => {
    expect(calculateInternalCommission({ ...commission(), relevantAffiliateCount: 0 }).confidence).toBeGreaterThanOrEqual(50);
  });
});

describe("calculateInternalAuthority", () => {
  it("returns authorityScore in [0, 100] with creators", () => {
    const r = calculateInternalAuthority(authority());
    expect(r.authorityScore).toBeGreaterThan(0); expect(r.authorityScore).toBeLessThanOrEqual(100);
  });
  it("empty creators returns authorityScore 0 and totalVideos 0", () => {
    const r = calculateInternalAuthority({ creators: [], totalUniqueChannels: 50 });
    expect(r.authorityScore).toBe(0); expect(r.signals.totalVideos).toBe(0);
  });
  it("sorts topCreators by contentQuality descending", () => {
    const data: AuthorityData = { totalUniqueChannels: 10, creators: [
      { channelId: "a", channelName: "Low", videoCount: 1, totalViews: 1000, avgRating: 3, avgEntities: 1, avgCommerceItems: 0 },
      { channelId: "b", channelName: "High", videoCount: 5, totalViews: 50000, avgRating: 5, avgEntities: 14, avgCommerceItems: 7 },
    ]};
    expect(calculateInternalAuthority(data).signals.topCreators[0]!.channelName).toBe("High");
  });
});

describe("calculateInternalConvergence", () => {
  it("convergenceScore = Math.round(D*C*A/10000)", () => {
    const r = calculateInternalConvergence(demand(), commission(), authority(), noop);
    expect(r.convergenceScore).toBe(Math.round((r.demand.demandScore * r.commission.commissionScore * r.authority.authorityScore) / 10000));
  });
  it("trendDirection is emerging when demand is rising", () => {
    expect(calculateInternalConvergence({ ...demand(), recentAvgViews: 20000, olderAvgViews: 10000 }, commission(), authority(), noop).trendDirection).toBe("emerging");
  });
  it("trendDirection is declining when demand is declining", () => {
    expect(calculateInternalConvergence({ ...demand(), recentAvgViews: 5000, olderAvgViews: 10000 }, commission(), authority(), noop).trendDirection).toBe("declining");
  });
});
