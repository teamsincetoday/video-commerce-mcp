#!/usr/bin/env node

/**
 * CLI entry point for the Video Commerce Intelligence MCP Server.
 *
 * Usage:
 *   npx video-commerce-mcp                    # Start MCP server (stdio transport)
 *   npx video-commerce-mcp --transport sse    # Start SSE server on port 3001
 *   npx video-commerce-mcp --transport sse --port 4000  # Custom port
 *   npx video-commerce-mcp --help             # Show help
 */

import { startStdioServer, startSseServer } from "./server.js";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`
Video Commerce Intelligence MCP Server v0.1.0

Usage:
  npx video-commerce-mcp                         Start MCP server (stdio transport)
  npx video-commerce-mcp --transport sse          Start SSE server (default port 3001)
  npx video-commerce-mcp --transport sse --port N Start SSE server on custom port
  npx video-commerce-mcp --help                   Show this help message
  npx video-commerce-mcp --version                Show version

Options:
  --transport <stdio|sse>  Transport type (default: stdio)
  --port <number>          Port for SSE transport (default: 3001)

Environment Variables:
  OPENAI_API_KEY       Required. OpenAI API key for NER extraction.
  ANALYSIS_CACHE_DIR   Optional. Directory for SQLite cache. Default: ~/.video-commerce-mcp/
  X402_ENABLED         Optional. Enable x402 payment verification. Default: false

Tools (12 total):
  Layer 1 — Video Intelligence:
    analyze_video                Full commercial intelligence analysis
    get_commercial_entities      Quick entity extraction
    get_monetization_opportunities  Ranked monetization strategies
    get_audience_insights        Intent archetype analysis
    discover_content_gaps        Market gap analysis
    batch_analyze                Multi-video analysis (up to 10)

  Layer 2 — Market Intelligence:
    discover_opportunities       Convergence scoring
    scan_affiliate_programs      Affiliate network search
    assess_channel_authority     Channel scoring (5 dimensions)
    map_category_affinity        Cross-category relationships
    track_category_lifecycle     Category state tracking
    get_seasonal_calendar        Regional commerce calendar

Documentation:
  https://github.com/MyGardenShows/video-commerce-mcp
\n`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write("0.1.0\n");
  process.exit(0);
}

// Parse transport option
const transportIndex = args.indexOf("--transport");
const transport =
  transportIndex !== -1 && args[transportIndex + 1]
    ? args[transportIndex + 1]
    : "stdio";

if (transport !== "stdio" && transport !== "sse") {
  console.error(
    `Invalid transport: "${transport}". Must be "stdio" or "sse".`
  );
  process.exit(1);
}

// Parse port option (only relevant for SSE)
const portIndex = args.indexOf("--port");
const portArg =
  portIndex !== -1 && args[portIndex + 1] ? args[portIndex + 1] : undefined;
const port = portArg ? parseInt(portArg, 10) : 3001;

if (portArg && (isNaN(port) || port < 1 || port > 65535)) {
  console.error(
    `Invalid port: "${portArg}". Must be a number between 1 and 65535.`
  );
  process.exit(1);
}

// Start the appropriate server
if (transport === "sse") {
  startSseServer(port).catch((error: unknown) => {
    console.error("Failed to start SSE MCP server:", error);
    process.exit(1);
  });
} else {
  startStdioServer().catch((error: unknown) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  });
}
