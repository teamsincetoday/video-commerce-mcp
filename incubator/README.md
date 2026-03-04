# MCP Incubator

Autonomous loops that keep video-commerce-mcp healthy, improve it, and discover new MCP opportunities.

## Architecture: Gateway Heartbeat = Scheduler

The nanobot gateway's HEARTBEAT.md mechanism triggers incubator loops. **No OS crontab.** Each persona's heartbeat runs at the right cadence naturally:

| Loop | Heartbeat Section | Owner | Cadence |
|------|-------------------|-------|---------|
| **Operate** | `## MCP Incubator (Daily)` | Dara (site-reliability) | Every heartbeat cycle |
| **Improve** | `## MCP Incubator (Monday)` | Kai (software-developer) | Weekly on Monday |
| **Discover** | `## MCP Incubator (Monthly, 1st)` | Sable (training-lead) | 1st of each month |

### Why This Works

- The gateway already runs a 15-minute heartbeat cycle for each persona
- HEARTBEAT.md sections filter by day (`## Daily`, `## Monday`, `## Monthly (1st)`)
- This maps exactly to operate/improve/discover cadences
- One system, one scheduler, full Slack visibility — no shadow crontab

### How It Runs

1. Gateway heartbeat fires for Dara/Kai/Sable
2. Persona reads their HEARTBEAT.md, hits the MCP Incubator section
3. Persona executes the loop: runs TypeScript script, calls MCP tools, reads health files
4. Posts results to Slack if issues found; stays silent if healthy

## Manual Fallback

The TypeScript scripts remain for manual use or debugging:

```bash
# Daily health check (Dara runs this via heartbeat)
cd /home/jonathan/video-commerce-mcp && npx tsx incubator/loops/operate.ts

# Weekly improvement (Kai runs this via heartbeat)
cd /home/jonathan/video-commerce-mcp && npx tsx incubator/loops/improve.ts

# Monthly discovery (Sable runs this via heartbeat)
cd /home/jonathan/video-commerce-mcp && npx tsx incubator/loops/discover.ts
```

## Authority

- **Operate** (Dara): Auto-fixes safe issues (cache cleanup, stale data). Alerts on budget >80%.
- **Improve** (Kai): Auto-commits test coverage and bug fixes. Drafts PRs for API changes.
- **Discover** (Sable): Fully autonomous research. Jonathan approves new MCP builds.

## File Structure

```
incubator/
├── config.ts          # Shared config (budgets, thresholds, paths)
├── loops/
│   ├── operate.ts     # Daily health loop
│   ├── improve.ts     # Weekly improvement loop
│   └── discover.ts    # Monthly discovery loop
├── health/            # Daily health snapshots (YYYY-MM-DD.json)
├── discovery/         # Monthly market research reports
├── operate-log.md     # Operations log
├── improve-log.md     # Improvement changelog
└── alerts.md          # Escalations for Jonathan
```

## Persona Files

Each persona has an INCUBATOR.md in their skill directory with role-specific context:
- `~/.nanobot/.local-shadow/skills/site-reliability/INCUBATOR.md` — Dara
- `~/.nanobot/.local-shadow/skills/software-developer/INCUBATOR.md` — Kai
- `~/.nanobot/.local-shadow/skills/training-lead/INCUBATOR.md` — Sable
