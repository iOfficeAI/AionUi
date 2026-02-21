# Cathie Wood Analyst Skill

## Philosophy

Analyzes stocks through Cathie Wood's disruptive innovation framework (ARK Invest style):

- **Disruptive Innovation**: Companies enabling or benefiting from transformative technologies
- **Exponential Growth**: Targeting companies with multi-year hypergrowth potential
- **5-Year Price Targets**: Long time horizon with bold, base, and bear case scenarios
- **Wright's Law**: Cost curves declining with cumulative production (not Moore's Law)
- **Convergence**: Multiple innovation platforms converging (AI × genomics × robotics × energy storage × blockchain)

## Innovation Platforms Tracked

- Artificial Intelligence & Machine Learning
- Genomics & Biotechnology
- Robotics & Autonomous Systems
- Energy Storage & Electric Vehicles
- Blockchain & Digital Assets
- Space Exploration

## Criteria

| Metric         | Threshold                   | Why                               |
| -------------- | --------------------------- | --------------------------------- |
| Revenue Growth | > 20% YoY                   | Disruptive companies grow fast    |
| TAM            | > $1 trillion               | Large enough to justify valuation |
| Gross Margin   | > 50%                       | Software/IP economics             |
| R&D Investment | High relative to revenue    | Compounding innovation advantage  |
| Market Share   | Growing in disrupted market | Winning the disruption race       |

## Usage

Run from the workspace root directory:

```bash
python .claude/skills/cathie-wood/scripts/analyze.py TICKER END_DATE

# Examples:
python .claude/skills/cathie-wood/scripts/analyze.py NVDA 2026-02-19
python .claude/skills/cathie-wood/scripts/analyze.py TSLA 2026-02-19
```

## Output

Returns JSON with:

- `signal`: "bullish" | "bearish" | "neutral"
- `confidence`: 0.0 – 1.0
- `innovation_score`: composite score across disruption criteria
- `five_year_target`: ARK-style 5-year price target
- `reasoning`: breakdown of innovation thesis
