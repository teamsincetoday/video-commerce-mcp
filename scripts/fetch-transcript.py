#!/usr/bin/env python3
"""Fetch YouTube transcript via youtube-transcript-api.

Usage: fetch-transcript.py <video_id_or_url> [--lang en]

Output: JSON to stdout with { videoId, segments: [{ start, duration, text }], fullText }
Errors go to stderr. Exit code 0 = success, 1 = error.
"""
import sys
import json
import re

def extract_video_id(url_or_id):
    """Extract YouTube video ID from URL or bare ID."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/)([a-zA-Z0-9_-]{11})',
        r'^([a-zA-Z0-9_-]{11})$',
    ]
    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)
    return None

def main():
    if len(sys.argv) < 2:
        print("Usage: fetch-transcript.py <video_id_or_url> [--lang en]", file=sys.stderr)
        sys.exit(1)

    video_input = sys.argv[1]
    lang = 'en'
    if '--lang' in sys.argv:
        idx = sys.argv.index('--lang')
        if idx + 1 < len(sys.argv):
            lang = sys.argv[idx + 1]

    video_id = extract_video_id(video_input)
    if not video_id:
        print(json.dumps({"error": f"Invalid YouTube URL or ID: {video_input}"}))
        sys.exit(1)

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        ytt = YouTubeTranscriptApi()
        transcript = ytt.fetch(video_id, languages=[lang, 'en'])

        segments = []
        for snippet in transcript.snippets:
            segments.append({
                "start": snippet.start,
                "duration": snippet.duration,
                "text": snippet.text,
            })

        full_text = ' '.join(s['text'] for s in segments)

        result = {
            "videoId": video_id,
            "segments": segments,
            "fullText": full_text,
            "segmentCount": len(segments),
        }
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e), "videoId": video_id}))
        sys.exit(1)

if __name__ == '__main__':
    main()
