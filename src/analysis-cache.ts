/**
 * Analysis Cache — SQLite-backed cache for video analysis results.
 *
 * Caches completed analyses to avoid re-processing previously analyzed videos.
 * Uses better-sqlite3 for synchronous, thread-safe operations.
 *
 * Features:
 * - TTL-based invalidation (default 7 days)
 * - Per-depth caching (standard vs deep analyses stored separately)
 * - In-memory hit/miss tracking for statistics
 * - Auto-cleanup of expired entries on startup
 * - Factory function for easy instantiation
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ============================================================================
// TYPES
// ============================================================================

/**
 * A cached analysis entry returned from the cache.
 */
export interface CachedAnalysis {
  videoId: string;
  depth: string;
  analysis: unknown;
  createdAt: Date;
  expiresAt: Date;
  toolName: string | null;
}

/**
 * Cache statistics including hit rate and storage info.
 */
export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  hitRate: number;
  hits: number;
  misses: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  expiredEntries: number;
}

/**
 * Options for the AnalysisCache constructor.
 */
export interface AnalysisCacheOptions {
  /** Path to the SQLite database file. Defaults to `./data/cache.db`. */
  dbPath?: string;
  /** Default TTL in seconds. Defaults to 604800 (7 days). */
  defaultTTL?: number;
}

/**
 * Options for setting a cache entry.
 */
export interface CacheSetOptions {
  /** Analysis depth key (e.g., 'standard', 'deep'). Defaults to 'standard'. */
  depth?: string;
  /** TTL in seconds for this specific entry. Overrides defaultTTL. */
  ttl?: number;
  /** Name of the tool that produced this analysis. */
  toolName?: string;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/** 7 days in seconds */
const DEFAULT_TTL_SECONDS = 604_800;

/** Default database path */
const DEFAULT_DB_PATH = "./data/cache.db";

// ============================================================================
// ANALYSIS CACHE
// ============================================================================

export class AnalysisCache {
  private readonly db: Database.Database;
  private readonly defaultTTL: number;
  private hits = 0;
  private misses = 0;

  // Prepared statements for performance
  private readonly stmtGet: Database.Statement;
  private readonly stmtSet: Database.Statement;
  private readonly stmtInvalidateOne: Database.Statement;
  private readonly stmtInvalidateAll: Database.Statement;
  private readonly stmtCleanup: Database.Statement;
  private readonly stmtCountAll: Database.Statement;
  private readonly stmtCountExpired: Database.Statement;
  private readonly stmtOldest: Database.Statement;
  private readonly stmtNewest: Database.Statement;
  private readonly stmtTotalSize: Database.Statement;

  constructor(options?: AnalysisCacheOptions) {
    const cacheDir = process.env.ANALYSIS_CACHE_DIR;
    // When running under vitest, use in-memory SQLite to prevent parallel
    // worker file contention. Explicit dbPath always takes precedence.
    const defaultPath = process.env.VITEST ? ":memory:" : DEFAULT_DB_PATH;
    const rawPath =
      options?.dbPath ?? (cacheDir ? `${cacheDir}/cache.db` : defaultPath);
    // Guard: :memory: must not be passed through path.resolve()
    const dbPath = rawPath === ":memory:" ? rawPath : resolve(rawPath);
    this.defaultTTL = options?.defaultTTL ?? DEFAULT_TTL_SECONDS;

    // Ensure directory exists (skip for in-memory databases)
    if (dbPath !== ":memory:") {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Open database with WAL mode for better concurrent read performance
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    // Create schema
    this.initSchema();

    // Prepare statements
    this.stmtGet = this.db.prepare(
      `SELECT video_id, depth, analysis_json, created_at, expires_at, tool_name
       FROM analysis_cache
       WHERE video_id = ? AND depth = ? AND expires_at > ?`
    );

    this.stmtSet = this.db.prepare(
      `INSERT OR REPLACE INTO analysis_cache (video_id, depth, analysis_json, created_at, expires_at, tool_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    this.stmtInvalidateOne = this.db.prepare(
      `DELETE FROM analysis_cache WHERE video_id = ? AND depth = ?`
    );

    this.stmtInvalidateAll = this.db.prepare(
      `DELETE FROM analysis_cache WHERE video_id = ?`
    );

    this.stmtCleanup = this.db.prepare(
      `DELETE FROM analysis_cache WHERE expires_at <= ?`
    );

    this.stmtCountAll = this.db.prepare(
      `SELECT COUNT(*) as count FROM analysis_cache`
    );

    this.stmtCountExpired = this.db.prepare(
      `SELECT COUNT(*) as count FROM analysis_cache WHERE expires_at <= ?`
    );

    this.stmtOldest = this.db.prepare(
      `SELECT MIN(created_at) as ts FROM analysis_cache`
    );

    this.stmtNewest = this.db.prepare(
      `SELECT MAX(created_at) as ts FROM analysis_cache`
    );

    this.stmtTotalSize = this.db.prepare(
      `SELECT COALESCE(SUM(LENGTH(analysis_json)), 0) as size FROM analysis_cache`
    );

    // Auto-cleanup expired entries on startup
    this.cleanup();
  }

  // --------------------------------------------------------------------------
  // CORE OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Get a cached analysis for a video.
   * Returns null if not found or expired.
   */
  get(videoId: string, depth = "standard"): CachedAnalysis | null {
    const now = Math.floor(Date.now() / 1000);
    const row = this.stmtGet.get(videoId, depth, now) as
      | {
          video_id: string;
          depth: string;
          analysis_json: string;
          created_at: number;
          expires_at: number;
          tool_name: string | null;
        }
      | undefined;

    if (!row) {
      this.misses++;
      return null;
    }

    this.hits++;

    return {
      videoId: row.video_id,
      depth: row.depth,
      analysis: JSON.parse(row.analysis_json),
      createdAt: new Date(row.created_at * 1000),
      expiresAt: new Date(row.expires_at * 1000),
      toolName: row.tool_name,
    };
  }

  /**
   * Store an analysis result in the cache.
   */
  set(
    videoId: string,
    analysis: unknown,
    options?: CacheSetOptions
  ): void {
    const depth = options?.depth ?? "standard";
    const ttl = options?.ttl ?? this.defaultTTL;
    const toolName = options?.toolName ?? null;
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttl;

    const json = JSON.stringify(analysis);

    this.stmtSet.run(videoId, depth, json, now, expiresAt, toolName);
  }

  /**
   * Invalidate cached analysis for a video.
   * If depth is specified, only that depth is removed.
   * If depth is omitted, all depths for the video are removed.
   */
  invalidate(videoId: string, depth?: string): void {
    if (depth) {
      this.stmtInvalidateOne.run(videoId, depth);
    } else {
      this.stmtInvalidateAll.run(videoId);
    }
  }

  // --------------------------------------------------------------------------
  // MAINTENANCE
  // --------------------------------------------------------------------------

  /**
   * Remove all expired entries from the cache.
   * Returns the number of entries removed.
   */
  cleanup(): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.stmtCleanup.run(now);
    return result.changes;
  }

  // --------------------------------------------------------------------------
  // STATISTICS
  // --------------------------------------------------------------------------

  /**
   * Get cache statistics including entry count, size, hit rate, and age range.
   */
  getStats(): CacheStats {
    const now = Math.floor(Date.now() / 1000);

    const totalRow = this.stmtCountAll.get() as { count: number };
    const expiredRow = this.stmtCountExpired.get(now) as { count: number };
    const oldestRow = this.stmtOldest.get() as { ts: number | null };
    const newestRow = this.stmtNewest.get() as { ts: number | null };
    const sizeRow = this.stmtTotalSize.get() as { size: number };

    const totalRequests = this.hits + this.misses;

    return {
      totalEntries: totalRow.count,
      totalSizeBytes: sizeRow.size,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      hits: this.hits,
      misses: this.misses,
      oldestEntry: oldestRow.ts !== null ? new Date(oldestRow.ts * 1000) : null,
      newestEntry: newestRow.ts !== null ? new Date(newestRow.ts * 1000) : null,
      expiredEntries: expiredRow.count,
    };
  }

  // --------------------------------------------------------------------------
  // LIFECYCLE
  // --------------------------------------------------------------------------

  /**
   * Close the database connection.
   * Call this when shutting down the server.
   */
  close(): void {
    this.db.close();
  }

  // --------------------------------------------------------------------------
  // PRIVATE
  // --------------------------------------------------------------------------

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_cache (
        video_id TEXT NOT NULL,
        depth TEXT NOT NULL DEFAULT 'standard',
        analysis_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        tool_name TEXT,
        PRIMARY KEY (video_id, depth)
      );

      CREATE INDEX IF NOT EXISTS idx_expires ON analysis_cache(expires_at);
      CREATE INDEX IF NOT EXISTS idx_created ON analysis_cache(created_at);
    `);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an AnalysisCache instance.
 * Convenience factory that accepts the same options as the constructor.
 */
export function createAnalysisCache(
  options?: AnalysisCacheOptions
): AnalysisCache {
  return new AnalysisCache(options);
}
