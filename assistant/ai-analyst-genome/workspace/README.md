# AI Analyst Genome

**A self-building AI Data Analyst.** Drop this into an empty repo with Claude Code, answer 7 questions, and it builds itself — agents, skills, helpers, templates, and a full analysis pipeline.

Powered by [AI Analyst Lab](https://aianalystlab.ai) | Created by Shane Butler, Sravya Madipalli, and Hai Guan

---

## What This Is

The AI Analyst Genome is a single document that bootstraps a complete AI Data Analyst product through a 3-layer inception model:

1. **You answer 7 setup questions** — where's your data, what do you want to analyze, who's the audience
2. **4 architect agents debate** and produce a build plan
3. **7 builder agents execute** the plan, creating 19 analysis agents, ~30 skills, and 6 Python helper modules
4. **You have a working AI Data Analyst** that can take a business question from framing through validated analysis to a finished slide deck

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) running on Amazon SageMaker via Amazon Bedrock (or any Claude Code environment)
- Recommended model: Claude Opus 4.6
- An empty repo or directory
- Access to your data platform (Snowflake, PostgreSQL, BigQuery, CSV files, or anything else)

## Quick Start

```bash
# 1. Clone this repo (or copy the two files into an empty directory)
git clone https://github.com/ai-analyst-lab/ai-analyst-genome.git
cd ai-analyst-genome

# 2. Open Claude Code
claude

# 3. That's it. Claude reads CLAUDE.md, reads the genome, and starts
#    the setup wizard automatically. Answer 7 questions and the build begins.
```

## What Gets Built

| Component         | Count | Description                                                                             |
| ----------------- | ----- | --------------------------------------------------------------------------------------- |
| Pipeline Agents   | 17    | Question framing → data exploration → analysis → validation → storytelling → slide deck |
| Standalone Agents | 2     | Experiment designer, connector inspector                                                |
| Skills            | ~30   | Data platform, analytical guardrails, pipeline/UX, presentation                         |
| Python Helpers    | 6     | Charts, SQL dialects, data access, statistics, caching, error handling                  |
| Templates         | 2     | Slide deck skeleton, component library                                                  |
| Themes            | 2     | Light + dark presentation themes                                                        |

## What It Does NOT Include

- No sample data — you connect your own
- No hardcoded database assumptions — you tell it where your data lives
- No heavy statistics — descriptive analytics, root cause analysis, segmentation, funnels, trends, cohorts
- No ML or predictive modeling

## How Long Does It Take?

The full build runs in **3-5 Claude Code sessions** across 5 waves:

| Wave | Name                | What Gets Created                                  |
| ---- | ------------------- | -------------------------------------------------- |
| 0    | Foundation          | Directories, config, data connection, brand tokens |
| 1    | Core Infrastructure | Python helpers, templates, themes                  |
| 2    | Pipeline Agents     | All 19 agent specifications                        |
| 3    | Skills & UX         | All ~30 skills, persona file, onboarding           |
| 4    | Integration         | Registry, validation, end-to-end test              |

Progress is tracked in `_build/BUILD_STATUS.yaml` so you can stop and resume across sessions.

## Capability Tiers

| Tier               | Agents | Skills | Best For                                                      |
| ------------------ | ------ | ------ | ------------------------------------------------------------- |
| **Full** (default) | 19     | ~30    | Complete analysis → presentation pipeline                     |
| **Core**           | ~12    | ~20    | Analysis + charts, no experiment design or opportunity sizing |
| **Minimal**        | ~8     | ~12    | Data exploration + basic analysis, no presentation layer      |

## Files in This Repo

| File                   | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `CLAUDE.md`            | Bootstrapper — tells Claude Code to read the genome and start |
| `AI_ANALYST_GENOME.md` | The genome — complete blueprint for the AI Data Analyst       |
| `README.md`            | You're reading it (gets replaced after build completes)       |

---

> **Note:** This README gets replaced with the actual product README once the build completes. The product README will document the finished AI Data Analyst — its agents, skills, workflows, and how to use it day-to-day.

---

_AI Analyst Genome v1.0 — [AI Analyst Lab](https://aianalystlab.ai)_
