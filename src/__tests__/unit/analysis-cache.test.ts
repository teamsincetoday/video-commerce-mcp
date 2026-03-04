/**
 * Unit tests for the SQLite analysis cache.
 *
 * Tests:
 * - Cache read/write operations
 * - TTL-based invalidation
 * - Manual invalidation (single depth and all depths)
 * - Cache statistics (hit rate, entry count)
 * - Cleanup of expired entries
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AnalysisCache } from "../../analysis-cache.js";
import { resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("AnalysisCache", () => {
  let cache: AnalysisCache;
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(resolve(tmpdir(), "mcp-cache-test-"));
    cache = new AnalysisCache({
      dbPath: resolve(tempDir, "test-cache.db"),
      defaultTTL: 3600, // 1 hour for tests
    });
  });

  afterEach(() => {
    cache.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("set and get", () => {
    it("stores and retrieves an analysis", () => {
      const analysis = { videoId: "abc123", title: "Test Video", score: 85 };
      cache.set("abc123", analysis);

      const cached = cache.get("abc123");
      expect(cached).not.toBeNull();
      expect(cached!.videoId).toBe("abc123");
      expect(cached!.analysis).toEqual(analysis);
      expect(cached!.depth).toBe("standard");
    });

    it("stores with different depths separately", () => {
      const standard = { depth: "standard", data: "basic" };
      const deep = { depth: "deep", data: "detailed" };

      cache.set("abc123", standard, { depth: "standard" });
      cache.set("abc123", deep, { depth: "deep" });

      const cachedStandard = cache.get("abc123", "standard");
      const cachedDeep = cache.get("abc123", "deep");

      expect(cachedStandard!.analysis).toEqual(standard);
      expect(cachedDeep!.analysis).toEqual(deep);
    });

    it("returns null for non-existent video", () => {
      const cached = cache.get("nonexistent");
      expect(cached).toBeNull();
    });

    it("overwrites existing entry for same video+depth", () => {
      cache.set("abc123", { version: 1 });
      cache.set("abc123", { version: 2 });

      const cached = cache.get("abc123");
      expect(cached!.analysis).toEqual({ version: 2 });
    });

    it("stores and retrieves complex analysis objects", () => {
      const complex = {
        entities: [{ name: "Lavandula", confidence: 0.95 }],
        audience: { dominant: "seasonal_action" },
        nested: { deep: { data: true } },
      };

      cache.set("abc123", complex);
      const cached = cache.get("abc123");
      expect(cached!.analysis).toEqual(complex);
    });

    it("records tool name when provided", () => {
      cache.set("abc123", { test: true }, { toolName: "analyze_video" });
      const cached = cache.get("abc123");
      expect(cached!.toolName).toBe("analyze_video");
    });
  });

  describe("TTL and expiration", () => {
    it("returns null for expired entries", () => {
      // Set with a TTL of 0 seconds (expires immediately)
      cache.set("abc123", { data: "old" }, { ttl: 0 });

      // Wait a tiny bit to ensure expiration
      const cached = cache.get("abc123");
      expect(cached).toBeNull();
    });

    it("returns entry within TTL", () => {
      cache.set("abc123", { data: "fresh" }, { ttl: 3600 });
      const cached = cache.get("abc123");
      expect(cached).not.toBeNull();
    });
  });

  describe("invalidate", () => {
    it("invalidates a specific depth", () => {
      cache.set("abc123", { data: "standard" }, { depth: "standard" });
      cache.set("abc123", { data: "deep" }, { depth: "deep" });

      cache.invalidate("abc123", "standard");

      expect(cache.get("abc123", "standard")).toBeNull();
      expect(cache.get("abc123", "deep")).not.toBeNull();
    });

    it("invalidates all depths when depth is omitted", () => {
      cache.set("abc123", { data: "standard" }, { depth: "standard" });
      cache.set("abc123", { data: "deep" }, { depth: "deep" });

      cache.invalidate("abc123");

      expect(cache.get("abc123", "standard")).toBeNull();
      expect(cache.get("abc123", "deep")).toBeNull();
    });
  });

  describe("cleanup", () => {
    it("removes expired entries", () => {
      cache.set("expired1", { data: 1 }, { ttl: 0 });
      cache.set("expired2", { data: 2 }, { ttl: 0 });
      cache.set("fresh", { data: 3 }, { ttl: 3600 });

      const removed = cache.cleanup();
      expect(removed).toBe(2);

      expect(cache.get("expired1")).toBeNull();
      expect(cache.get("expired2")).toBeNull();
      expect(cache.get("fresh")).not.toBeNull();
    });
  });

  describe("getStats", () => {
    it("tracks hits and misses", () => {
      cache.set("abc123", { data: "test" });

      // 2 hits
      cache.get("abc123");
      cache.get("abc123");

      // 1 miss
      cache.get("nonexistent");

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it("reports total entries and size", () => {
      cache.set("video1", { data: "analysis1" });
      cache.set("video2", { data: "analysis2" });

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.totalSizeBytes).toBeGreaterThan(0);
    });

    it("reports oldest and newest entries", () => {
      cache.set("video1", { data: "first" });
      cache.set("video2", { data: "second" });

      const stats = cache.getStats();
      expect(stats.oldestEntry).not.toBeNull();
      expect(stats.newestEntry).not.toBeNull();
      expect(stats.oldestEntry!.getTime()).toBeLessThanOrEqual(
        stats.newestEntry!.getTime(),
      );
    });

    it("returns zero hit rate with no requests", () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });
});
