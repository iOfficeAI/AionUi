# Vietnamese Stock Market Analyst

**An AI-powered data analyst for the Vietnamese equity market.** Ask a question, get validated analysis -- from simple price lookups to strategic portfolio optimization.

Built with the [AI Analyst Genome](https://aianalystlab.ai) | Powered by [AI Analyst Lab](https://aianalystlab.ai)

---

## What This Does

This is a complete AI Data Analyst that turns Claude Code into a Vietnamese stock market specialist. It can:

- **Look up prices** in real-time for ~1,700 stocks across HOSE, HNX, and UPCOM
- **Compare fundamentals** -- P/E, P/B, ROE, EPS across any set of stocks
- **Screen stocks** by multi-criteria filters (value, growth, momentum, quality)
- **Investigate patterns** -- time-series trends, sector rotations, seasonal effects
- **Validate everything** with a 4-layer quality system and confidence scores (A-F)
- **Generate presentations** -- Marp slide decks with charts, narratives, and export to PDF
- **Design backtests** with power analysis, decision rules, and risk controls
- **Build portfolios** with diversification analysis and risk metrics

All with Vietnamese market context: VND formatting, bilingual labels, ICT timezone, and awareness of local market rules (price limits, Tet holidays, reporting lag).

## Quick Start

```bash
# Open Claude Code in this directory
claude

# Just ask a question -- the system routes it automatically
"What's VCB's current price?"                          # L1: instant lookup
"Compare VCB and TCB P/E ratios"                       # L2: comparison
"Which banking stocks have ROE > 20%?"                 # L3: investigation
"Find undervalued stocks with strong momentum"         # L4: deep dive
"Build an optimal VN30 portfolio for 2026"             # L5: strategic
```

Or use slash commands:

```bash
/explore VCB                        # Quick stock overview
/screen PE < 15 AND ROE > 20%      # Multi-stock screening
/backtest "Value beats growth"      # Strategy backtest design
/portfolio VCB TCB FPT VNM HPG     # Portfolio analysis
/chart line VCB price 1y           # Direct chart generation
/forecast VCB price 6m             # Time-series projection
```

## How It Works

### Question Routing (Automatic)

Every question is classified by complexity (L0-L5) and routed to the appropriate subset of 19 agents:

| Level | Type                      | Time     | What Runs                                 |
| ----- | ------------------------- | -------- | ----------------------------------------- |
| L0    | Meta ("What can you do?") | <5s      | question-framing only                     |
| L1    | Simple lookup             | <10s     | + data-explorer (real-time)               |
| L2    | Comparison                | 10-30s   | + source-tieout, descriptive-analytics    |
| L3    | Investigation             | 30-90s   | + hypothesis, analysis agents, validation |
| L4    | Deep dive                 | 1-3 min  | Full 17-agent pipeline                    |
| L5    | Strategic                 | 3-10 min | Full pipeline + experiment-designer       |

### 17-Agent Pipeline

```
Question -> [Framing] -> [Hypothesis] -> [Data Discovery] -> [Tieout]
    -> [Analysis: descriptive / trends / cohorts] -> [Root Cause]
    -> [Validation (4 layers)] -> [Opportunity Sizing]
    -> [Story Architecture] -> [Coherence Review]
    -> [Charts] -> [Design Review]
    -> [Storytelling] -> [Deck Assembly] -> [Follow-up Tracking]
```

### 4-Layer Quality System

Every analysis passes through 4 validation layers:

1. **Data Quality** (25% weight) -- nulls, duplicates, ranges, freshness
2. **Statistical Rigor** (40% weight) -- test selection, CIs, effect sizes, Simpson's Paradox
3. **Logical Coherence** (20% weight) -- domain sanity, contradictions, causality
4. **Presentation Accuracy** (15% weight) -- chart-data match, labels, attribution

Results get a confidence score (0-100) and letter grade (A-F). Minimum C (70) to publish.

## Available Commands

### Data

| Command                | Purpose                       |
| ---------------------- | ----------------------------- |
| `/explore [symbol]`    | Quick stock overview          |
| `/screen [criteria]`   | Multi-stock screening         |
| `/data-sources`        | Browse available data sources |
| `/data-inspect`        | Show active dataset schema    |
| `/datasets`            | Data coverage information     |
| `/cache status\|clear` | Cache management              |

### Analysis

| Command                    | Purpose                        |
| -------------------------- | ------------------------------ |
| `/run-pipeline [question]` | Full analysis pipeline         |
| `/resume-pipeline`         | Resume from last step          |
| `/forecast [sym] [metric]` | Time-series projection (no ML) |
| `/backtest [hypothesis]`   | Strategy backtest design       |
| `/portfolio [symbols]`     | Portfolio analysis             |
| `/chart [type] [data]`     | Quick chart generation         |

### Quality & Output

| Command            | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `/quality`         | Confidence score breakdown               |
| `/export [format]` | Export (slides/pdf/csv/json/email)       |
| `/theme [name]`    | Presentation theme (light/dark)          |
| `/role [type]`     | Switch audience (quant/retail/trader/pm) |

### Utilities

| Command            | Purpose                          |
| ------------------ | -------------------------------- |
| `/help`            | Full command reference           |
| `/health`          | System health check              |
| `/glossary [term]` | Vietnamese market terms          |
| `/history`         | Past analyses                    |
| `/archive`         | Archive current analysis         |
| `/patterns`        | Cross-analysis pattern detection |

## Agents (19 Total)

### Pipeline Agents (17)

| #   | Agent                        | Purpose                                 |
| --- | ---------------------------- | --------------------------------------- |
| 1   | question-framing             | Classify L0-L5, build Question Ladder   |
| 3   | hypothesis                   | Generate 4-category testable hypotheses |
| 4   | data-explorer                | Find data, real-time L1 lookups         |
| 4.5 | source-tieout                | Dual-path data integrity verification   |
| 5   | descriptive-analytics        | Segmentation, funnels, effect sizes     |
| 5   | overtime-trend               | Time-series patterns, anomalies         |
| 5   | cohort-analysis              | Retention curves, vintage comparison    |
| 6   | root-cause-investigator      | 8-step iterative drill-down             |
| 7   | validation                   | 4-layer validation + confidence scoring |
| 8   | opportunity-sizer            | Business impact (base/best/worst)       |
| 9   | story-architect              | CTR narrative design                    |
| 10  | narrative-coherence-reviewer | Story flow + data consistency review    |
| 12  | chart-maker                  | Matplotlib charts with SWD patterns     |
| 13  | visual-design-critic         | Chart accuracy + brand compliance       |
| 15  | storytelling                 | Prose narrative + speaker notes         |
| 16  | deck-creator                 | Marp slide deck assembly                |
| 18  | close-the-loop               | Follow-up tracking + action items       |

### Standalone Agents (2)

| Agent               | Purpose                                          | Trigger     |
| ------------------- | ------------------------------------------------ | ----------- |
| experiment-designer | A/B test + backtest design with power analysis   | `/backtest` |
| connector-inspector | Data connector inspection and adapter generation | Setup only  |

## Data Platform

**vnstock** library (v3.4.2+) connecting to Vietnamese securities data:

| Source | Type      | Coverage                                         |
| ------ | --------- | ------------------------------------------------ |
| KBS    | Primary   | Real-time prices, OHLCV (2010+), symbol listings |
| VCI    | Secondary | Financial statements, ratios (2012+)             |
| TCBS   | Tertiary  | Financial data (cross-validation)                |

**Coverage:** ~1,700 stocks across HOSE, HNX, and UPCOM exchanges.

**Configuration files:**

- `genome_config.yaml` -- Project settings, brand tokens, audience
- `data_sources.yaml` -- Connection details, cache TTL, quality thresholds

## Project Structure

```
workspace/
  CLAUDE.md                    # AI persona (<=350 lines, 10 sections)
  genome_config.yaml           # Setup configuration
  data_sources.yaml            # Data source connections

  agents/                      # 19 agent specifications
    registry.yaml              # Machine-readable DAG
    *.md                       # Agent specs with CONTRACT blocks

  .claude/skills/              # 37+ skills (slash commands + auto-apply)
    help/, explore/, screen/   # User-facing commands
    quality/, health/          # System inspection
    ...

  helpers/                     # Python modules
    vnstock_helpers.py         # vnstock API wrapper
    data_helpers.py            # DataFrame profiling
    stats_helpers.py           # Statistical tests
    chart_helpers.py           # Matplotlib + SWD patterns
    cache_helpers.py           # Query cache
    error_helpers.py           # User-friendly errors

  templates/                   # Marp slide templates
  themes/                      # Presentation CSS themes
  .knowledge/                  # Persistent data brain
  _working/                    # Intermediate analysis artifacts
  outputs/                     # Final deliverables (decks, charts, briefs)
```

## Vietnamese Market Awareness

This analyst understands Vietnamese market specifics:

- **Price limits:** +/-7% daily on HOSE/HNX, +/-15% on UPCOM
- **Trading hours:** 9:00-15:00 ICT (UTC+7), lunch break 11:30-13:00
- **Settlement:** T+2
- **Reporting lag:** Financial statements delayed 30-45 days from quarter end
- **Tet holiday:** 5-7 trading days closed annually
- **Currency:** VND with comma thousands separator
- **Selling tax:** 0.1% on all sell transactions
- **Bilingual labels:** Vietnamese terms alongside English throughout

## What This Does NOT Include

- No ML, regression, or predictive modeling (descriptive statistics only)
- No real-money trading execution
- No analyst consensus estimates or forward-looking targets
- No options or derivatives analysis
- No Vietnamese language input processing (English questions, bilingual output)

## Build Information

This analyst was built using the **AI Analyst Genome v1.0** -- a self-building blueprint that creates complete AI Data Analysts through a structured 4-wave build process.

- **Wave 0:** Foundation (directories, config, data connection)
- **Wave 1:** Data Pipeline (L1-L2 queries, real-time prices, Vietnamese i18n)
- **Wave 2:** Analysis Core (L3-L4 queries, 4-layer validation, confidence scoring)
- **Wave 3:** Narrative & Presentation (charts, decks, export)
- **Wave 4:** Strategic & Optimization (L5 queries, backtesting, portfolio analysis)

Build artifacts and status: `_build/BUILD_PLAN.md`, `_build/BUILD_STATUS.yaml`

---

**Powered by AI Analyst Lab | aianalystlab.ai**

Created by Shane Butler, Sravya Madipalli, and Hai Guan
