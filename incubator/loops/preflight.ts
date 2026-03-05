/**
 * Pre-flight Gate — checks preconditions before any loop runs
 *
 * Import and call preflight() at the start of operate/improve/discover.
 * Returns { ok: true } or { ok: false, reason: string }.
 *
 * Checks:
 * 1. SQLite database accessible
 * 2. Node.js version compatible
 * 3. Required files exist
 * 4. Disk space adequate
 * 5. No emergency stop active
 */

import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { PATHS } from "../config.js";
import { createBudgetManager } from "../../src/ai/api-budget-manager.js";

export interface PreflightResult {
  ok: boolean;
  reason?: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

export function preflight(): PreflightResult {
  const checks: PreflightResult["checks"] = [];

  // 1. SQLite database exists and is readable
  try {
    if (existsSync(PATHS.cacheDb)) {
      const stat = statSync(PATHS.cacheDb);
      checks.push({
        name: "sqlite_accessible",
        passed: stat.size > 0,
        detail: `${(stat.size / 1024).toFixed(0)} KB`,
      });
    } else {
      // DB doesn't exist yet — that's OK for first run
      checks.push({
        name: "sqlite_accessible",
        passed: true,
        detail: "Not yet created (first run)",
      });
    }
  } catch (err) {
    checks.push({
      name: "sqlite_accessible",
      passed: false,
      detail: String(err),
    });
  }

  // 2. Node.js version (need >=18 for ES2022)
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split(".")[0]!, 10);
    checks.push({
      name: "node_version",
      passed: major >= 18,
      detail: version,
    });
  } catch {
    checks.push({ name: "node_version", passed: false, detail: "Cannot determine" });
  }

  // 3. Required directories exist
  const requiredDirs = [PATHS.healthDir, PATHS.discoveryDir];
  for (const dir of requiredDirs) {
    checks.push({
      name: `dir_exists:${dir.split("/").pop()}`,
      passed: existsSync(dir),
      detail: dir,
    });
  }

  // 4. Disk space (warn if <100MB free in data directory)
  try {
    const dfOutput = execSync(`df -k "${PATHS.root}" 2>&1`, { encoding: "utf-8" });
    const lines = dfOutput.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1]!.split(/\s+/);
      const availKB = parseInt(parts[3] ?? "0", 10);
      const availMB = availKB / 1024;
      checks.push({
        name: "disk_space",
        passed: availMB > 100,
        detail: `${availMB.toFixed(0)} MB available`,
      });
    }
  } catch {
    // df not available — skip check
    checks.push({ name: "disk_space", passed: true, detail: "Check skipped" });
  }

  // 5. No emergency budget stop
  try {
    const budget = createBudgetManager();
    const emergency = budget.shouldEmergencyStop();
    checks.push({
      name: "budget_ok",
      passed: !emergency.stop,
      detail: emergency.stop ? `EMERGENCY: ${emergency.reason}` : "Within limits",
    });
  } catch {
    // Budget manager unavailable — not a blocker
    checks.push({ name: "budget_ok", passed: true, detail: "Manager unavailable" });
  }

  // Determine overall result
  const failed = checks.filter((c) => !c.passed);
  if (failed.length === 0) {
    return { ok: true, checks };
  }

  return {
    ok: false,
    reason: `Pre-flight failed: ${failed.map((c) => `${c.name} (${c.detail})`).join(", ")}`,
    checks,
  };
}

// CLI entrypoint
if (
  process.argv[1] &&
  (process.argv[1].endsWith("preflight.ts") || process.argv[1].endsWith("preflight.js"))
) {
  const result = preflight();
  console.log(`[preflight] ${result.ok ? "ALL CHECKS PASSED" : "FAILED"}`);
  for (const check of result.checks) {
    console.log(`  ${check.passed ? "✓" : "✗"} ${check.name}: ${check.detail ?? ""}`);
  }
  if (!result.ok) {
    console.log(`[preflight] ${result.reason}`);
    process.exit(1);
  }
}
