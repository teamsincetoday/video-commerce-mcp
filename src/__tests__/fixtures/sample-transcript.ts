/**
 * Sample transcript fixtures for testing.
 *
 * Realistic gardening video transcript segments to exercise
 * transcript parsing, preprocessing, and entity extraction.
 */

import type { TranscriptSegment, ParsedTranscript } from "../../types.js";

/**
 * A sample gardening video transcript about autumn border planting.
 * Contains plant names (Latin and common), tools, materials, and seasonal tasks.
 */
export const AUTUMN_BORDER_TRANSCRIPT_SEGMENTS: TranscriptSegment[] = [
  {
    timestamp: "00:00",
    start: 0,
    duration: 12.5,
    text: "Welcome back to the garden. Today we're going to look at autumn border planting and I'll show you how to create a stunning late-season display.",
  },
  {
    timestamp: "00:12",
    start: 12.5,
    duration: 15.0,
    text: "First up is this beautiful Helenium Sahin's Early Flowerer. It's been flowering since July and it's still going strong. The warm orange tones really light up the border.",
  },
  {
    timestamp: "00:27",
    start: 27.5,
    duration: 14.0,
    text: "Now I'm going to use my trusty Felco twos to give this plant a good trim. Using my Felco number 2 secateurs, I'll cut back the spent stems to encourage a second flush.",
  },
  {
    timestamp: "00:41",
    start: 41.5,
    duration: 18.0,
    text: "Next we have Rudbeckia fulgida var. sullivantii 'Goldsturm'. This is an absolute must-have for the autumn garden. It pairs beautifully with ornamental grasses like Miscanthus sinensis 'Morning Light'.",
  },
  {
    timestamp: "00:59",
    start: 59.5,
    duration: 12.0,
    text: "For the front of the border, I'm planting Sedum spectabile 'Autumn Joy'. The bees absolutely love it. Now's the time to get these in the ground before the frost.",
  },
  {
    timestamp: "01:11",
    start: 71.5,
    duration: 16.0,
    text: "I'm using a peat-free compost from Melcourt and mixing it with some blood fish and bone meal. This gives the plants the best start. Always buy the best compost you can afford.",
  },
  {
    timestamp: "01:27",
    start: 87.5,
    duration: 14.0,
    text: "If your leaves turn yellow on these plants, it's usually a sign of overwatering. Let the soil dry out between waterings. You can check the description below for links to all the plants mentioned.",
  },
  {
    timestamp: "01:41",
    start: 101.5,
    duration: 11.0,
    text: "Thanks for watching. Don't forget to subscribe and I'll see you next week when we look at how to divide perennials step by step.",
  },
];

export const AUTUMN_BORDER_FULL_TEXT = AUTUMN_BORDER_TRANSCRIPT_SEGMENTS.map(
  (s) => s.text,
).join(" ");

export const AUTUMN_BORDER_PARSED_TRANSCRIPT: ParsedTranscript = {
  videoId: "abc123test",
  segments: AUTUMN_BORDER_TRANSCRIPT_SEGMENTS,
  fullText: AUTUMN_BORDER_FULL_TEXT,
};

/**
 * A minimal transcript with only sponsor content (should be mostly filtered).
 */
export const SPONSOR_ONLY_TRANSCRIPT_SEGMENTS: TranscriptSegment[] = [
  {
    timestamp: "00:00",
    start: 0,
    duration: 30.0,
    text: "This video is sponsored by NordVPN. Use code GARDEN50 for 50% off your first year. Click the link in the description.",
  },
  {
    timestamp: "00:30",
    start: 30.0,
    duration: 15.0,
    text: "And if you like this content, smash that like button and subscribe. Turn on notifications so you never miss a video.",
  },
];

/**
 * YouTube XML caption format for testing XML parser.
 */
export const SAMPLE_XML_CAPTIONS = `<?xml version="1.0" encoding="utf-8" ?>
<transcript>
  <text start="0.0" dur="5.5">Welcome to the garden</text>
  <text start="5.5" dur="8.0">Today we&apos;re looking at Lavandula angustifolia</text>
  <text start="13.5" dur="6.0">This beautiful &amp; fragrant plant</text>
</transcript>`;

/**
 * YouTube JSON3 caption format for testing JSON3 parser.
 */
export const SAMPLE_JSON3_CAPTIONS = JSON.stringify({
  events: [
    {
      tStartMs: 0,
      dDurationMs: 5500,
      segs: [{ utf8: "Welcome to the garden" }],
    },
    {
      tStartMs: 5500,
      dDurationMs: 8000,
      segs: [{ utf8: "Today we're looking at " }, { utf8: "Lavandula angustifolia" }],
    },
    {
      tStartMs: 13500,
      dDurationMs: 6000,
      segs: [{ utf8: "This beautiful and fragrant plant" }],
    },
  ],
});

/**
 * Various YouTube URL formats for testing extractYouTubeId.
 */
export const YOUTUBE_URL_TEST_CASES = [
  { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
  { url: "https://youtu.be/dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
  { url: "https://youtube.com/embed/dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
  { url: "https://www.youtube.com/v/dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
  { url: "dQw4w9WgXcQ", expected: "dQw4w9WgXcQ" },
  { url: "https://example.com/notavideo", expected: null },
  { url: "", expected: null },
];
