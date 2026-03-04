/**
 * Incubator Agent System
 *
 * Allows the incubator to create and manage specialized agents
 * that serve the autonomous loops. Agents are lightweight TypeScript
 * modules with a standard interface — no heavyweight persona system.
 *
 * Agents are spawned as needed by the improve and discover loops.
 * Each agent has a clear responsibility and can be iterated independently.
 *
 * From the nanobot team, we carry forward:
 * - Dara's ops patterns (monitoring, alerting, health checks)
 * - Kai's dev patterns (testing, CI, code quality)
 * - Sable's training patterns (documentation, onboarding)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { timestamp } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// TYPES
// ============================================================================

export interface AgentSpec {
  /** Unique agent identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this agent does (one sentence) */
  purpose: string;
  /** Which loop created/owns this agent */
  owner: "operate" | "improve" | "discover" | "system";
  /** Agent capabilities */
  capabilities: string[];
  /** When this agent should run */
  schedule: "on-demand" | "daily" | "weekly" | "monthly";
  /** Current status */
  status: "active" | "paused" | "deprecated";
  /** When created */
  createdAt: string;
  /** Version for tracking iterations */
  version: string;
}

export interface AgentRegistry {
  agents: AgentSpec[];
  lastUpdated: string;
}

// ============================================================================
// REGISTRY
// ============================================================================

const REGISTRY_PATH = resolve(__dirname, "agent-registry.json");

export function loadRegistry(): AgentRegistry {
  if (!existsSync(REGISTRY_PATH)) {
    return { agents: [], lastUpdated: timestamp() };
  }
  const content = readFileSync(REGISTRY_PATH, "utf-8");
  return JSON.parse(content) as AgentRegistry;
}

export function saveRegistry(registry: AgentRegistry): void {
  registry.lastUpdated = timestamp();
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

// ============================================================================
// AGENT MANAGEMENT
// ============================================================================

export function registerAgent(spec: Omit<AgentSpec, "createdAt" | "status">): AgentSpec {
  const registry = loadRegistry();
  const existing = registry.agents.find((a) => a.id === spec.id);

  const agent: AgentSpec = {
    ...spec,
    status: "active",
    createdAt: existing?.createdAt ?? timestamp(),
  };

  if (existing) {
    // Update existing agent
    const idx = registry.agents.indexOf(existing);
    registry.agents[idx] = agent;
  } else {
    registry.agents.push(agent);
  }

  saveRegistry(registry);
  return agent;
}

export function getAgent(id: string): AgentSpec | undefined {
  const registry = loadRegistry();
  return registry.agents.find((a) => a.id === id);
}

export function listActiveAgents(): AgentSpec[] {
  const registry = loadRegistry();
  return registry.agents.filter((a) => a.status === "active");
}

export function deprecateAgent(id: string): boolean {
  const registry = loadRegistry();
  const agent = registry.agents.find((a) => a.id === id);
  if (!agent) return false;
  agent.status = "deprecated";
  saveRegistry(registry);
  return true;
}

// ============================================================================
// BUILT-IN AGENTS (seeded from nanobot Dara/Kai/Sable patterns)
// ============================================================================

/**
 * Initialize the default agent roster.
 * These carry forward the best patterns from the nanobot team.
 */
export function seedDefaultAgents(): void {
  // Dara-inspired: Site Reliability
  registerAgent({
    id: "health-monitor",
    name: "Health Monitor",
    purpose: "Monitors system health, alerts on anomalies, manages cache lifecycle",
    owner: "operate",
    capabilities: [
      "cache-stats-analysis",
      "error-rate-tracking",
      "budget-monitoring",
      "slack-alerting",
    ],
    schedule: "daily",
    version: "1.0.0",
  });

  // Kai-inspired: Software Quality
  registerAgent({
    id: "quality-gate",
    name: "Quality Gate",
    purpose: "Runs tests, checks types, audits dependencies, maintains CI",
    owner: "improve",
    capabilities: [
      "typecheck",
      "test-runner",
      "dependency-audit",
      "coverage-analysis",
    ],
    schedule: "weekly",
    version: "1.0.0",
  });

  // Sable-inspired: Knowledge & Training
  registerAgent({
    id: "knowledge-builder",
    name: "Knowledge Builder",
    purpose: "Documents learnings, maintains memory, generates improvement briefs",
    owner: "improve",
    capabilities: [
      "log-analysis",
      "pattern-extraction",
      "documentation",
      "threshold-tuning",
    ],
    schedule: "weekly",
    version: "1.0.0",
  });

  // New: Market Scout
  registerAgent({
    id: "market-scout",
    name: "Market Scout",
    purpose: "Researches MCP ecosystem gaps, scores opportunities, tracks traction",
    owner: "discover",
    capabilities: [
      "ecosystem-analysis",
      "opportunity-scoring",
      "traction-tracking",
      "marketplace-monitoring",
    ],
    schedule: "monthly",
    version: "1.0.0",
  });

  // New: Promotion Agent
  registerAgent({
    id: "promoter",
    name: "Promoter",
    purpose: "Publishes MCPs to registries and communities, tracks distribution",
    owner: "discover",
    capabilities: [
      "npm-publish",
      "registry-submission",
      "community-posting",
      "download-tracking",
    ],
    schedule: "on-demand",
    version: "1.0.0",
  });
}

// ============================================================================
// CLI ENTRYPOINT
// ============================================================================

if (
  process.argv[1] &&
  (process.argv[1].endsWith("agents.ts") ||
    process.argv[1].endsWith("agents.js"))
) {
  const command = process.argv[2];

  if (command === "seed") {
    seedDefaultAgents();
    console.log("Default agents seeded.");
    const agents = listActiveAgents();
    for (const agent of agents) {
      console.log(`  [${agent.id}] ${agent.name} — ${agent.purpose}`);
    }
  } else if (command === "list") {
    const agents = listActiveAgents();
    if (agents.length === 0) {
      console.log("No active agents. Run: npx tsx incubator/agents.ts seed");
    } else {
      for (const agent of agents) {
        console.log(`  [${agent.id}] ${agent.name} (${agent.schedule}) v${agent.version}`);
        console.log(`    ${agent.purpose}`);
        console.log(`    Capabilities: ${agent.capabilities.join(", ")}`);
      }
    }
  } else {
    console.log("Usage:");
    console.log("  npx tsx incubator/agents.ts seed  — Initialize default agents");
    console.log("  npx tsx incubator/agents.ts list  — List active agents");
  }
}
