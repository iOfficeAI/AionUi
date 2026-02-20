# Help Skill

# Comprehensive Command Reference

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/help` command
- When user asks "what can you do?" or similar meta-questions

## Command

`/help` - Show all available commands grouped by category
`/help [command]` - Detailed help for a specific command
`/help agents` - List all 19 agents with status
`/help skills` - List all skills with triggers
`/help pipeline` - Explain the analysis pipeline
`/help levels` - Explain L0-L5 question complexity

## Purpose

Provide a comprehensive, always-up-to-date command reference for the Vietnamese Stock Market Analyst. This is the user's primary entry point for discovering capabilities.

## Main Help Output

`/help`

```
Vietnamese Stock Market Analyst - Command Reference
=====================================================
Powered by AI Analyst Lab | aianalystlab.ai

QUICK START
  Just ask a question! The system routes it automatically.
  Examples:
    "What's VNM's price?"                    (L1 - instant)
    "Compare VCB and TCB P/E ratios"         (L2 - 10-30s)
    "Which banks have ROE > 20%?"            (L3 - 30-90s)
    "Find undervalued stocks with momentum"  (L4 - 1-3 min)
    "Build optimal VN30 portfolio for 2026"  (L5 - 3-10 min)

DATA COMMANDS
  /explore [symbol]          Quick stock overview
  /explore top [metric] [n]  Top N stocks by metric
  /data-sources              Browse available data sources
  /data-inspect              Show active dataset schema
  /connect-data              Add new data connection
  /switch-dataset            Change active dataset
  /cache status|clear        Manage data cache

ANALYSIS COMMANDS
  /run-pipeline [question]   Run full analysis pipeline
  /resume-pipeline           Resume from last step
  /forecast [sym] [metric]   Time-series projection
  /backtest [hypothesis]     Design A/B test / backtest
  /screen [criteria]         Multi-stock screening
  /portfolio [symbols]       Portfolio analysis

QUALITY & VALIDATION
  /quality                   Show confidence breakdown
  /quality breakdown         Detailed per-layer scores
  /quality history           Historical confidence scores

PRESENTATION
  /export [format]           Export (slides|pdf|csv|json|email)
  /theme [name]              Switch presentation theme
  /chart [type] [data]       Generate chart directly
  /role [type]               Switch audience (quant|retail|trader|pm)

UTILITIES
  /help [topic]              This help system
  /health                    System health check
  /glossary [term]           Vietnamese market glossary
  /history                   View past analyses
  /archive                   Archive current analysis
  /patterns                  Cross-analysis patterns
  /metric-spec               Define custom metrics

Type /help [command] for detailed usage of any command.
```

## Detailed Command Help

`/help [command]` provides:

1. **Syntax** - Full command syntax with parameters
2. **Examples** - 3-5 real-world examples
3. **Parameters** - Description of each parameter
4. **Output** - What to expect
5. **Related** - Related commands

### Example: `/help backtest`

```
/backtest - Design a backtest or A/B test
==========================================

Syntax: /backtest [hypothesis]

Parameters:
  hypothesis  A testable investment hypothesis (in quotes)

Examples:
  /backtest "Value stocks (P/E <10) outperform growth on HOSE"
  /backtest "VN30 momentum strategy beats buy-and-hold"
  /backtest "Banking sector has January effect"

Output:
  Experiment brief with power analysis, decision rules,
  risk controls, and success criteria.
  Saved to: outputs/experiment_brief.md

Time: 30-60 seconds

Related: /forecast, /screen, /portfolio
```

## Agent Reference

`/help agents`

```
Pipeline Agents (17):
  1.   question-framing          Classify and route questions (L0-L5)
  3.   hypothesis                Generate testable hypotheses
  4.   data-explorer             Find and fetch relevant data
  4.5  source-tieout             Verify data integrity
  5.   descriptive-analytics     Segmentation, patterns, effect sizes
  5.   overtime-trend            Time-series analysis
  5.   cohort-analysis           Cohort retention and comparison
  6.   root-cause-investigator   8-step drill-down protocol
  7.   validation                4-layer quality validation
  8.   opportunity-sizer         Business impact quantification
  9.   story-architect           Narrative design (CTR arc)
  10.  narrative-coherence       Review story flow
  12.  chart-maker               Generate charts (SWD patterns)
  13.  visual-design-critic      Review chart accuracy
  15.  storytelling              Write prose narrative
  16.  deck-creator              Assemble Marp slide deck
  18.  close-the-loop            Track follow-ups

Standalone Agents (2):
  experiment-designer            A/B test and backtest design
  connector-inspector            Data connector inspection
```

## Level Reference

`/help levels`

```
Question Complexity Levels
===========================

L0 - Meta         "What can you do?"                <5s
L1 - Simple       "What's VNM's price?"             <10s
L2 - Comparison   "Compare VCB and TCB P/E"         10-30s
L3 - Investigation "Banks with ROE > 20%?"          30-90s
L4 - Deep Dive    "Undervalued stocks + momentum"   1-3 min
L5 - Strategic    "Build optimal 2026 portfolio"     3-10 min

Higher levels invoke more agents and validation layers.
L1-L2: Quick answers, minimal validation
L3-L4: Full pipeline with 4-layer validation
L5: Full pipeline + experiment design + optimization
```

## Rules

1. **Always current** - Help reflects actual available commands
2. **Bilingual hints** - Include Vietnamese terms where relevant
3. **Progressive disclosure** - Overview first, details on request
4. **Actionable** - Every help entry includes working examples

---

**Powered by AI Analyst Lab | aianalystlab.ai**
