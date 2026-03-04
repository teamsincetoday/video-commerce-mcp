/**
 * DISCOVER Loop — Monthly Market Research & MCP Opportunity Scoring
 *
 * Runs monthly (1st of each month at 10:00). Researches gaps in the
 * agent/MCP ecosystem, scores opportunities, generates product briefs.
 *
 * Each MCP concept gets a 14-day traction window. If no traction,
 * the loop moves to the next highest-potential vertical.
 *
 * Includes promotion strategy: identifies best marketplaces and community
 * channels for each MCP concept launch.
 *
 * Usage: npx tsx incubator/loops/discover.ts
 */

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { createUsageMetering } from "../../src/usage-metering.js";
import { PATHS, DISCOVERY, timestamp, today } from "../config.js";

// ============================================================================
// TYPES
// ============================================================================

interface OpportunityScore {
  /** Total addressable market (agents/users that would pay) */
  tam: number;
  /** Network effects, data moats, switching costs (0-1) */
  defensibility: number;
  /** Are agents already trying to do this poorly? (0-1) */
  agentDemand: number;
  /** Can we ship MVP in <2 weeks? (1-10, lower = easier) */
  buildComplexity: number;
  /** Composite score */
  composite: number;
}

interface MarketplaceChannel {
  name: string;
  url: string;
  type: "registry" | "marketplace" | "community" | "directory";
  audienceSize: string;
  priority: "must" | "should" | "could";
  notes: string;
}

interface MCPProductBrief {
  name: string;
  tagline: string;
  vertical: string;
  problem: string;
  solution: string;
  targetAgents: string[];
  score: OpportunityScore;
  tractionWindow: {
    startDate: string;
    endDate: string;
    successMetrics: string[];
  };
  promotion: {
    channels: MarketplaceChannel[];
    launchStrategy: string;
  };
  moat: string;
  mvpScope: string[];
  estimatedBuildDays: number;
  status: "researched" | "building" | "launched" | "traction" | "abandoned";
}

interface DiscoveryReport {
  date: string;
  timestamp: string;
  currentMCPPerformance: {
    videoCommerceMcp: {
      totalCallsMonth: number;
      revenueMonth: number;
      uniqueAgents: number;
      topTools: Array<{ tool: string; calls: number }>;
    };
  };
  opportunities: MCPProductBrief[];
  previousBriefs: Array<{
    name: string;
    status: string;
    tractionResult?: string;
  }>;
  marketTrends: string[];
  nextActions: string[];
}

// ============================================================================
// MCP DISTRIBUTION CHANNELS
// ============================================================================

/** Known marketplaces and communities for MCP distribution */
const MCP_CHANNELS: MarketplaceChannel[] = [
  {
    name: "MCP Hub (mcp.so)",
    url: "https://mcp.so",
    type: "directory",
    audienceSize: "Growing — primary MCP discovery",
    priority: "must",
    notes: "Submit via their listing form. Include clear tool descriptions.",
  },
  {
    name: "Smithery.ai",
    url: "https://smithery.ai",
    type: "marketplace",
    audienceSize: "Active agent developer community",
    priority: "must",
    notes: "Marketplace for MCP servers. Good discovery from Claude users.",
  },
  {
    name: "npm Registry",
    url: "https://www.npmjs.com",
    type: "registry",
    audienceSize: "Massive — standard JS ecosystem",
    priority: "must",
    notes: "npm publish. Good keywords, README with examples.",
  },
  {
    name: "GitHub MCP Servers List",
    url: "https://github.com/modelcontextprotocol/servers",
    type: "directory",
    audienceSize: "Official MCP ecosystem",
    priority: "must",
    notes: "Submit PR to add to official servers list.",
  },
  {
    name: "Glama.ai",
    url: "https://glama.ai/mcp/servers",
    type: "directory",
    audienceSize: "MCP server discovery",
    priority: "should",
    notes: "Another MCP directory. Submit for listing.",
  },
  {
    name: "Reddit r/ClaudeAI",
    url: "https://reddit.com/r/ClaudeAI",
    type: "community",
    audienceSize: "Large — 100k+ Claude users",
    priority: "should",
    notes: "Share as a useful tool post, not marketing. Show real examples.",
  },
  {
    name: "Hacker News",
    url: "https://news.ycombinator.com",
    type: "community",
    audienceSize: "Massive — developer audience",
    priority: "could",
    notes: "Show HN post. Needs genuine technical value.",
  },
  {
    name: "X/Twitter #MCP",
    url: "https://x.com",
    type: "community",
    audienceSize: "Large AI developer audience",
    priority: "should",
    notes: "Thread showing what the MCP does with concrete examples.",
  },
  {
    name: "Discord — Anthropic Community",
    url: "https://discord.gg/anthropic",
    type: "community",
    audienceSize: "Active Claude developer community",
    priority: "should",
    notes: "Share in appropriate channel. Engage with feedback.",
  },
];

// ============================================================================
// OPPORTUNITY SCORING
// ============================================================================

function scoreOpportunity(params: {
  tam: number;
  defensibility: number;
  agentDemand: number;
  buildComplexity: number;
}): OpportunityScore {
  const composite =
    (params.tam * params.defensibility * params.agentDemand) /
    params.buildComplexity;

  return { ...params, composite };
}

function calculateTractionWindow(): { startDate: string; endDate: string } {
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().split("T")[0]!,
    endDate: end.toISOString().split("T")[0]!,
  };
}

// ============================================================================
// MCP OPPORTUNITY TEMPLATES
// ============================================================================

function generateOpportunities(): MCPProductBrief[] {
  const tractionWindow = calculateTractionWindow();

  const opportunities: MCPProductBrief[] = [
    {
      name: "recipe-commerce-mcp",
      tagline: "Turn cooking videos into shoppable ingredient lists",
      vertical: "cooking",
      problem:
        "Cooking video viewers can't easily buy exact ingredients shown. Recipe extraction is poor, ingredient-to-product matching doesn't exist for agents.",
      solution:
        "Extract recipes, match to grocery/specialty products, score affiliate opportunities. Same pipeline architecture as video-commerce-mcp adapted for food.",
      targetAgents: [
        "Meal planning agents",
        "Grocery shopping assistants",
        "Recipe aggregators",
        "Content creator tools",
      ],
      score: scoreOpportunity({
        tam: 5000,
        defensibility: 0.6,
        agentDemand: 0.7,
        buildComplexity: 4,
      }),
      tractionWindow: {
        ...tractionWindow,
        successMetrics: [
          ">50 tool calls in first week",
          ">5 unique agents",
          ">0 revenue from x402",
        ],
      },
      promotion: {
        channels: MCP_CHANNELS.filter((c) => c.priority === "must" || c.priority === "should"),
        launchStrategy:
          "Launch on npm + MCP directories first week. Reddit/Twitter demos week 2. Target meal planning and grocery agent developers.",
      },
      moat: "Recipe NER with ingredient-to-product matching builds data advantage. Cross-sell with video-commerce-mcp for multi-vertical creators.",
      mvpScope: [
        "YouTube recipe video transcript extraction",
        "Ingredient NER with quantities",
        "Product matching to major grocery categories",
        "Affiliate link generation for specialty ingredients",
        "Nutritional data enrichment",
      ],
      estimatedBuildDays: 10,
      status: "researched",
    },
    {
      name: "diy-commerce-mcp",
      tagline: "Extract tools, materials, and supply lists from DIY videos",
      vertical: "diy",
      problem:
        "DIY/home improvement video viewers need specific tools and materials but can't easily get shopping lists. Hardware affiliate programs are underserved.",
      solution:
        "Extract tools, materials, measurements from DIY transcripts. Match to hardware store products. Score project complexity and cost estimates.",
      targetAgents: [
        "Home improvement planners",
        "Project cost estimators",
        "Hardware shopping assistants",
        "Content creator monetization tools",
      ],
      score: scoreOpportunity({
        tam: 8000,
        defensibility: 0.5,
        agentDemand: 0.6,
        buildComplexity: 5,
      }),
      tractionWindow: {
        ...tractionWindow,
        successMetrics: [
          ">30 tool calls in first week",
          ">3 unique agents",
          "Positive community feedback",
        ],
      },
      promotion: {
        channels: MCP_CHANNELS.filter((c) => c.priority === "must" || c.priority === "should"),
        launchStrategy:
          "Launch alongside video-commerce-mcp. Cross-promote on DIY subreddits and maker communities. Demo with popular DIY YouTube channels.",
      },
      moat: "Tool-material relationship graph builds over time. Measurement extraction and cost estimation create switching costs.",
      mvpScope: [
        "YouTube DIY video transcript extraction",
        "Tool and material NER",
        "Quantity and measurement extraction",
        "Hardware category matching",
        "Project cost estimation",
        "Safety equipment detection",
      ],
      estimatedBuildDays: 12,
      status: "researched",
    },
    {
      name: "podcast-commerce-mcp",
      tagline: "Extract product mentions and recommendations from podcasts",
      vertical: "podcasts",
      problem:
        "Podcasts mention products constantly but there's no structured way for agents to extract and monetize these mentions. Podcast transcripts are long and noisy.",
      solution:
        "Long-form transcript processing optimized for conversational content. Speaker attribution. Product mention extraction with sentiment and recommendation strength.",
      targetAgents: [
        "Podcast summary agents",
        "Product recommendation engines",
        "Affiliate marketing platforms",
        "Content curation tools",
      ],
      score: scoreOpportunity({
        tam: 12000,
        defensibility: 0.7,
        agentDemand: 0.8,
        buildComplexity: 6,
      }),
      tractionWindow: {
        ...tractionWindow,
        successMetrics: [
          ">40 tool calls in first week",
          ">5 unique agents",
          "Cross-category product extraction working",
        ],
      },
      promotion: {
        channels: MCP_CHANNELS,
        launchStrategy:
          "Broad launch — podcasts cross all verticals. Target podcast analytics companies, recommendation engine builders. Show HN potential.",
      },
      moat: "Speaker attribution + sentiment analysis on recommendations is hard to replicate. Long-form processing expertise transfers from video-commerce-mcp.",
      mvpScope: [
        "YouTube podcast transcript extraction",
        "Speaker diarization (basic)",
        "Product mention detection with context",
        "Recommendation sentiment scoring",
        "Multi-category entity extraction",
        "Episode comparison and trending products",
      ],
      estimatedBuildDays: 14,
      status: "researched",
    },
    {
      name: "course-commerce-mcp",
      tagline: "Extract learning paths and resources from educational videos",
      vertical: "education",
      problem:
        "Educational videos reference books, tools, courses, and resources that viewers want to buy. No agent can extract structured learning paths from video content.",
      solution:
        "Extract educational resources (books, courses, tools, software), build skill dependency graphs, match to purchasable resources. Score learning path completeness.",
      targetAgents: [
        "Learning management agents",
        "Study planning assistants",
        "Resource curation tools",
        "EdTech platforms",
      ],
      score: scoreOpportunity({
        tam: 15000,
        defensibility: 0.8,
        agentDemand: 0.5,
        buildComplexity: 7,
      }),
      tractionWindow: {
        ...tractionWindow,
        successMetrics: [
          ">25 tool calls in first week",
          "Skill graph generation working",
          "Resource matching accuracy >70%",
        ],
      },
      promotion: {
        channels: MCP_CHANNELS,
        launchStrategy:
          "Target EdTech developers and learning platform builders. Academic Twitter/X. Developer education communities.",
      },
      moat: "Skill dependency graphs and learning path optimization create strong data moat. Hard to replicate without significant training data.",
      mvpScope: [
        "Educational video transcript extraction",
        "Resource NER (books, courses, tools, software)",
        "Skill and concept extraction",
        "Learning path sequencing",
        "Resource-to-product matching",
        "Prerequisite detection",
      ],
      estimatedBuildDays: 14,
      status: "researched",
    },
  ];

  // Sort by composite score descending
  opportunities.sort((a, b) => b.score.composite - a.score.composite);
  return opportunities;
}

// ============================================================================
// MAIN
// ============================================================================

function discover(): DiscoveryReport {
  console.log(`[discover] Analyzing current MCP performance...`);

  // ── 1. Current MCP Performance ──────────────────────────────────────
  let videoCommerceMcp = {
    totalCallsMonth: 0,
    revenueMonth: 0,
    uniqueAgents: 0,
    topTools: [] as Array<{ tool: string; calls: number }>,
  };

  {
    let metering: ReturnType<typeof createUsageMetering> | null = null;
    try {
      metering = createUsageMetering({ dbPath: PATHS.cacheDb });
      const monthStats = metering.getOverviewStats("month");

      const topTools = Object.entries(monthStats.callsByTool)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tool, calls]) => ({ tool, calls }));

      videoCommerceMcp = {
        totalCallsMonth: monthStats.totalCalls,
        revenueMonth: monthStats.totalRevenue,
        uniqueAgents: monthStats.uniqueAgents,
        topTools,
      };
    } catch (err) {
      console.log(`[discover] Could not read metering data: ${err}`);
    } finally {
      metering?.close();
    }
  }

  // ── 2. Check Previous Briefs for Traction ───────────────────────────
  const previousBriefs: DiscoveryReport["previousBriefs"] = [];
  if (existsSync(PATHS.discoveryDir)) {
    const files = readdirSync(PATHS.discoveryDir)
      .filter((f) => f.endsWith(".json"))
      .sort();

    for (const file of files) {
      try {
        const content = readFileSync(resolve(PATHS.discoveryDir, file), "utf-8");
        const prev = JSON.parse(content) as DiscoveryReport;
        for (const opp of prev.opportunities) {
          // Check if 14-day window has passed
          const endDate = new Date(opp.tractionWindow.endDate);
          const now = new Date();
          let tractionResult: string | undefined;

          if (now > endDate && opp.status === "launched") {
            tractionResult = "Window expired — evaluate traction metrics";
          }

          previousBriefs.push({
            name: opp.name,
            status: opp.status,
            tractionResult,
          });
        }
      } catch {
        // Skip malformed files
      }
    }
  }

  // ── 3. Generate New Opportunities ───────────────────────────────────
  console.log(`[discover] Generating MCP opportunities...`);
  const opportunities = generateOpportunities();

  // ── 4. Market Trends ────────────────────────────────────────────────
  const marketTrends = [
    "MCP adoption accelerating — Claude, Cursor, Windsurf all support natively",
    "Agent-to-agent commerce emerging — agents buying services from other agents",
    "x402 micropayment protocol gaining traction for per-call pricing",
    "Vertical-specific MCPs outperform generic ones — domain expertise matters",
    "Content commerce (video/podcast → purchase) is underserved by current agent tools",
    "Multi-modal agents need structured data extraction — video is the biggest gap",
  ];

  // ── 5. Next Actions ────────────────────────────────────────────────
  const topOpp = opportunities[0];
  const nextActions = [
    `Evaluate top opportunity: ${topOpp?.name ?? "none"} (score: ${topOpp?.score.composite.toFixed(1) ?? "N/A"})`,
    "Review video-commerce-mcp usage patterns for signal on which verticals agents request",
    "Check MCP directories for new competitors in content commerce space",
    `14-day traction window: build MVP of ${topOpp?.name ?? "TBD"} and measure adoption`,
    "If no traction after 14 days, pivot to next opportunity on the list",
    "Publish on MCP registries: mcp.so, Smithery, npm, GitHub MCP servers list",
  ];

  // ── 6. Assemble Report ─────────────────────────────────────────────
  const report: DiscoveryReport = {
    date: today(),
    timestamp: timestamp(),
    currentMCPPerformance: { videoCommerceMcp },
    opportunities,
    previousBriefs,
    marketTrends,
    nextActions,
  };

  // ── 7. Write Report ────────────────────────────────────────────────
  mkdirSync(PATHS.discoveryDir, { recursive: true });
  const reportPath = resolve(
    PATHS.discoveryDir,
    `${new Date().toISOString().slice(0, 7)}.json`
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Also write human-readable markdown
  const mdPath = resolve(
    PATHS.discoveryDir,
    `${new Date().toISOString().slice(0, 7)}.md`
  );
  writeFileSync(mdPath, formatReportMarkdown(report));

  return report;
}

// ============================================================================
// MARKDOWN FORMATTER
// ============================================================================

function formatReportMarkdown(report: DiscoveryReport): string {
  const lines: string[] = [
    `# Discovery Report — ${report.date}`,
    "",
    "## Current MCP Performance (video-commerce-mcp)",
    "",
    `- Calls this month: ${report.currentMCPPerformance.videoCommerceMcp.totalCallsMonth}`,
    `- Revenue: $${report.currentMCPPerformance.videoCommerceMcp.revenueMonth.toFixed(2)}`,
    `- Unique agents: ${report.currentMCPPerformance.videoCommerceMcp.uniqueAgents}`,
  ];

  if (report.currentMCPPerformance.videoCommerceMcp.topTools.length > 0) {
    lines.push("", "### Top Tools");
    for (const t of report.currentMCPPerformance.videoCommerceMcp.topTools) {
      lines.push(`- ${t.tool}: ${t.calls} calls`);
    }
  }

  lines.push("", "## Market Trends", "");
  for (const trend of report.marketTrends) {
    lines.push(`- ${trend}`);
  }

  lines.push("", "## Opportunities (ranked by composite score)", "");
  for (const opp of report.opportunities) {
    lines.push(`### ${opp.name} — ${opp.tagline}`);
    lines.push("");
    lines.push(`**Score:** ${opp.score.composite.toFixed(1)} (TAM: ${opp.score.tam}, defensibility: ${opp.score.defensibility}, demand: ${opp.score.agentDemand}, complexity: ${opp.score.buildComplexity})`);
    lines.push("");
    lines.push(`**Problem:** ${opp.problem}`);
    lines.push("");
    lines.push(`**Solution:** ${opp.solution}`);
    lines.push("");
    lines.push(`**Moat:** ${opp.moat}`);
    lines.push("");
    lines.push(`**Build:** ${opp.estimatedBuildDays} days`);
    lines.push("");
    lines.push(`**14-Day Traction Window:** ${opp.tractionWindow.startDate} → ${opp.tractionWindow.endDate}`);
    lines.push(`- Success metrics: ${opp.tractionWindow.successMetrics.join(", ")}`);
    lines.push("");
    lines.push("**Promotion:**");
    lines.push(`- Strategy: ${opp.promotion.launchStrategy}`);
    lines.push("- Channels:");
    for (const ch of opp.promotion.channels) {
      lines.push(`  - [${ch.priority.toUpperCase()}] ${ch.name} (${ch.url}) — ${ch.notes}`);
    }
    lines.push("");
    lines.push("**MVP Scope:**");
    for (const item of opp.mvpScope) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  if (report.previousBriefs.length > 0) {
    lines.push("## Previous Briefs", "");
    for (const brief of report.previousBriefs) {
      lines.push(`- **${brief.name}**: ${brief.status}${brief.tractionResult ? ` — ${brief.tractionResult}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Next Actions", "");
  for (const action of report.nextActions) {
    lines.push(`- [ ] ${action}`);
  }

  return lines.join("\n");
}

// ============================================================================
// CLI ENTRYPOINT
// ============================================================================

try {
  console.log(`[discover] Starting monthly discovery — ${today()}`);
  const report = discover();

  console.log(`[discover] Current MCP: ${report.currentMCPPerformance.videoCommerceMcp.totalCallsMonth} calls, $${report.currentMCPPerformance.videoCommerceMcp.revenueMonth.toFixed(2)} revenue`);
  console.log(`[discover] Generated ${report.opportunities.length} opportunity briefs`);
  for (const opp of report.opportunities.slice(0, 3)) {
    console.log(`[discover]   ${opp.name}: score ${opp.score.composite.toFixed(1)} — ${opp.tagline}`);
  }
  console.log(`[discover] Report written to incubator/discovery/${new Date().toISOString().slice(0, 7)}.md`);
} catch (err) {
  console.error("[discover] Fatal error:", err);
  process.exit(1);
}
