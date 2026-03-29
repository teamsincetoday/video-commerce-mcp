#!/usr/bin/env node
/**
 * publish-devto.mjs — Publish the dev.to tutorial article via API.
 *
 * Usage:
 *   DEVTO_API_KEY=<your-key> node scripts/publish-devto.mjs
 *
 * Dry run (create draft without publishing publicly):
 *   DRY_RUN=1 DEVTO_API_KEY=<your-key> node scripts/publish-devto.mjs
 *
 * Get API key at: https://dev.to/settings/extensions
 * Article content: ../incubator/strategy/content/devto-tutorial.md
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEVTO_API_URL = "https://dev.to/api/articles";
const ARTICLE_TITLE =
  "Building Agent-Native Commerce Tools with MCP: From Podcast to Affiliate Link";
const ARTICLE_TAGS = ["mcp", "ai", "typescript", "cloudflare"];

function stripFrontMatter(markdown) {
  return markdown
    .replace(/^#[^\n]+\n/, "")           // remove H1 (dev.to uses title field)
    .replace(/\*\*Status:[^\n]+\n/, "")
    .replace(/\*\*Target:[^\n]+\n/, "")
    .replace(/\*\*Tags:[^\n]+\n/, "")
    .replace(/^---\n/, "")
    .trim();
}

const apiKey = process.env.DEVTO_API_KEY;
if (!apiKey) {
  console.error("Error: DEVTO_API_KEY environment variable is required.");
  console.error("Get your key at: https://dev.to/settings/extensions");
  process.exit(1);
}

const dryRun = process.env.DRY_RUN === "1";
const tutorialPath = resolve(__dirname, "../../incubator/strategy/content/devto-tutorial.md");

let rawContent;
try {
  rawContent = readFileSync(tutorialPath, "utf-8");
} catch {
  console.error(`Error: Could not read tutorial at ${tutorialPath}`);
  process.exit(1);
}

const bodyMarkdown = stripFrontMatter(rawContent);

console.log("📄 Article preview:");
console.log(`  Title:    ${ARTICLE_TITLE}`);
console.log(`  Tags:     ${ARTICLE_TAGS.join(", ")}`);
console.log(`  Length:   ${bodyMarkdown.length} chars`);
console.log(`  Mode:     ${dryRun ? "DRAFT (published=false)" : "PUBLISH (published=true)"}`);
console.log("");

const response = await fetch(DEVTO_API_URL, {
  method: "POST",
  headers: {
    "api-key": apiKey,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    article: {
      title: ARTICLE_TITLE,
      body_markdown: bodyMarkdown,
      published: !dryRun,
      tags: ARTICLE_TAGS,
      series: "MCP Incubator Build Log",
    },
  }),
});

if (!response.ok) {
  const errorText = await response.text();
  console.error(`Error ${response.status}: ${response.statusText}`);
  console.error(errorText);
  process.exit(1);
}

const article = await response.json();

console.log("✅ Success!");
console.log(`  ID:        ${article.id}`);
console.log(`  Published: ${article.published}`);
console.log(`  URL:       ${article.url}`);

if (article.published) {
  console.log("\n📣 Article is live. Start 14-day ITERATE traction window.");
  console.log("   Next: post LinkedIn Post 1 with reference to this URL.");
} else {
  console.log("\n📝 Draft created. Review at dev.to before publishing.");
  console.log("   Re-run without DRY_RUN=1 to publish.");
}
