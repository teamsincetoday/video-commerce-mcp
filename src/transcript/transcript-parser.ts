/**
 * Transcript Parser — Standalone YouTube transcript fetching and parsing.
 *
 * Ported from monolith lib/services/transcript-parser.ts.
 * Removes: Prisma, @/lib/logger, @/lib/utils, youtubei.js, resilient-api-client.
 * Keeps: All parsing logic, XML/JSON3 caption parsers, metadata fetching, timestamp formatting.
 *
 * Uses the `youtube-transcript` npm package as primary transcript source,
 * with YouTube Data API v3 as fallback for captions and metadata.
 */

import { YoutubeTranscript } from "youtube-transcript";
import type {
  TranscriptSegment,
  ParsedTranscript,
  Logger,
} from "../types.js";
import { defaultLogger } from "../types.js";

// ============================================================================
// YOUTUBE ID EXTRACTION (replaces @/lib/utils extractYouTubeId)
// ============================================================================

/**
 * Extract YouTube video ID from various URL formats.
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/v/
 */
export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // bare video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

// ============================================================================
// XML / JSON3 CAPTION PARSERS
// ============================================================================

interface RawCaptionSegment {
  offset: number; // milliseconds
  duration: number; // milliseconds
  text: string;
}

/**
 * Parse XML caption format (srv3).
 */
function parseXMLCaptions(xmlText: string): RawCaptionSegment[] {
  try {
    const transcript: RawCaptionSegment[] = [];

    const textMatches = xmlText.matchAll(
      /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g,
    );

    for (const match of textMatches) {
      const startStr = match[1];
      const durationStr = match[2];
      let text = match[3];

      if (!startStr || !durationStr || text === undefined) continue;

      const start = parseFloat(startStr);
      const duration = parseFloat(durationStr);

      // Decode HTML entities
      text = text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ");

      transcript.push({
        offset: start * 1000,
        duration: duration * 1000,
        text: text.trim(),
      });
    }

    return transcript;
  } catch {
    return [];
  }
}

/**
 * Parse JSON3 caption format.
 */
function parseJSON3Captions(jsonText: string): RawCaptionSegment[] {
  try {
    const data = JSON.parse(jsonText) as {
      events?: Array<{
        tStartMs?: number;
        dDurationMs?: number;
        segs?: Array<{ utf8?: string }>;
      }>;
    };
    const transcript: RawCaptionSegment[] = [];

    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        if (event.segs && Array.isArray(event.segs)) {
          const text = event.segs
            .map((seg) => seg.utf8 ?? "")
            .join("");

          if (text.trim()) {
            transcript.push({
              offset: event.tStartMs ?? 0,
              duration: event.dDurationMs ?? 0,
              text: text.trim(),
            });
          }
        }
      }
    }

    return transcript;
  } catch {
    return [];
  }
}

// ============================================================================
// TIMESTAMP FORMATTING
// ============================================================================

/**
 * Format seconds to timestamp string (HH:MM:SS or MM:SS).
 */
export function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse ISO 8601 duration to seconds.
 * e.g., PT15M51S -> 951 seconds
 */
export function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// ============================================================================
// TRANSCRIPT FETCHING OPTIONS
// ============================================================================

export interface TranscriptFetchOptions {
  /** YouTube API key for Data API v3 fallback. Optional. */
  youtubeApiKey?: string;
  /** Logger instance. Defaults to console-based logger. */
  logger?: Logger;
  /** Preferred language codes, in priority order. Defaults to ["en"]. */
  languages?: string[];
}

// ============================================================================
// PRIMARY TRANSCRIPT FETCHING (youtube-transcript package)
// ============================================================================

/**
 * Parse YouTube video transcript.
 * Uses `youtube-transcript` npm package as primary source.
 * Falls back to YouTube Data API v3 captions if available.
 *
 * Pure function: no database access, no global state.
 */
export async function parseTranscript(
  videoUrl: string,
  options: TranscriptFetchOptions = {},
): Promise<ParsedTranscript> {
  const log = options.logger ?? defaultLogger;
  const videoId = extractYouTubeId(videoUrl);

  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  // Strategy 1: youtube-transcript package
  try {
    log.info("Fetching transcript via youtube-transcript package", { videoId });

    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: options.languages?.[0] ?? "en",
    });

    if (transcriptItems && transcriptItems.length > 0) {
      const segments: TranscriptSegment[] = transcriptItems.map((item) => ({
        timestamp: formatSeconds(item.offset / 1000),
        start: item.offset / 1000,
        duration: item.duration / 1000,
        text: item.text.replace(/\[.*?\]/g, "").trim(), // Remove [Music], [Applause], etc.
      }));

      const fullText = segments.map((s) => s.text).join(" ");

      log.info("Successfully fetched transcript", {
        segmentCount: segments.length,
        textLength: fullText.length,
      });

      return { videoId, segments, fullText };
    }
  } catch (error) {
    log.info("youtube-transcript package failed, trying fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Strategy 2: YouTube Data API v3 captions (requires API key)
  if (options.youtubeApiKey) {
    try {
      const segments = await fetchTranscriptViaYouTubeAPI(
        videoId,
        options.youtubeApiKey,
        log,
      );

      if (segments.length > 0) {
        const transcriptSegments: TranscriptSegment[] = segments.map(
          (seg) => ({
            timestamp: formatSeconds(seg.offset / 1000),
            start: seg.offset / 1000,
            duration: seg.duration / 1000,
            text: seg.text.replace(/\[.*?\]/g, "").trim(),
          }),
        );

        const fullText = transcriptSegments.map((s) => s.text).join(" ");

        return { videoId, segments: transcriptSegments, fullText };
      }
    } catch (error) {
      log.info("YouTube API fallback also failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Return empty result for graceful degradation
  log.warn("No transcript available for video", { videoId });
  return { videoId, segments: [], fullText: "" };
}

// ============================================================================
// YOUTUBE DATA API V3 FALLBACK
// ============================================================================

/**
 * Fetch transcript using YouTube Data API v3 Captions.
 * Tries srv3 (XML) and json3 formats.
 */
async function fetchTranscriptViaYouTubeAPI(
  videoId: string,
  apiKey: string,
  log: Logger,
): Promise<RawCaptionSegment[]> {
  log.info("Fetching captions list via YouTube API", { videoId });

  // Step 1: Get available captions
  const captionsListUrl = `https://www.googleapis.com/youtube/v3/captions?videoId=${videoId}&part=snippet&key=${apiKey}`;
  const captionsListResponse = await fetch(captionsListUrl);

  if (!captionsListResponse.ok) {
    const errorText = await captionsListResponse.text();
    throw new Error(
      `Failed to fetch captions list: ${captionsListResponse.status} ${errorText}`,
    );
  }

  const captionsListData = (await captionsListResponse.json()) as {
    items?: Array<{
      id: string;
      snippet: {
        language: string;
        trackKind: string;
      };
    }>;
  };

  if (!captionsListData.items || captionsListData.items.length === 0) {
    log.info("No captions available for video", { videoId });
    return [];
  }

  // Step 2: Find English caption track (prefer manual over auto-generated)
  const englishCaptions = captionsListData.items.filter(
    (caption) =>
      caption.snippet.language === "en" ||
      caption.snippet.language.startsWith("en-"),
  );

  if (englishCaptions.length === 0) {
    log.info("No English captions found for video", { videoId });
    return [];
  }

  const preferredCaption =
    englishCaptions.find((c) => c.snippet.trackKind !== "asr") ??
    englishCaptions[0]!;

  log.info("Found caption track", {
    language: preferredCaption.snippet.language,
    trackKind: preferredCaption.snippet.trackKind,
  });

  // Step 3: Download caption track (try multiple formats)
  const formats: Array<{
    fmt: string;
    parser: (text: string) => RawCaptionSegment[];
  }> = [
    { fmt: "srv3", parser: parseXMLCaptions },
    { fmt: "json3", parser: parseJSON3Captions },
  ];

  for (const { fmt, parser } of formats) {
    try {
      const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${preferredCaption.snippet.language}&fmt=${fmt}`;

      const captionResponse = await fetch(timedTextUrl);

      if (!captionResponse.ok) continue;

      const captionText = await captionResponse.text();
      if (!captionText || captionText.length === 0) continue;

      const transcript = parser(captionText);

      if (transcript.length > 0) {
        log.info("Successfully parsed caption segments", {
          count: transcript.length,
          format: fmt,
        });
        return transcript;
      }
    } catch {
      continue;
    }
  }

  return [];
}

// ============================================================================
// VIDEO METADATA (optional, uses YouTube Data API v3)
// ============================================================================

export interface VideoMetadata {
  youtubeId: string;
  title: string;
  channelId: string;
  channelName: string;
  thumbnail: string | null;
  duration: number; // seconds
  publishedAt: Date;
  viewCount: number;
  description: string | null;
  tags: string[] | null;
  categoryId: string | null;
  topicCategories: string[] | null;
  captionType: "auto" | "manual" | "none";
  defaultLanguage: string | null;
  embeddable: boolean | null;
}

/**
 * Get video metadata using YouTube Data API v3.
 * Pure function: requires API key as parameter.
 */
export async function getVideoMetadata(
  videoId: string,
  apiKey: string,
  logger?: Logger,
): Promise<VideoMetadata | null> {
  const log = logger ?? defaultLogger;

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails,statistics,status,topicDetails&key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      log.error("YouTube API error", new Error(`Status ${response.status}`));
      return null;
    }

    const data = (await response.json()) as {
      items?: Array<{
        snippet: {
          title: string;
          channelId: string;
          channelTitle: string;
          description: string;
          tags?: string[];
          categoryId?: string;
          publishedAt: string;
          defaultLanguage?: string;
          defaultAudioLanguage?: string;
          thumbnails: {
            maxres?: { url: string };
            high?: { url: string };
          };
        };
        contentDetails: {
          duration: string;
          caption: string;
        };
        statistics: {
          viewCount?: string;
        };
        status?: {
          embeddable?: boolean;
        };
        topicDetails?: {
          topicCategories?: string[];
        };
      }>;
    };

    if (!data.items || data.items.length === 0) return null;

    const video = data.items[0]!;

    let captionType: "auto" | "manual" | "none" = "none";
    if (video.contentDetails.caption === "true") {
      captionType = "auto"; // Default; getCaptionType can refine this
    }

    return {
      youtubeId: videoId,
      title: video.snippet.title,
      channelId: video.snippet.channelId,
      channelName: video.snippet.channelTitle,
      thumbnail:
        video.snippet.thumbnails.maxres?.url ??
        video.snippet.thumbnails.high?.url ??
        null,
      duration: parseDuration(video.contentDetails.duration),
      publishedAt: new Date(video.snippet.publishedAt),
      viewCount: parseInt(video.statistics.viewCount ?? "0", 10),
      description: video.snippet.description ?? null,
      tags: video.snippet.tags ?? null,
      categoryId: video.snippet.categoryId ?? null,
      topicCategories: video.topicDetails?.topicCategories ?? null,
      captionType,
      defaultLanguage:
        video.snippet.defaultLanguage ??
        video.snippet.defaultAudioLanguage ??
        null,
      embeddable: video.status?.embeddable ?? null,
    };
  } catch (error) {
    log.error(
      "YouTube API error",
      error instanceof Error ? error : undefined,
    );
    return null;
  }
}

/**
 * Get detailed caption type for a video (auto-generated vs manual).
 * Pure function: requires API key as parameter.
 */
export async function getCaptionType(
  videoId: string,
  apiKey: string,
  logger?: Logger,
): Promise<"auto" | "manual" | "none"> {
  const log = logger ?? defaultLogger;

  try {
    const url = `https://www.googleapis.com/youtube/v3/captions?videoId=${videoId}&part=snippet&key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) return "none";

    const data = (await response.json()) as {
      items?: Array<{
        snippet: {
          language: string;
          trackKind: string;
        };
      }>;
    };

    if (!data.items || data.items.length === 0) return "none";

    const englishCaptions = data.items.filter(
      (caption) =>
        caption.snippet.language === "en" ||
        caption.snippet.language.startsWith("en-"),
    );

    if (englishCaptions.length === 0) return "none";

    const preferred =
      englishCaptions.find((c) => c.snippet.trackKind !== "asr") ??
      englishCaptions[0]!;

    return preferred.snippet.trackKind === "asr" ? "auto" : "manual";
  } catch (error) {
    log.error(
      "Error getting caption type",
      error instanceof Error ? error : undefined,
    );
    return "none";
  }
}
