# Backtest Skill

# Historical Strategy Testing

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/backtest` command
- When user asks to test a strategy historically
- Invokes the `experiment-designer` agent (standalone) for design
- Uses `scripts/run_backtest.py` for execution

## Command

`/backtest [hypothesis]` - Design and specify a backtest
`/backtest run [strategy]` - Execute a factor backtest (value, momentum, quality, growth, low_vol)
`/backtest status` - Check status of current backtest design
`/backtest results` - View latest experiment brief or backtest results

## Purpose

Provide a user-friendly interface to the experiment-designer agent. Converts natural language strategy descriptions into formal backtest specifications with power analysis, decision rules, and risk controls.

## Workflow

```
User: /backtest "Low P/E stocks outperform on HOSE"
                    |
                    v
        [1. Parse hypothesis]
                    |
                    v
        [2. Invoke experiment-designer agent]
                    |
                    v
        [3. Power analysis + sample size]
                    |
                    v
        [4. Generate experiment brief]
                    |
                    v
        outputs/experiment_brief.md
```

## Examples

### Factor Backtest

```
/backtest "Value stocks (P/E < 10) outperform growth stocks (P/E > 25) on HOSE over 5 years"
```

Output: Experiment brief with:

- Universe: HOSE stocks with valid P/E data
- Treatment: Bottom P/E quintile, rebalanced quarterly
- Control: Top P/E quintile
- Period: 2021-01-01 to 2025-12-31
- Decision rule: Treatment beats control by >2% annually (p < 0.05)

### Momentum Backtest

```
/backtest "6-month price momentum predicts 3-month forward returns in VN30"
```

### Seasonal Backtest

```
/backtest "VN30 returns are higher in January than February-December"
```

### Mean Reversion Backtest

```
/backtest "Stocks hitting -7% daily limit recover within 5 trading sessions"
```

## Parameters

| Parameter  | Description                             | Default           |
| ---------- | --------------------------------------- | ----------------- |
| hypothesis | Strategy hypothesis in natural language | Required          |
| period     | Backtest date range                     | Last 5 years      |
| universe   | Stock universe                          | HOSE              |
| rebalance  | Rebalancing frequency                   | Quarterly         |
| metric     | Primary success metric                  | Annualized return |

## Execution Script

`scripts/run_backtest.py` provides historical simulation with:

```bash
# Value strategy on VN30
python scripts/run_backtest.py --strategy value --universe VN30 --start 2022-01-01 --end 2025-12-31

# Momentum strategy on HOSE
python scripts/run_backtest.py --strategy momentum --universe HOSE --rebalance monthly --top-n 15

# Available strategies: value, momentum, quality, growth, low_vol
```

**Backtest Engine Features:**

- Equal-weight rebalancing at configurable intervals
- Transaction costs: 0.2% round trip + 0.1% selling tax
- T+2 settlement and 2-day execution lag
- Liquidity filter: min 100K avg daily volume
- Benchmark comparison (equal-weight universe)
- Metrics: annual return, Sharpe, Sortino, max drawdown, win rate, alpha

## Output Location

- Experiment brief: `outputs/experiment_brief.md`
- Backtest results: `outputs/backtest_results.json`
- Referenced data: `_working/data_inventory.md`

## Vietnamese Market Backtest Rules

1. **Price limits:** Account for +/-7% daily cap in return calculations
2. **Tet effect:** Exclude Tet holiday period from seasonal tests
3. **T+2 settlement:** Rebalancing signals need 2-day execution lag
4. **Reporting lag:** Use 45-day lag for financial data availability
5. **Survivorship bias:** Include delisted stocks in historical universe
6. **Transaction costs:** Estimate 0.15-0.25% round trip + 0.1% selling tax
7. **Liquidity filter:** Exclude stocks with <100,000 avg daily volume

## Quality Gates

Before generating the experiment brief:

- [ ] Hypothesis is testable (causal, not descriptive)
- [ ] Sufficient historical data (>=252 trading days per group)
- [ ] Power analysis shows >=80% power
- [ ] Decision rules defined before looking at results
- [ ] Risk controls appropriate for strategy type
- [ ] Vietnamese market constraints documented

## Error Handling

| Scenario          | Response                                                                        |
| ----------------- | ------------------------------------------------------------------------------- |
| Vague hypothesis  | "Please specify: which stocks, what metric, what timeframe?"                    |
| Too short period  | "Need at least 1 year (252 trading days). Extend period or reduce effect size." |
| Untestable claim  | "This is descriptive, not testable. Try: [reformulated hypothesis]"             |
| No data available | "Data not available for [symbol/period]. Check /datasets coverage."             |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
