/**
 * Unit tests for the transcript parser module.
 *
 * Tests:
 * - YouTube ID extraction from various URL formats
 * - Timestamp formatting
 * - ISO 8601 duration parsing
 * - (XML/JSON3 parsers are internal but tested via integration)
 */

import { describe, it, expect } from "vitest";
import {
  extractYouTubeId,
  formatSeconds,
  parseDuration,
} from "../../transcript/transcript-parser.js";
import { YOUTUBE_URL_TEST_CASES } from "../fixtures/sample-transcript.js";

describe("Transcript Parser", () => {
  describe("extractYouTubeId", () => {
    for (const { url, expected } of YOUTUBE_URL_TEST_CASES) {
      it(`extracts "${expected}" from "${url}"`, () => {
        expect(extractYouTubeId(url)).toBe(expected);
      });
    }

    it("extracts ID from URL with extra query params", () => {
      expect(
        extractYouTubeId(
          "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLabc",
        ),
      ).toBe("dQw4w9WgXcQ");
    });

    it("returns null for non-YouTube URLs", () => {
      expect(extractYouTubeId("https://vimeo.com/123456")).toBeNull();
    });

    it("returns null for short IDs (not 11 chars)", () => {
      expect(extractYouTubeId("abc")).toBeNull();
    });
  });

  describe("formatSeconds", () => {
    it("formats seconds under 1 hour as MM:SS", () => {
      expect(formatSeconds(0)).toBe("00:00");
      expect(formatSeconds(5)).toBe("00:05");
      expect(formatSeconds(65)).toBe("01:05");
      expect(formatSeconds(3599)).toBe("59:59");
    });

    it("formats seconds over 1 hour as HH:MM:SS", () => {
      expect(formatSeconds(3600)).toBe("01:00:00");
      expect(formatSeconds(3661)).toBe("01:01:01");
      expect(formatSeconds(7200)).toBe("02:00:00");
    });

    it("handles fractional seconds by flooring", () => {
      expect(formatSeconds(65.7)).toBe("01:05");
    });
  });

  describe("parseDuration", () => {
    it("parses ISO 8601 durations", () => {
      expect(parseDuration("PT15M51S")).toBe(951);
      expect(parseDuration("PT1H2M3S")).toBe(3723);
      expect(parseDuration("PT30S")).toBe(30);
      expect(parseDuration("PT10M")).toBe(600);
      expect(parseDuration("PT2H")).toBe(7200);
    });

    it("returns 0 for invalid duration strings", () => {
      expect(parseDuration("invalid")).toBe(0);
      expect(parseDuration("")).toBe(0);
    });
  });
});
