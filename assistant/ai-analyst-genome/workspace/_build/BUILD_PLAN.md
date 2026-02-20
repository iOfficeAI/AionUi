# BUILD PLAN — Vietnamese Stock Market Analyst

**Project:** Vietnamese Stock Market Analyst
**Genome Version:** 1.0
**Capability Tier:** Full (19 agents)
**Data Platform:** vnstock (KBS/VCI/TCBS)
**Generated:** 2026-02-21
**Status:** CANONICAL (Phase 0 Complete)
**Revision:** Updated after Phase 0 Round 4 validation (2026-02-21)

---

## Project Overview

**Purpose:** AI-powered data analyst specializing in Vietnamese stock market analysis, from simple price lookups to strategic portfolio optimization.

**Primary Audience:** Vietnamese stock market participants

- Quant researchers (factor analysis, backtesting)
- Retail investors (fundamental analysis, stock picking)
- Traders (technical signals, momentum strategies)
- Portfolio managers (risk management, diversification)

**Key Capabilities:**

- Question-driven analysis (L1 simple lookups → L5 strategic optimization)
- 4-layer validation system (data quality, statistical rigor, logical coherence, presentation accuracy)
- Real-time price data + historical financials (2010-present, 1,700+ stocks)
- Vietnamese market context (VND formatting, bilingual labels, local conventions)
- Confidence scoring (0-100 scale, A-F grades) on all outputs
- Full pipeline automation (17-step agent pipeline)

**Note on Pipeline Design:** The original AI Analyst Genome specifies an 18-step pipeline, but this implementation optimizes to 17 steps by integrating:

- Metric specification (now a skill, not a separate agent)
- Statistical audit (Layer 2 of validation agent, executed at multiple checkpoints)
- Final validation (Layer 4 of validation agent)
- Quality certification (validation agent's final output)

The validation agent runs at 3 checkpoints (after data collection, after analysis, after presentation) to provide comprehensive quality assurance.

---

## 1. DIRECTORY STRUCTURE (RESOLVED)

```
workspace/
├── CLAUDE.md                              # AI Data Analyst persona (≤350 lines)
├── genome_config.yaml                     # Setup wizard output (EXISTS)
├── data_sources.yaml                      # Connection registry for vnstock
├── README.md                              # Product documentation
│
├── agents/                                # Agent specifications (19 agents)
│   ├── registry.yaml                      # Machine-readable DAG
│   │
│   ├── question-framing.md                # Pipeline Step 1: Question Ladder
│   ├── hypothesis.md                      # Pipeline Step 3: Hypothesis generation
│   ├── data-explorer.md                   # Pipeline Step 4: Dataset discovery + real-time L1
│   ├── source-tieout.md                   # Pipeline Step 4.5: Data integrity check
│   ├── descriptive-analytics.md           # Pipeline Step 5: Segmentation, funnels
│   ├── overtime-trend.md                  # Pipeline Step 5: Time-series analysis
│   ├── cohort-analysis.md                 # Pipeline Step 5: Retention curves
│   ├── root-cause-investigator.md         # Pipeline Step 6: Iterative drill-down
│   ├── validation.md                      # Pipeline Step 7: 4-layer validation
│   ├── opportunity-sizer.md               # Pipeline Step 8: Business impact
│   ├── story-architect.md                 # Pipeline Step 9: Narrative design
│   ├── narrative-coherence-reviewer.md    # Pipeline Step 10: Story flow review
│   ├── chart-maker.md                     # Pipeline Step 12: Visualizations
│   ├── visual-design-critic.md            # Pipeline Step 13: Chart review
│   ├── storytelling.md                    # Pipeline Step 15: Prose narrative
│   ├── deck-creator.md                    # Pipeline Step 16: Marp slide assembly
│   ├── close-the-loop.md                  # Pipeline Step 18: Follow-up tracking
│   │
│   ├── experiment-designer.md             # Standalone: A/B test design
│   └── connector-inspector.md             # Standalone: Inspect existing connectors
│
├── .claude/                               # Claude Code skill discovery path
│   └── skills/                            # (NON-NEGOTIABLE path)
│       │
│       ├── data-sources/                  # Data Platform Skills (merged /data + /datasets)
│       │   ├── skill.md                   # Browse datasets, check coverage, view sources
│       │   └── vnstock_adapter.py         # Adapter for ConnectionManager interface
│       │
│       ├── vnstock-data/                  # vnstock integration
│       │   ├── skill.md                   # Connect to vnstock API
│       │   └── vnstock_lib.py             # Copied from /Users/minh/Documents/AionUi/assistant/vnstock/workspace/.claude/skills/vnstock-data/
│       │
│       ├── connect-data/skill.md          # Add new dataset connection
│       ├── switch-dataset/skill.md        # Change active dataset
│       ├── data-inspect/skill.md          # Show active schema
│       ├── data-profiling/skill.md        # Deep-profile schema
│       ├── knowledge-bootstrap/skill.md   # Load dataset context at session start
│       ├── data-quality-check/skill.md    # Pre-analysis data quality scan
│       ├── cache/                         # Cache management (NEW)
│       │   └── skill.md                   # /cache status, clear, refresh
│       │
│       ├── question-framing/skill.md      # Analytical Guardrails
│       ├── metric-spec/skill.md           # Metric specification template
│       ├── tracking-gaps/skill.md         # Identify missing data
│       ├── triangulation/skill.md         # Cross-validate findings
│       ├── guardrails/skill.md            # Check for trade-offs
│       ├── simpsons-paradox/skill.md      # Segment-first aggregation check
│       ├── analysis-design-spec/skill.md  # Confirm analysis scope
│       ├── close-the-loop/skill.md        # Ensure follow-up tracking
│       │
│       ├── run-pipeline/skill.md          # Pipeline/UX Skills
│       ├── resume-pipeline/skill.md       # Resume from last step
│       ├── question-router/skill.md       # Classify L0-L5 complexity
│       ├── first-run-welcome/skill.md     # Onboarding + AI Analyst Lab intro
│       ├── explore/skill.md               # Quick interactive exploration
│       ├── export/skill.md                # Export as slides/email/brief
│       ├── forecast/skill.md              # Time-series projection
│       ├── history/skill.md               # View past analyses
│       ├── patterns/skill.md              # Cross-analysis pattern detection
│       ├── semantic-validation/skill.md   # Semantic cross-checks
│       ├── archive-analysis/skill.md      # Archive results to .knowledge/
│       │
│       ├── visualization-patterns/skill.md # Presentation Skills
│       ├── presentation-themes/skill.md    # Theme selection
│       ├── stakeholder-communication/skill.md # Audience-adapted communication
│       │
│       ├── quality/                       # Quality Skills (NEW)
│       │   └── skill.md                   # /quality breakdown, validation history
│       ├── health/                        # System Health (NEW)
│       │   └── skill.md                   # /health agents, data platform, cache
│       ├── role/                          # User Role Switch (NEW)
│       │   └── skill.md                   # /role quant|retail|trader|pm
│       ├── glossary/                      # Vietnamese Market Glossary (NEW)
│       │   └── skill.md                   # /glossary HOSE, VN30, P/E, etc.
│       └── locale-adapter/                # Locale Adaptation (EXTENDED)
│           └── skill.md                   # VND formatting, bilingual labels, ICT timezone
│
├── helpers/                               # Python modules (NO agents, NO skills)
│   ├── chart_helpers.py                   # Matplotlib wrappers + SWD patterns
│   ├── sql_helpers.py                     # SQL generation (MINIMAL STUB for future)
│   ├── data_helpers.py                    # DataFrame profiling + vnstock access
│   ├── stats_helpers.py                   # Statistical tests (no ML/regression)
│   ├── cache_helpers.py                   # Query cache + fallback
│   ├── error_helpers.py                   # User-friendly errors
│   ├── vnstock_helpers.py                 # vnstock-specific utilities
│   └── analytics_chart_style.mplstyle     # Matplotlib style file
│
├── templates/                             # Presentation templates
│   ├── deck_skeleton.marp.md              # Marp slide skeleton
│   └── marp_components.md                 # HTML snippet library
│
├── themes/                                # Marp CSS themes
│   ├── analytics.css                      # Light theme
│   └── analytics-dark.css                 # Dark theme
│
├── .knowledge/                            # Data Brain (persistent context)
│   ├── active.yaml                        # Points to current dataset
│   ├── datasets/                          # Per-dataset metadata
│   │   └── vnstock_default/               # Default vnstock dataset
│   │       ├── manifest.yaml              # Connection, summary stats
│   │       ├── schema.md                  # Table/column documentation
│   │       ├── quirks.md                  # Known data gotchas
│   │       ├── last_profile.md            # Deep profiling results
│   │       ├── access_notes.md            # API limits, rate limits
│   │       └── metrics/                   # Registered metric definitions
│   │           ├── pe_ratio.yaml
│   │           ├── pb_ratio.yaml
│   │           ├── roe.yaml
│   │           └── market_cap.yaml
│   ├── analyses/                          # Archived analysis results
│   ├── validation/                        # Validation reports (NEW)
│   │   ├── confidence_history.yaml        # Historical confidence scores
│   │   ├── review_loops.yaml              # Review loop outcomes
│   │   └── quality_flags.yaml             # Data quality issues log
│   ├── user/                              # User profile
│   │   ├── profile.yaml                   # Detected user role, preferences
│   │   ├── query_log.yaml                 # Query history for audit trail
│   │   └── error_log.yaml                 # Degradation events
│   └── global/                            # Global frameworks
│       └── frameworks.md                  # Analytical framework reference
│
├── data/                                  # Local data (CSV/Parquet fallback)
│   ├── cache/                             # Cached vnstock API responses
│   │   ├── quotes/                        # OHLCV price data
│   │   ├── financials/                    # Financial statements
│   │   └── ratios/                        # Financial ratios
│   └── static/                            # Static file fallback
│       ├── vn30_constituents.csv
│       └── exchange_listings.csv
│
├── _working/                              # Intermediate artifacts (RENAMED from working/)
│   ├── question_brief.md
│   ├── hypothesis_doc.md
│   ├── data_inventory.md
│   ├── tieout_report.md
│   ├── analysis_report.md
│   ├── trend_report.md
│   ├── cohort_report.md
│   ├── investigation.md
│   ├── validation_report.md
│   ├── sizing_report.md
│   ├── storyboard.md
│   ├── coherence_review.md
│   ├── design_review.md
│   ├── narrative.md
│   ├── close_the_loop.md
│   ├── confidence_scores.yaml             # Per-artifact confidence scores (NEW)
│   └── charts/                            # Generated chart images
│
├── outputs/                               # Final deliverables
│   ├── quick_answers/                     # L1/L2 simple query results (NEW)
│   ├── deck.marp.md                       # Final presentation
│   ├── deck.pdf                           # Exported PDF
│   ├── analysis_summary.md                # Executive summary
│   └── experiment_brief.md                # A/B test design (if applicable)
│
└── _build/                                # Build system artifacts
    ├── BUILD_PLAN.md                      # This document
    ├── BUILD_STATUS.yaml                  # Task tracking
    ├── DECISION_LOG.md                    # Conflict resolutions
    ├── QUALITY_LOG.md                     # Validation events (NEW)
    ├── SETUP_CONTEXT.yaml                 # Setup wizard context
    ├── integration_review.md              # Integration validation report
    └── working/                           # Phase 0 debate artifacts
        ├── phase0_product_architect.md
        ├── phase0_quality_designer.md
        ├── phase0_devex_designer.md
        ├── phase0_product_architect_review.md
        ├── phase0_quality_designer_review.md
        ├── phase0_devex_designer_review.md
        └── phase0_conflicts.md
```

**Key Changes from Original Proposals:**

- `working/` → `_working/` (hide intermediate artifacts)
- Added `helpers/sql_helpers.py` (minimal stub for future SQL warehouses)
- Added `.knowledge/validation/` (quality reports)
- Added `outputs/quick_answers/` (L1/L2 results)
- Added 7 new skills: `/cache`, `/quality`, `/health`, `/role`, `/glossary` + extended `locale-adapter`
- Merged `/data` + `/datasets` into `/data-sources` skill

---

## 2. WAVE MODEL (Task Sequencing)

### Wave 0: Foundation (Setup + Infrastructure)

**Duration:** 1-2 days
**Purpose:** Establish project skeleton, data connections, validation framework

**Deliverables:**

- Directory structure created
- genome_config.yaml populated (from setup wizard)
- vnstock connection validated
- Quality system scaffolding (validation rules, confidence scoring)
- Basic skills functional (/help, /data-sources, /health)

### Wave 1: Data Pipeline (L1-L2 Queries)

**Duration:** 2-3 days
**Purpose:** Enable simple lookups and comparisons

**Agents Implemented:**

- question-framing (L0-L2 routing)
- data-explorer (with real-time L1 support)
- source-tieout (data integrity)

**Skills Implemented:**

- question-router (L0-L2 classification)
- data-quality-check
- locale-adapter (Vietnamese i18n)
- cache (management)

**Deliverables:**

- L1 queries working ("What's VNM's price?")
- L2 queries working ("Compare VNM and FPT P/E ratios")
- Real-time price display (<5min staleness)
- Confidence scoring (Layer 1: Data Quality)

### Wave 2: Analysis Core (L3-L4 Queries)

**Duration:** 3-4 days
**Purpose:** Enable investigations and deep dives

**Agents Implemented:**

- hypothesis
- descriptive-analytics
- overtime-trend
- cohort-analysis
- root-cause-investigator
- validation (4-layer system)

**Skills Implemented:**

- triangulation
- simpsons-paradox
- semantic-validation
- quality (breakdown display)

**Deliverables:**

- L3 investigations ("Which stocks have P/E <15 and ROE >20%?")
- L4 deep dives ("Find undervalued stocks with strong fundamentals and momentum")
- Full 4-layer validation
- Confidence scoring (Layers 1-3)

### Wave 3: Narrative & Presentation (Output Generation)

**Duration:** 2-3 days
**Purpose:** Generate user-facing deliverables

**Agents Implemented:**

- opportunity-sizer
- story-architect
- narrative-coherence-reviewer
- chart-maker
- visual-design-critic
- storytelling
- deck-creator
- close-the-loop

**Skills Implemented:**

- visualization-patterns
- presentation-themes
- stakeholder-communication
- export

**Deliverables:**

- Marp slide decks (outputs/deck.marp.md, deck.pdf)
- Executive summaries (outputs/analysis_summary.md)
- Interactive charts (matplotlib + SWD patterns)
- Confidence scoring (Layer 4: Presentation Accuracy)

### Wave 4: Strategic & Optimization (L5 Queries)

**Duration:** 2-3 days
**Purpose:** Enable portfolio optimization and experimental design

**Agents Implemented:**

- experiment-designer (standalone)

**Skills Implemented:**

- forecast
- patterns
- archive-analysis

**Deliverables:**

- L5 strategic queries ("Build optimal portfolio for 2026")
- Backtesting support (via experiment-designer)
- Sensitivity analysis
- Portfolio recommendations

---

## 3. TASK REGISTRY (All 109 Tasks)

### WAVE 0: Foundation (15 tasks)

| ID    | Task                                                 | File                                            | Type   | Depends On | Acceptance Criteria                                                                                                                    | Scope |
| ----- | ---------------------------------------------------- | ----------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| W0.0  | Copy vnstock_lib.py to workspace                     | .claude/skills/vnstock-data/vnstock_lib.py      | setup  | -          | File copied from /Users/minh/Documents/AionUi/assistant/vnstock/workspace/.claude/skills/vnstock-data/vnstock_lib.py, imports verified | 15m   |
| W0.1  | Create directory structure                           | /                                               | dir    | -          | All directories exist, .gitignore configured                                                                                           | 1h    |
| W0.2  | Write CLAUDE.md                                      | CLAUDE.md                                       | doc    | -          | ≤350 lines, identity + quick start + rules                                                                                             | 2h    |
| W0.3  | Write README.md                                      | README.md                                       | doc    | -          | Product overview, setup instructions, quality commitments                                                                              | 2h    |
| W0.4  | Populate genome_config.yaml                          | genome_config.yaml                              | config | -          | All fields from setup wizard (data_platform, locale, brand_tokens)                                                                     | 1h    |
| W0.5  | Create data_sources.yaml                             | data_sources.yaml                               | config | -          | vnstock connection details (KBS/VCI/TCBS sources)                                                                                      | 30m   |
| W0.6  | Create agents/registry.yaml                          | agents/registry.yaml                            | config | -          | All 19 agents listed, DAG relationships                                                                                                | 2h    |
| W0.7  | Implement helpers/error_helpers.py                   | helpers/error_helpers.py                        | code   | -          | User-friendly error messages, recovery paths                                                                                           | 3h    |
| W0.8  | Implement helpers/sql_helpers.py                     | helpers/sql_helpers.py                          | code   | -          | Minimal stub, docstring explaining future use                                                                                          | 30m   |
| W0.9  | Create .knowledge/ structure                         | .knowledge/                                     | dir    | -          | datasets/, analyses/, validation/, user/, global/ subdirs                                                                              | 30m   |
| W0.10 | Create .knowledge/datasets/vnstock_default/quirks.md | .knowledge/datasets/vnstock_default/quirks.md   | doc    | -          | Document known data quirks (45-day lag, source variance, etc.)                                                                         | 1h    |
| W0.11 | Implement .claude/skills/health/skill.md             | .claude/skills/health/skill.md                  | skill  | -          | /health command shows agents, data platform, cache status                                                                              | 2h    |
| W0.12 | Implement .claude/skills/glossary/skill.md           | .claude/skills/glossary/skill.md                | skill  | -          | /glossary [term] shows Vietnamese market definitions                                                                                   | 2h    |
| W0.13 | Create \_build/QUALITY_LOG.md                        | \_build/QUALITY_LOG.md                          | doc    | -          | Template for validation events                                                                                                         | 30m   |
| W0.14 | Create themes/ (Marp CSS)                            | themes/analytics.css, themes/analytics-dark.css | code   | -          | Light + dark themes for Marp slides                                                                                                    | 2h    |

**Wave 0 Total:** 15 tasks, ~20.25 hours

---

### WAVE 1: Data Pipeline (28 tasks)

| ID    | Task                                                     | File                                                | Type     | Depends On | Acceptance Criteria                                                                              | Scope |
| ----- | -------------------------------------------------------- | --------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------ | ----- |
| W1.1  | Write agents/question-framing.md                         | agents/question-framing.md                          | agent    | W0.6       | CONTRACT block, L0-L2 routing logic, outputs question_brief.md                                   | 3h    |
| W1.2  | Write agents/data-explorer.md                            | agents/data-explorer.md                             | agent    | W0.6       | CONTRACT block, real-time L1 support, outputs data_inventory.md                                  | 3h    |
| W1.3  | Write agents/source-tieout.md                            | agents/source-tieout.md                             | agent    | W0.6       | CONTRACT block, dual-path validation, outputs tieout_report.md                                   | 2h    |
| W1.4  | Implement .claude/skills/question-router/skill.md        | .claude/skills/question-router/skill.md             | skill    | W1.1       | L0-L5 classification, routing logic, time estimates                                              | 4h    |
| W1.5  | Implement .claude/skills/data-sources/skill.md           | .claude/skills/data-sources/skill.md                | skill    | W1.2       | Merge /data + /datasets, browse datasets, view sources                                           | 3h    |
| W1.6  | Implement .claude/skills/data-quality-check/skill.md     | .claude/skills/data-quality-check/skill.md          | skill    | W1.3       | Layer 1 validation, auto-fix nulls/duplicates                                                    | 4h    |
| W1.7  | Implement .claude/skills/cache/skill.md                  | .claude/skills/cache/skill.md                       | skill    | -          | /cache status, clear, refresh, inspect symbol                                                    | 3h    |
| W1.8  | Implement .claude/skills/locale-adapter/skill.md         | .claude/skills/locale-adapter/skill.md              | skill    | -          | VND formatting, bilingual labels, ICT timezone                                                   | 3h    |
| W1.9  | Implement helpers/vnstock_helpers.py                     | helpers/vnstock_helpers.py                          | code     | W1.2       | Wrapper for vnstock_lib, fetch_quote, fetch_ratios, list_symbols                                 | 4h    |
| W1.10 | Implement helpers/data_helpers.py                        | helpers/data_helpers.py                             | code     | W1.9       | DataFrame profiling, schema validation, check_nulls, check_duplicates                            | 5h    |
| W1.11 | Implement helpers/cache_helpers.py                       | helpers/cache_helpers.py                            | code     | W1.9       | cached_query, get_cached, cache invalidation, TTL logic                                          | 4h    |
| W1.12 | Create .claude/skills/vnstock-data/vnstock_adapter.py    | .claude/skills/vnstock-data/vnstock_adapter.py      | code     | W0.0, W1.9 | VnstockConnectionManager, query() method, ConnectionManager interface, imports from .vnstock_lib | 5h    |
| W1.13 | Implement .claude/skills/first-run-welcome/skill.md      | .claude/skills/first-run-welcome/skill.md           | skill    | W1.8       | Bilingual onboarding, AI Analyst Lab attribution, role setup                                     | 3h    |
| W1.14 | Create templates/deck_skeleton.marp.md                   | templates/deck_skeleton.marp.md                     | template | W0.14      | Marp slide template with brand tokens                                                            | 2h    |
| W1.15 | Create templates/marp_components.md                      | templates/marp_components.md                        | template | W0.14      | HTML snippet library for Marp                                                                    | 2h    |
| W1.16 | Implement Layer 1 validation rules                       | agents/validation.md (partial)                      | agent    | W1.6       | Null checks, duplicate checks, out-of-range, temporal consistency, schema validation             | 4h    |
| W1.17 | Implement timestamp staleness validation                 | agents/validation.md (partial)                      | agent    | W1.2       | Real-time <5min, cached prices <1h, financials <24h                                              | 2h    |
| W1.18 | Create .knowledge/datasets/vnstock_default/manifest.yaml | .knowledge/datasets/vnstock_default/manifest.yaml   | config   | W0.9       | Connection details, summary stats, last profiling date                                           | 1h    |
| W1.19 | Create .knowledge/datasets/vnstock_default/schema.md     | .knowledge/datasets/vnstock_default/schema.md       | doc      | W1.2       | Table/column documentation, data types, expected ranges                                          | 3h    |
| W1.20 | Create data/static/vn30_constituents.csv                 | data/static/vn30_constituents.csv                   | data     | -          | Static fallback for VN30 list                                                                    | 1h    |
| W1.21 | Create data/static/exchange_listings.csv                 | data/static/exchange_listings.csv                   | data     | -          | Static fallback for HOSE/HNX/UPCOM symbols                                                       | 1h    |
| W1.22 | Test L1 simple lookup                                    | -                                                   | test     | W1.1-W1.21 | "What's VNM's price?" returns real-time quote with timestamp                                     | 2h    |
| W1.23 | Test L2 comparison                                       | -                                                   | test     | W1.1-W1.21 | "Compare VNM and FPT P/E" returns table with confidence score                                    | 2h    |
| W1.24 | Test data quality auto-fixes                             | -                                                   | test     | W1.6       | Nulls forward-filled, duplicates removed, user notified                                          | 1h    |
| W1.25 | Test cache fallback                                      | -                                                   | test     | W1.11      | API failure → cache serves data with staleness warning                                           | 2h    |
| W1.26 | Test Vietnamese i18n                                     | -                                                   | test     | W1.8       | VND formatting, bilingual labels display correctly                                               | 1h    |
| W1.27 | Populate .knowledge/datasets/vnstock_default/metrics/    | .knowledge/datasets/vnstock_default/metrics/\*.yaml | config   | W1.19      | Metric definitions for pe_ratio, pb_ratio, roe, market_cap                                       | 2h    |
| W1.28 | Create .knowledge/user/profile.yaml template             | .knowledge/user/profile.yaml                        | config   | W1.13      | User role, preferences from onboarding                                                           | 1h    |

**Wave 1 Total:** 28 tasks, ~73 hours

---

### WAVE 2: Analysis Core (35 tasks)

| ID    | Task                                                   | File                                          | Type   | Depends On   | Acceptance Criteria                                                             | Scope |
| ----- | ------------------------------------------------------ | --------------------------------------------- | ------ | ------------ | ------------------------------------------------------------------------------- | ----- |
| W2.1  | Write agents/hypothesis.md                             | agents/hypothesis.md                          | agent  | W1.1         | CONTRACT block, 4 hypothesis categories, outputs hypothesis_doc.md              | 3h    |
| W2.2  | Write agents/descriptive-analytics.md                  | agents/descriptive-analytics.md               | agent  | W1.3         | CONTRACT block, segmentation, effect sizes, outputs analysis_report.md          | 4h    |
| W2.3  | Write agents/overtime-trend.md                         | agents/overtime-trend.md                      | agent  | W1.3         | CONTRACT block, time-series, anomalies, outputs trend_report.md                 | 4h    |
| W2.4  | Write agents/cohort-analysis.md                        | agents/cohort-analysis.md                     | agent  | W1.3         | CONTRACT block, cohort retention, outputs cohort_report.md                      | 4h    |
| W2.5  | Write agents/root-cause-investigator.md                | agents/root-cause-investigator.md             | agent  | W2.2         | CONTRACT block, 8-step drill-down, outputs investigation.md                     | 4h    |
| W2.6  | Write agents/validation.md (complete)                  | agents/validation.md                          | agent  | W1.16, W1.17 | CONTRACT block, 4-layer validation, confidence scoring                          | 6h    |
| W2.7  | Implement .claude/skills/triangulation/skill.md        | .claude/skills/triangulation/skill.md         | skill  | W2.2-W2.4    | Cross-validate across 2+ sources, flag >2% variance                             | 3h    |
| W2.8  | Implement .claude/skills/simpsons-paradox/skill.md     | .claude/skills/simpsons-paradox/skill.md      | skill  | W2.2         | Segment-first aggregation, detect trend reversals                               | 4h    |
| W2.9  | Implement .claude/skills/semantic-validation/skill.md  | .claude/skills/semantic-validation/skill.md   | skill  | W2.6         | Business plausibility checks, contradiction detection                           | 3h    |
| W2.10 | Implement .claude/skills/quality/skill.md              | .claude/skills/quality/skill.md               | skill  | W2.6         | /quality breakdown, 4-layer scores, validation history                          | 3h    |
| W2.11 | Implement helpers/stats_helpers.py                     | helpers/stats_helpers.py                      | code   | W2.2-W2.4    | t-test, chi-square, CIs, effect sizes, check_simpson_paradox                    | 6h    |
| W2.12 | Implement Layer 2 validation (Statistical Rigor)       | agents/validation.md (partial)                | agent  | W2.11        | Test selection, CIs, effect sizes, sample size, multiple comparisons            | 4h    |
| W2.13 | Implement Layer 3 validation (Logical Coherence)       | agents/validation.md (partial)                | agent  | W2.9         | Domain sanity, contradictions, causality overreach, missing context             | 4h    |
| W2.14 | Implement confidence scoring system                    | agents/validation.md (partial)                | agent  | W2.12, W2.13 | Formula: 25% data, 40% stats, 20% logic, 15% presentation                       | 3h    |
| W2.15 | Implement review loop protocol                         | agents/validation.md (partial)                | agent  | W2.14        | APPROVE/CHANGES/REJECT, max 2 revisions, escalation triggers                    | 3h    |
| W2.16 | Test L3 investigation                                  | -                                             | test   | W2.1-W2.15   | "Which stocks have P/E <15 and ROE >20%?" returns filtered list with confidence | 3h    |
| W2.17 | Test L4 deep dive                                      | -                                             | test   | W2.1-W2.15   | "Find undervalued stocks..." runs full pipeline, shows progress                 | 4h    |
| W2.18 | Test Simpson's Paradox detection                       | -                                             | test   | W2.8         | Inject paradox data, verify REJECT outcome                                      | 2h    |
| W2.19 | Test triangulation                                     | -                                             | test   | W2.7         | KBS vs VCI variance >2% flagged                                                 | 2h    |
| W2.20 | Test confidence scoring                                | -                                             | test   | W2.14        | Manually verify 10 analyses have correct A-F grades                             | 3h    |
| W2.21 | Test review loop (APPROVE)                             | -                                             | test   | W2.15        | Clean analysis passes in 1 iteration                                            | 1h    |
| W2.22 | Test review loop (CHANGES)                             | -                                             | test   | W2.15        | Analysis with YELLOW flags revised, max 2 cycles                                | 2h    |
| W2.23 | Test review loop (REJECT)                              | -                                             | test   | W2.15        | Analysis with RED flags rejected, escalated to user                             | 2h    |
| W2.24 | Create .knowledge/validation/confidence_history.yaml   | .knowledge/validation/confidence_history.yaml | config | W2.14        | Historical confidence scores logged                                             | 1h    |
| W2.25 | Create .knowledge/validation/review_loops.yaml         | .knowledge/validation/review_loops.yaml       | config | W2.15        | Review loop outcomes logged                                                     | 1h    |
| W2.26 | Create .knowledge/validation/quality_flags.yaml        | .knowledge/validation/quality_flags.yaml      | config | W2.13        | Data quality issues logged                                                      | 1h    |
| W2.27 | Update \_build/QUALITY_LOG.md                          | \_build/QUALITY_LOG.md                        | doc    | W2.6         | Log all validation events (Layers 1-4)                                          | 2h    |
| W2.28 | Implement CONTRACT blocks (all agents Wave 0-2)        | agents/\*.md                                  | agent  | W2.6         | All agents have CONTRACT with OUTPUT_GUARANTEES, STATISTICAL_CEILING            | 4h    |
| W2.29 | Test multi-symbol analysis (30 stocks)                 | -                                             | test   | W2.2-W2.4    | VN30 analysis with progress indicator, <3 min completion                        | 3h    |
| W2.30 | Test API rate limit handling                           | -                                             | test   | W1.11        | Exponential backoff, user prompt for cache fallback                             | 2h    |
| W2.31 | Implement .claude/skills/metric-spec/skill.md          | .claude/skills/metric-spec/skill.md           | skill  | W1.27        | Metric specification template, register custom metrics                          | 2h    |
| W2.32 | Implement .claude/skills/tracking-gaps/skill.md        | .claude/skills/tracking-gaps/skill.md         | skill  | W2.1         | Identify missing data for hypothesis testing                                    | 2h    |
| W2.33 | Implement .claude/skills/guardrails/skill.md           | .claude/skills/guardrails/skill.md            | skill  | W2.13        | Check for trade-offs, flag positive-only metrics                                | 2h    |
| W2.34 | Implement .claude/skills/analysis-design-spec/skill.md | .claude/skills/analysis-design-spec/skill.md  | skill  | W1.1         | Confirm analysis scope with user before running                                 | 2h    |
| W2.35 | Create .knowledge/global/frameworks.md                 | .knowledge/global/frameworks.md               | doc    | -            | Analytical framework reference (Question Ladder, etc.)                          | 3h    |

**Wave 2 Total:** 35 tasks, ~102 hours

---

### WAVE 3: Narrative & Presentation (25 tasks)

| ID    | Task                                                        | File                                              | Type   | Depends On  | Acceptance Criteria                                                | Scope  |
| ----- | ----------------------------------------------------------- | ------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------ | ------ | ------ | ----------------------- | --- |
| W3.1  | Write agents/opportunity-sizer.md                           | agents/opportunity-sizer.md                       | agent  | W2.6        | CONTRACT block, sensitivity analysis, outputs sizing_report.md     | 3h     |
| W3.2  | Write agents/story-architect.md                             | agents/story-architect.md                         | agent  | W3.1        | CONTRACT block, CTR structure, outputs storyboard.md               | 4h     |
| W3.3  | Write agents/narrative-coherence-reviewer.md                | agents/narrative-coherence-reviewer.md            | agent  | W3.2        | CONTRACT block, Layer 3 checks, APPROVE/CHANGES/REJECT             | 3h     |
| W3.4  | Write agents/chart-maker.md                                 | agents/chart-maker.md                             | agent  | W3.3        | CONTRACT block, matplotlib + SWD, outputs charts/\*.png            | 4h     |
| W3.5  | Write agents/visual-design-critic.md                        | agents/visual-design-critic.md                    | agent  | W3.4        | CONTRACT block, Layer 4 checks, outputs design_review.md           | 3h     |
| W3.6  | Write agents/storytelling.md                                | agents/storytelling.md                            | agent  | W3.5        | CONTRACT block, prose narrative, outputs narrative.md              | 3h     |
| W3.7  | Write agents/deck-creator.md                                | agents/deck-creator.md                            | agent  | W3.6        | CONTRACT block, Marp assembly, outputs deck.marp.md                | 4h     |
| W3.8  | Write agents/close-the-loop.md                              | agents/close-the-loop.md                          | agent  | W3.7        | CONTRACT block, action items, outputs close_the_loop.md            | 2h     |
| W3.9  | Implement .claude/skills/visualization-patterns/skill.md    | .claude/skills/visualization-patterns/skill.md    | skill  | W3.4        | SWD patterns (declutter, emphasize, annotate)                      | 3h     |
| W3.10 | Implement .claude/skills/presentation-themes/skill.md       | .claude/skills/presentation-themes/skill.md       | skill  | W3.7        | Theme selection (analytics, analytics-dark)                        | 2h     |
| W3.11 | Implement .claude/skills/stakeholder-communication/skill.md | .claude/skills/stakeholder-communication/skill.md | skill  | W3.6        | Audience adaptation (quant, retail, trader, PM)                    | 3h     |
| W3.12 | Implement .claude/skills/export/skill.md                    | .claude/skills/export/skill.md                    | skill  | W3.7        | /export csv, json, excel, png, pdf                                 | 4h     |
| W3.13 | Implement helpers/chart_helpers.py                          | helpers/chart_helpers.py                          | code   | W3.4        | swd_style, highlight_bar, VND formatter, Vietnamese date formatter | 5h     |
| W3.14 | Create helpers/analytics_chart_style.mplstyle               | helpers/analytics_chart_style.mplstyle            | config | W3.13       | Matplotlib style (SWD patterns)                                    | 2h     |
| W3.15 | Implement Layer 4 validation (Presentation Accuracy)        | agents/validation.md (complete)                   | agent  | W3.5        | Chart-data match <2%, label accuracy, attribution                  | 4h     |
| W3.16 | Test chart generation                                       | -                                                 | test   | W3.4, W3.13 | Charts match storyboard specs, SWD patterns applied                | 3h     |
| W3.17 | Test chart-data validation                                  | -                                                 | test   | W3.15       | Re-compute chart values, <2% deviation verified                    | 2h     |
| W3.18 | Test narrative coherence review                             | -                                                 | test   | W3.3        | Contradictions detected, max 2 revision cycles                     | 2h     |
| W3.19 | Test Marp deck assembly                                     | -                                                 | test   | W3.7        | deck.marp.md parseable, exports to PDF                             | 2h     |
| W3.20 | Test export formats                                         | -                                                 | test   | W3.12       | CSV, JSON, Excel, PNG, PDF all export with quality metadata        | 3h     |
| W3.21 | Test audience adaptation                                    | -                                                 | test   | W3.11       | Quant gets p-values, retail gets plain language                    | 2h     |
| W3.22 | Test AI Analyst Lab attribution                             | -                                                 | test   | W3.7        | All outputs have "Powered by AI Analyst Lab" footer                | 1h     |
| W3.23 | Create outputs/quick_answers/ directory                     | outputs/quick_answers/                            | dir    | -           | Directory for L1/L2 results                                        | 10m    |
| W3.24 | Test quick_answers storage                                  | -                                                 | test   | W3.23       | L1/L2 results saved to outputs/quick_answers/                      | 1h     |
| W3.25 | Implement .claude/skills/role/skill.md                      | .claude/skills/role/skill.md                      | skill  | W3.11       | /role quant                                                        | retail | trader | pm switches mid-session | 2h  |

**Wave 3 Total:** 25 tasks, ~70 hours

---

### WAVE 4: Strategic & Optimization (6 tasks)

| ID   | Task                                               | File                                     | Type  | Depends On | Acceptance Criteria                                          | Scope |
| ---- | -------------------------------------------------- | ---------------------------------------- | ----- | ---------- | ------------------------------------------------------------ | ----- |
| W4.1 | Write agents/experiment-designer.md                | agents/experiment-designer.md            | agent | -          | CONTRACT block, A/B test design, outputs experiment_brief.md | 4h    |
| W4.2 | Implement .claude/skills/forecast/skill.md         | .claude/skills/forecast/skill.md         | skill | W2.3       | Time-series projection (no ML, trend extrapolation only)     | 4h    |
| W4.3 | Implement .claude/skills/patterns/skill.md         | .claude/skills/patterns/skill.md         | skill | W3.1       | Cross-analysis pattern detection                             | 3h    |
| W4.4 | Implement .claude/skills/archive-analysis/skill.md | .claude/skills/archive-analysis/skill.md | skill | W3.7       | Archive results to .knowledge/analyses/                      | 2h    |
| W4.5 | Test L5 strategic query                            | -                                        | test  | W4.1-W4.4  | "Build optimal portfolio..." runs 6-phase pipeline, <10 min  | 4h    |
| W4.6 | Test backtesting workflow                          | -                                        | test  | W4.1       | /backtest generates experiment_brief.md with power analysis  | 3h    |

**Wave 4 Total:** 6 tasks, ~20 hours

---

## 4. TASK SUMMARY BY WAVE

| Wave                  | Tasks   | Estimated Hours | Deliverables                                                                |
| --------------------- | ------- | --------------- | --------------------------------------------------------------------------- |
| Wave 0: Foundation    | 15      | 20.25h          | Directory structure, config files, basic skills, vnstock_lib.py integration |
| Wave 1: Data Pipeline | 28      | 73h             | L1-L2 queries, real-time prices, Vietnamese i18n                            |
| Wave 2: Analysis Core | 35      | 102h            | L3-L4 queries, 4-layer validation, confidence scoring                       |
| Wave 3: Presentation  | 25      | 70h             | Charts, narratives, Marp decks, export formats                              |
| Wave 4: Strategic     | 6       | 20h             | L5 portfolio optimization, backtesting                                      |
| **TOTAL**             | **109** | **285.25h**     | Full-featured Vietnamese Stock Market Analyst                               |

**Estimated Calendar Time:** 6-8 weeks (single developer, part-time)

---

## 5. AGENT SPECIFICATIONS (Full Responsibility Map)

### Pipeline Agents (17)

| #   | Agent                        | User-Visible Name                | Inputs                                 | Outputs                                                | Time Estimate | Quality Contract                                             |
| --- | ---------------------------- | -------------------------------- | -------------------------------------- | ------------------------------------------------------ | ------------- | ------------------------------------------------------------ |
| 1   | question-framing             | "Understanding your question..." | User question, active dataset          | \_working/question_brief.md                            | <5s           | L0-L5 classification, all 4 question ladder fields populated |
| 3   | hypothesis                   | "Generating hypotheses..."       | \_working/question_brief.md            | \_working/hypothesis_doc.md                            | 5-10s         | 4 hypothesis categories, testability scores                  |
| 4   | data-explorer                | "Finding relevant data..."       | \_working/question_brief.md            | \_working/data_inventory.md                            | 5-15s         | Real-time <5min (L1), symbol coverage verified               |
| 4.5 | source-tieout                | "Verifying data integrity..."    | \_working/data_inventory.md            | \_working/tieout_report.md                             | 5-10s         | Dual-path validation, status='PASS' required                 |
| 5   | descriptive-analytics        | "Analyzing patterns..."          | Dataset, question_brief, tieout_report | \_working/analysis_report.md, charts/                  | 15-30s        | 95% CIs, effect sizes, Simpson's check                       |
| 5   | overtime-trend               | "Analyzing trends..."            | Dataset, time column, question_brief   | \_working/trend_report.md, charts/                     | 15-30s        | Anomaly detection, seasonality checks                        |
| 5   | cohort-analysis              | "Analyzing cohorts..."           | Dataset, cohort dimension              | \_working/cohort_report.md, charts/                    | 15-30s        | Retention curves, relative performance                       |
| 6   | root-cause-investigator      | "Investigating root causes..."   | Metric, observation, dataset           | \_working/investigation.md                             | 20-40s        | 8-step drill-down, impact quantified                         |
| 7   | validation                   | "Checking quality..."            | All \_working/\*.md files              | \_working/validation_report.md, confidence_scores.yaml | 10-20s        | 4-layer validation, confidence ≥70 (C)                       |
| 8   | opportunity-sizer            | "Quantifying impact..."          | Opportunity, results                   | \_working/sizing_report.md                             | 10-20s        | Base/best/worst scenarios, sensitivity analysis              |
| 9   | story-architect              | "Crafting narrative..."          | All results, audience                  | \_working/storyboard.md                                | 20-40s        | CTR structure, slide-by-slide plan                           |
| 10  | narrative-coherence-reviewer | "Reviewing narrative..."         | \_working/storyboard.md                | \_working/coherence_review.md                          | 10-15s        | Layer 3 checks, APPROVE/CHANGES/REJECT                       |
| 12  | chart-maker                  | "Generating charts..."           | Data, storyboard, theme                | \_working/charts/\*.png                                | 10-15s        | SWD patterns, brand tokens, attribution                      |
| 13  | visual-design-critic         | "Reviewing charts..."            | \_working/charts/\*.png                | \_working/design_review.md                             | 5-10s         | Layer 4 checks, <2% chart-data deviation                     |
| 15  | storytelling                 | "Writing narrative..."           | Results, storyboard, audience          | \_working/narrative.md                                 | 15-25s        | Prose narrative, slide speaker notes                         |
| 16  | deck-creator                 | "Building presentation..."       | narrative.md, charts/, theme           | outputs/deck.marp.md                                   | 10-15s        | Marp syntax valid, AI Analyst Lab attribution                |
| 18  | close-the-loop               | "Tracking follow-ups..."         | Results, recommendations               | \_working/close_the_loop.md                            | 5-10s         | Action items with owners, tracking metrics                   |

**Total Pipeline Time:** L1: <10s, L2: 10-30s, L3: 30-90s, L4: 1-3min, L5: 3-10min

### Standalone Agents (2)

| Agent               | User-Visible Name         | Inputs                               | Outputs                     | Time Estimate | Quality Contract                              |
| ------------------- | ------------------------- | ------------------------------------ | --------------------------- | ------------- | --------------------------------------------- |
| experiment-designer | "Designing experiment..." | Hypothesis (causal), metric, dataset | outputs/experiment_brief.md | 30-60s        | Power analysis, sample size, success criteria |
| connector-inspector | (Setup only)              | Connector path (vnstock_lib.py)      | helpers/vnstock_adapter.py  | N/A           | ConnectionManager interface validated         |

---

## 6. QUALITY SYSTEM SPECIFICATION

### 4-Layer Validation

**Layer 1: Data Quality (PRE-ANALYSIS)**

- Null/missing values (>5% flagged)
- Duplicates (auto-remove exact duplicates)
- Out-of-range (price >0, volume ≥0, date ≤today)
- Temporal consistency (gaps >30 days flagged)
- Schema validation (expected columns, data types)
- **Vietnamese-specific:** ±7% price limit checks, financial lag warnings

**Layer 2: Statistical Rigor (DURING ANALYSIS)**

- Appropriate test selection (t-test, chi-square)
- Confidence intervals (95% required)
- Effect sizes (Cohen's d, Cramér's V)
- Sample size (n≥30 per group for t-test)
- Multiple comparisons (>3 tests flagged)
- **Simpson's Paradox check (MANDATORY)**

**Layer 3: Logical Coherence (POST-ANALYSIS)**

- Domain sanity (P/E 5-30 typical for Vietnamese stocks)
- Contradiction detection (e.g., "undervalued" + "negative cash flow")
- Causality overreach (flag "X caused Y", allow "X correlates with Y")
- Missing context (macro events, market cap distribution)
- Confidence alignment (p=0.04 → confidence capped at B)

**Layer 4: Presentation Accuracy (PRE-OUTPUT)**

- Chart-data match (<2% deviation required, >5% = RED flag)
- Label accuracy (symbols, date ranges, legend)
- Significant figures (prices: 2 decimals, volume: 0, %: 1)
- Color coding (green=up, red=down for Vietnamese culture)
- Attribution ("Powered by AI Analyst Lab | aianalystlab.ai")

### Confidence Scoring Formula (REVISED)

```
Confidence =
  0.25 × Data_Quality_Score +
  0.40 × Statistical_Rigor_Score +
  0.20 × Logical_Coherence_Score +
  0.15 × Presentation_Accuracy_Score
```

**Letter Grades:**

- **A (90-100):** High confidence, publication-ready
- **B (80-89):** Good, minor caveats
- **C (70-79):** Acceptable, notable limitations
- **D (60-69):** Weak, use with caution
- **F (0-59):** Unreliable, do not use

**Presentation Thresholds (NEW):**

- Chart mismatch >2%: YELLOW flag, confidence capped at 89 (B)
- Chart mismatch >5%: RED flag, confidence capped at 69 (D), auto-escalate

### Review Loop Protocol

**Outcomes:**

1. **APPROVE:** All layers pass (or YELLOW flags only), confidence ≥80 (B)
2. **APPROVE WITH CHANGES:** 1-2 RED flags in Layers 1-3, confidence 70-79 (C), max 2 revisions
3. **REJECT:** 3+ RED flags OR Layer 4 RED flag, confidence <70 (D/F), escalate to user

**Escalation Triggers:**

- 2 "Approve with Changes" cycles exhausted
- 1 "Reject" + rework still fails
- Simpson's Paradox unresolvable
- Data corruption (Layer 1 score <50)

---

## 7. VIETNAMESE MARKET SPECIALIZATIONS

### Data Quality Rules (Layer 1)

| Check              | Condition                      | Action | User Message                                                                |
| ------------------ | ------------------------------ | ------ | --------------------------------------------------------------------------- |
| Financial lag      | Data <30 days old              | WARN   | "⚠️ Vietnamese financials often delayed 30-45 days, data may be incomplete" |
| Source variance    | KBS vs VCI >2%                 | FLAG   | "ℹ️ Data sources differ by X%, using KBS as primary"                        |
| Price limit breach | ±7% HOSE/HNX, ±15% UPCOM       | INFO   | "ℹ️ Stock hit daily price limit (±7% max), may continue tomorrow"           |
| Delisted stock     | Symbol not in current listings | INFO   | "ℹ️ Stock was delisted on [date], using historical data"                    |
| Volume spike       | >10x average                   | FLAG   | "⚠️ Volume spike detected (10x average), verify if anomaly or event-driven" |

### Locale Adapter (Basic Vietnamese i18n)

**Implemented:**

- Currency: 82,500 VND (thousands separator: comma)
- Numbers: Decimal separator: dot, thousands: comma
- Dates: ISO + ICT timezone (2026-02-21 14:35 ICT)
- Bilingual labels:
  - "VN30 (Rổ chỉ số 30 cổ phiếu)"
  - "HOSE (Sở Giao dịch Chứng khoán TP.HCM)"
  - "P/E (Hệ số giá trên thu nhập)"
  - "ROE (Tỷ suất sinh lời trên vốn chủ sở hữu)"
- Greetings: "Xin chào! Welcome to your Vietnamese Stock Market Analyst."

**Deferred to Phase 2:**

- Full narrative translation (analysis reports in Vietnamese)
- Vietnamese language input (user types questions in Vietnamese)
- Translation validation

---

## 8. SKILL CATALOG (37 Total Skills)

### Data Platform Skills (8)

| Skill               | Command         | Purpose                                         | Auto-Apply             |
| ------------------- | --------------- | ----------------------------------------------- | ---------------------- |
| data-sources        | /data-sources   | Browse datasets, check coverage, switch sources | No                     |
| vnstock-data        | (internal)      | Connect to vnstock API (KBS/VCI/TCBS)           | Yes                    |
| connect-data        | /connect-data   | Add new dataset connection                      | No                     |
| switch-dataset      | /switch-dataset | Change active dataset                           | No                     |
| data-inspect        | /data-inspect   | Show active schema                              | No                     |
| data-profiling      | (internal)      | Deep-profile schema                             | Yes (first connection) |
| knowledge-bootstrap | (internal)      | Load dataset context at session start           | Yes (startup)          |
| data-quality-check  | (internal)      | Pre-analysis data quality scan                  | Yes (every query)      |

### Cache Management (1)

| Skill | Command | Purpose                                        | Auto-Apply |
| ----- | ------- | ---------------------------------------------- | ---------- |
| cache | /cache  | Manage cache (status, clear, refresh, inspect) | No         |

### Analytical Guardrails (8)

| Skill                | Command      | Purpose                                          | Auto-Apply             |
| -------------------- | ------------ | ------------------------------------------------ | ---------------------- |
| question-framing     | (internal)   | L0-L5 classification, question ladder            | Yes (all queries)      |
| metric-spec          | /metric-spec | Metric specification template                    | No                     |
| tracking-gaps        | (internal)   | Identify missing data for hypotheses             | Yes (L3-L5)            |
| triangulation        | (internal)   | Cross-validate findings (2+ sources)             | Yes (L3-L5)            |
| guardrails           | (internal)   | Check for trade-offs, flag positive-only metrics | Yes (all analyses)     |
| simpsons-paradox     | (internal)   | Segment-first aggregation check                  | Yes (all aggregations) |
| analysis-design-spec | (internal)   | Confirm analysis scope with user                 | Yes (L4-L5)            |
| close-the-loop       | (internal)   | Ensure follow-up tracking                        | Yes (final output)     |

### Pipeline/UX Skills (11)

| Skill               | Command          | Purpose                                 | Auto-Apply        |
| ------------------- | ---------------- | --------------------------------------- | ----------------- |
| run-pipeline        | /run-pipeline    | Execute full analysis pipeline          | No                |
| resume-pipeline     | /resume-pipeline | Resume from last step                   | No                |
| question-router     | (internal)       | Classify L0-L5 complexity               | Yes (all queries) |
| first-run-welcome   | (internal)       | Onboarding + AI Analyst Lab intro       | Yes (first run)   |
| explore             | /explore         | Quick interactive exploration           | No                |
| export              | /export          | Export as CSV/JSON/Excel/PNG/PDF        | No                |
| forecast            | /forecast        | Time-series projection (no ML)          | No                |
| history             | /history         | View past analyses                      | No                |
| patterns            | /patterns        | Cross-analysis pattern detection        | No                |
| semantic-validation | (internal)       | Semantic cross-checks                   | Yes (Layer 3)     |
| archive-analysis    | /archive         | Archive results to .knowledge/analyses/ | No                |

### Presentation Skills (3)

| Skill                     | Command    | Purpose                                       | Auto-Apply                 |
| ------------------------- | ---------- | --------------------------------------------- | -------------------------- |
| visualization-patterns    | (internal) | SWD patterns (declutter, emphasize, annotate) | Yes (chart generation)     |
| presentation-themes       | /theme     | Theme selection (analytics, analytics-dark)   | No                         |
| stakeholder-communication | (internal) | Audience adaptation (quant/retail/trader/PM)  | Yes (narrative generation) |

### Quality Skills (2)

| Skill   | Command  | Purpose                                            | Auto-Apply |
| ------- | -------- | -------------------------------------------------- | ---------- |
| quality | /quality | Show confidence breakdown, validation history      | No         |
| health  | /health  | System health check (agents, data platform, cache) | No         |

### User Preference Skills (3)

| Skill          | Command    | Purpose                                            | Auto-Apply        |
| -------------- | ---------- | -------------------------------------------------- | ----------------- |
| role           | /role      | Change user role (quant/retail/trader/PM)          | No                |
| glossary       | /glossary  | Vietnamese market glossary (HOSE, VN30, P/E, etc.) | No                |
| locale-adapter | (internal) | VND formatting, bilingual labels, ICT timezone     | Yes (all outputs) |

**Total:** 37 skills (30 original + 7 new from conflict resolution)

---

## 9. CONTRACT BLOCK SCHEMA (Extended)

**Required Fields:**

```yaml
CONTRACT:
  agent_id: 'unique_agent_name'
  version: '1.0.0'

  INPUT_REQUIREMENTS:
    - 'Clean data (Layer 1 passed)'
    - 'Valid question format'

  OUTPUT_GUARANTEES:
    - 'All statistics include 95% CI'
    - 'Effect sizes reported'
    - 'Confidence score ≥70 (C or better)'

  HANDOFF_ARTIFACTS:
    - '_working/output_file.md'
    - '_working/charts/*.png'

  STATISTICAL_CEILING:
    allowed: ['t-test', 'chi-square', 'confidence intervals', 'effect sizes']
    forbidden: ['regression', 'ANOVA', 'ML']

  DATA_PLATFORM_AGNOSTIC: true # References {{DATA_PLATFORM}} variable

  LOCALE_SUPPORT: false # Only locale-adapter has true

  FAILURE_MODE:
    - 'Returns SKIP if input requirements not met'
    - 'Flags UNCERTAIN if confidence <70'
    - "Escalates if Simpson's Paradox detected"

  DEPENDENCIES:
    - 'validation (Layer 1+2)'
    - 'review-agent (Layer 3+4)'

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
```

**Example: descriptive-analytics agent**

```yaml
CONTRACT:
  agent_id: 'descriptive-analytics'
  version: '1.0.0'

  INPUT_REQUIREMENTS:
    - 'Clean data (Layer 1 passed)'
    - '_working/question_brief.md exists with metrics field'
    - "_working/tieout_report.md status = 'PASS'"

  OUTPUT_GUARANTEES:
    - 'All statistics include 95% CI'
    - "Effect sizes reported (Cohen's d)"
    - "Simpson's Paradox check logged"
    - 'Confidence score ≥70 (C or better)'

  HANDOFF_ARTIFACTS:
    - '_working/analysis_report.md'
    - '_working/charts/*.png'

  STATISTICAL_CEILING:
    allowed: ['t-test', 'chi-square', 'confidence intervals', 'effect sizes']
    forbidden: ['regression', 'ANOVA', 'ML']

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: false

  FAILURE_MODE:
    - 'Returns SKIP if tieout_report.md fails'
    - 'Flags UNCERTAIN if confidence <70'

  DEPENDENCIES:
    - 'source-tieout (must pass)'
    - 'validation (Layer 1+2)'

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
```

---

## 10. ACCEPTANCE CRITERIA TEMPLATES

### Template A: Analysis Agent

- [ ] CONTRACT block present and valid
- [ ] Input: Clean data (Layer 1 passed)
- [ ] Output: Includes 95% CI for all estimates
- [ ] Output: Effect size reported (with interpretation)
- [ ] Simpson's Paradox check performed (logged even if negative)
- [ ] Confidence score ≥70 (C or better)
- [ ] No causality language without disclaimer
- [ ] Chart matches data (Layer 4 <2% deviation)
- [ ] Attribution footer present
- [ ] Review: Passes Layer 2 + 3 with ≤1 YELLOW flag

### Template B: Utility Agent

- [ ] CONTRACT block present (may skip statistical fields)
- [ ] Input: Valid parameters (symbol, date range)
- [ ] Output: Data schema validated (expected columns)
- [ ] Output: Null handling explicit (drop/fill/flag)
- [ ] Error handling: Returns structured error (not silent fail)
- [ ] Logging: Records fetch time, row count, source (KBS/VCI/TCBS)
- [ ] No analysis performed (just data ops)
- [ ] Review: Passes Layer 1 with 0 RED flags

### Template C: Visualization Agent

- [ ] CONTRACT block present
- [ ] Input: Pre-validated data (Layer 3 passed)
- [ ] Output: Chart uses genome_config color palette
- [ ] Output: Axis labels include units (VND, %, millions)
- [ ] Output: Legend matches series (no orphan labels)
- [ ] Color coding: Green=up/positive, Red=down/negative
- [ ] Significant figures: Price=2 decimals, Volume=0, %=1
- [ ] Attribution: Footer with "Powered by AI Analyst Lab"
- [ ] Review: Passes Layer 4 with 0 RED flags
- [ ] Accessibility: Colorblind-safe palette used

### Template D: Coordination Agent

- [ ] CONTRACT block present
- [ ] Input: User question or phase trigger
- [ ] Output: Task queue with agent assignments
- [ ] Dependency graph: No cycles (validated at runtime)
- [ ] Escalation: Triggers user prompt if deadlock
- [ ] Logging: Records agent call sequence
- [ ] No data analysis (delegates to specialists)
- [ ] Review: Passes logic check (no orphaned tasks)
- [ ] Timeout: Flags if agent exceeds 60s

### Template E: Validation/Review Agent

- [ ] CONTRACT block present
- [ ] Input: Raw data OR analysis output
- [ ] Output: Structured report (JSON for Layer 1+2, Markdown for Layer 3+4)
- [ ] Output: Confidence score (0-100 + letter grade)
- [ ] Flags: Categorized as RED/YELLOW/GREEN
- [ ] Auto-fix: Logs applied fixes (null fill, duplicate removal)
- [ ] Escalation: Triggers user prompt if confidence <70 after 2 revisions
- [ ] No subjective judgment (rule-based only)
- [ ] Review: Self-validates (spot checks by user)

### Template F: Data Platform Adapter (NEW)

- [ ] Implements ConnectionManager interface (connect, query, close)
- [ ] query() accepts query_spec dict with query_type, symbol, date range
- [ ] Returns pandas DataFrame with expected schema
- [ ] Handles API errors gracefully (retries, fallback to cache)
- [ ] Logs all queries (source, timestamp, row count)
- [ ] Cache integration via cache_helpers.cached_query()
- [ ] No business logic (pure data access)
- [ ] Review: Passes integration test with vnstock_lib.py

---

## 11. BUILD STATUS INITIALIZATION

All 109 tasks pre-populated as `not_started` in BUILD_STATUS.yaml (see separate file).

---

## 12. NEXT STEPS (Phase 1 Implementation)

**Immediate Actions:**

1. Review and approve this BUILD_PLAN.md
2. Initialize BUILD_STATUS.yaml (all tasks not_started)
3. Begin Wave 0 (Foundation) - 15 tasks, ~20.25 hours
4. Daily standup: Update BUILD_STATUS.yaml task progress
5. Weekly review: Check QUALITY_LOG.md for validation trends

**Success Metrics:**

- Wave 0: Directory structure created, vnstock connected, /health works
- Wave 1: L1-L2 queries functional, real-time prices display, Vietnamese i18n working
- Wave 2: L3-L4 queries functional, 4-layer validation passing, confidence scores displayed
- Wave 3: Marp decks generated, charts match data, export formats working
- Wave 4: L5 portfolio optimization functional, backtesting working

**Quality Gates (Must Pass Before Next Wave):**

- Wave 0 → Wave 1: /health shows all agents loaded, vnstock connected
- Wave 1 → Wave 2: L1 query returns real-time price with confidence score
- Wave 2 → Wave 3: L3 query passes all 4 validation layers with confidence ≥C
- Wave 3 → Wave 4: Marp deck exports to PDF, charts pass Layer 4 validation
- Wave 4 → Production: L5 query completes in <10 min, confidence ≥C

---

**Powered by AI Analyst Lab | aianalystlab.ai**
**Build Arbiter:** Claude Sonnet 4.5
**Date:** 2026-02-21
**Status:** CANONICAL - Ready for Phase 1 Implementation
