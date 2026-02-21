# AI Analyst (Genome)

A specialized AI Data Analyst assistant for the Vietnamese stock market, built with the [AI Analyst Genome](https://aianalystlab.ai) framework.

## Overview

This assistant transforms Claude into a comprehensive Vietnamese equity analyst with:

- **17-agent pipeline** for structured analysis (question framing through presentation)
- **4-layer quality system** with confidence scoring (A-F grades)
- **37+ skills** for data access, analysis, visualization, and export
- **~1,700 stocks** across HOSE, HNX, and UPCOM exchanges

## Requirements

### Python

- Python 3.10 or higher
- vnstock library (>=3.4.2)
- Additional dependencies: pandas, numpy, scipy, matplotlib

### Installation

Dependencies are automatically installed during workspace setup via `setup.sh`.

#### Manual Installation

```bash
bash workspace/setup.sh
```

Or install Python dependencies directly:

```bash
pip install vnstock>=3.4.2 pandas numpy scipy matplotlib pyyaml pydantic httpx
```

## Usage

Just ask a question — the system routes it automatically by complexity (L0-L5):

```
"What's VCB's current price?"                    # L1: instant lookup
"Compare VCB and TCB P/E ratios"                 # L2: comparison
"Which banking stocks have ROE > 20%?"           # L3: investigation
"Find undervalued stocks with strong momentum"   # L4: deep dive
"Build an optimal VN30 portfolio for 2026"       # L5: strategic
```

Or use slash commands: `/explore VCB`, `/screen PE < 15 AND ROE > 20%`, `/backtest "Value beats growth"`.

## Architecture

### Agent Pipeline (17 agents)

```
Question -> [Framing] -> [Hypothesis] -> [Data Discovery] -> [Tieout]
    -> [Analysis: descriptive / trends / cohorts] -> [Root Cause]
    -> [Validation (4 layers)] -> [Opportunity Sizing]
    -> [Story Architecture] -> [Coherence Review]
    -> [Charts] -> [Design Review]
    -> [Storytelling] -> [Deck Assembly] -> [Follow-up Tracking]
```

### Data Sources

| Source | Type | Coverage |
|--------|------|----------|
| KBS | Primary | Real-time prices, OHLCV (2010+), listings |
| VCI | Secondary | Financial statements, ratios (2012+) |
| TCBS | Tertiary | Cross-validation |

## Supported Languages

- English (en-US)
- Chinese Simplified (zh-CN)
- Chinese Traditional (zh-TW)
- Japanese (ja-JP)
- Korean (ko-KR)

## Credits

Built with the **AI Analyst Genome v1.0** by [AI Analyst Lab](https://aianalystlab.ai).

Created by Shane Butler, Sravya Madipalli, and Hai Guan.

## License

This assistant configuration is part of AionUi and follows the Apache-2.0 license.
