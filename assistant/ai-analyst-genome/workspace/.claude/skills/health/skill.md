# Health Skill

# System Health Check

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/health` command
- When user asks about system status or data connectivity

## Command

`/health` - Overall system health
`/health agents` - Agent status check
`/health data` - Data platform connectivity
`/health cache` - Cache status and freshness

## Purpose

Quick diagnostic of system readiness. Shows agent availability, data platform connectivity, cache status, and any known issues.

## Output

`/health`

```
System Health Check
====================
Status: OPERATIONAL
Timestamp: 2026-02-21 14:30 ICT

AGENTS (19/19 active)
  Pipeline agents:   17/17
  Standalone agents: 2/2
  Validation layers: 4/4

DATA PLATFORM
  vnstock library:  Connected (v3.4.2)
  KBS (primary):    OK (last query: 2 min ago)
  VCI (secondary):  OK (last query: 15 min ago)
  TCBS (tertiary):  OK (standby)

CACHE
  Status:     Active
  Size:       45 MB / 500 MB
  Quotes:     142 symbols cached (avg age: 23 min)
  Financials: 85 symbols cached (avg age: 4 hours)
  Hit rate:   78% (last 100 queries)

KNOWLEDGE BASE
  Active dataset: vnstock_default
  Schema:    Loaded
  Metrics:   4 registered (PE, PB, ROE, Market Cap)
  Analyses:  12 archived

KNOWN ISSUES
  None
```

## Agent Health Detail

`/health agents`

```
Agent Health
=============

Pipeline Agents:
  #  Agent                       Status   Last Used       Version
  1  question-framing            OK       14:28 ICT       1.0.0
  3  hypothesis                  OK       14:20 ICT       1.0.0
  4  data-explorer               OK       14:28 ICT       1.0.0
  4.5 source-tieout              OK       14:28 ICT       1.0.0
  5  descriptive-analytics       OK       14:22 ICT       1.0.0
  5  overtime-trend              OK       14:22 ICT       1.0.0
  5  cohort-analysis             OK       14:15 ICT       1.0.0
  6  root-cause-investigator     OK       14:20 ICT       1.0.0
  7  validation                  OK       14:25 ICT       2.0.0
  8  opportunity-sizer           OK       14:22 ICT       1.0.0
  9  story-architect             OK       14:22 ICT       1.0.0
  10 narrative-coherence-reviewer OK      14:22 ICT       1.0.0
  12 chart-maker                 OK       14:22 ICT       1.0.0
  13 visual-design-critic        OK       14:22 ICT       1.0.0
  15 storytelling                OK       14:22 ICT       1.0.0
  16 deck-creator                OK       14:22 ICT       1.0.0
  18 close-the-loop              OK       14:22 ICT       1.0.0

Standalone Agents:
  experiment-designer            OK       (on demand)     1.0.0
  connector-inspector            OK       (setup only)    1.0.0
```

## Rules

1. **Quick** - Return results in <2 seconds (no API calls)
2. **Honest** - Show real issues, do not mask errors
3. **Actionable** - Suggest fixes for any issues found

---

**Powered by AI Analyst Lab | aianalystlab.ai**
