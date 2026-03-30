/**
 * Unit tests for pipeline-orchestrator.ts pure utility functions.
 *
 * Covers: timestampToSeconds, buildTimestampUrl
 * Both are module-level pure functions — no mocks needed.
 */

import { describe, it, expect } from "vitest";
import {
  timestampToSeconds,
  buildTimestampUrl,
} from "../../pipeline-orchestrator.js";

// ============================================================================
// timestampToSeconds
// ============================================================================

describe("timestampToSeconds", () => {
  it("converts MM:SS to seconds", () => {
    expect(timestampToSeconds("1:30")).toBe(90);
  });

  it("converts HH:MM:SS to seconds", () => {
    expect(timestampToSeconds("1:00:00")).toBe(3600);
  });

  it("handles 0:00 → 0", () => {
    expect(timestampToSeconds("0:00")).toBe(0);
  });

  it("handles multi-hour HH:MM:SS", () => {
    expect(timestampToSeconds("2:15:45")).toBe(2 * 3600 + 15 * 60 + 45);
  });

  it("handles zero-padded MM:SS", () => {
    expect(timestampToSeconds("0:45")).toBe(45);
  });

  it("returns 0 for empty string", () => {
    expect(timestampToSeconds("")).toBe(0);
  });

  it("returns 0 for malformed string (NaN parts)", () => {
    expect(timestampToSeconds("abc:def")).toBe(0);
  });

  it("returns 0 for single-part string (no colon)", () => {
    expect(timestampToSeconds("120")).toBe(0);
  });

  it("returns 0 for 4-part string (too many colons)", () => {
    expect(timestampToSeconds("1:2:3:4")).toBe(0);
  });
});

// ============================================================================
// buildTimestampUrl
// ============================================================================

describe("buildTimestampUrl", () => {
  it("builds URL from MM:SS timestamp", () => {
    expect(buildTimestampUrl("dQw4w9WgXcQ", "1:30")).toBe(
      "https://youtu.be/dQw4w9WgXcQ?t=90",
    );
  });

  it("builds URL from HH:MM:SS timestamp", () => {
    expect(buildTimestampUrl("abc123", "1:00:00")).toBe(
      "https://youtu.be/abc123?t=3600",
    );
  });

  it("returns undefined for empty timestamp", () => {
    expect(buildTimestampUrl("vid123", "")).toBeUndefined();
  });

  it("returns URL with t=0 for malformed timestamp", () => {
    expect(buildTimestampUrl("vid123", "bad:ts")).toBe(
      "https://youtu.be/vid123?t=0",
    );
  });

  it("uses the exact videoId in the URL", () => {
    const url = buildTimestampUrl("test-video-id_v2", "0:30");
    expect(url).toContain("test-video-id_v2");
  });
});
