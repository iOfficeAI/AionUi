# Technicals Analyst Skill

## Purpose

Quantitative technical analysis using **pandas-ta** library for battle-tested indicators. Supports both Vietnamese stocks (via vnstock) and US stocks (via financialdatasets.ai).

## Enhanced Indicators

| Category           | Indicators                                             | Weight |
| ------------------ | ------------------------------------------------------ | ------ |
| Trend              | EMA 8/21/55, ADX, Directional Movement Index (DI+/DI-) | 25%    |
| Momentum           | MACD, Stochastic, RSI, 1M/3M/6M returns, OBV           | 30%    |
| Mean Reversion     | Bollinger Bands, RSI, Z-score                          | 20%    |
| Volatility         | ATR, Historical Volatility, HV regime                  | 15%    |
| Support/Resistance | Pivot points, Fibonacci retracements                   | 10%    |

## Key Enhancements (vs. Previous Version)

✅ **pandas-ta library**: All indicators use battle-tested pandas-ta calculations instead of hand-coded formulas
✅ **Vietnamese stocks**: Direct integration with `vnstock_lib.py` for Vietnamese market data
✅ **Advanced indicators**: MACD, Stochastic, ADX, OBV, ATR, Bollinger Bands
✅ **Support/Resistance**: Automatic pivot point calculation
✅ **Signal enrichment**: Detailed indicator metadata (crossover dates, trend strength, volume confirmation)

## Signal Logic

- **Bullish**: Uptrend confirmed (ADX > 25), MACD crossover, positive momentum with volume/OBV confirmation, not overbought
- **Bearish**: Downtrend, MACD bearish, negative momentum, elevated volatility, overbought conditions
- **Neutral**: Mixed signals across categories or weak trend strength (ADX < 20)

## Requires Price History

This skill needs 6-12 months of price data for optimal indicator calculation:

- Minimum: 126 trading days (~6 months)
- Recommended: 252 trading days (~1 year)

## Usage

### Python Library (Recommended)

Import and use as a function:

```python
import sys
sys.path.insert(0, '.')

from vnstock_lib import fetch_quote
from technicals.analyze import analyze_technical

# Analyze technical indicators
signals = analyze_technical(
    symbol='VCB',
    start_date='2025-02-20',
    end_date='2026-02-20'
)

# Access signal data directly
print(f"Overall signal: {signals['signal']}")
print(f"Confidence: {signals['confidence']}%")
print(f"MACD crossover: {signals['momentum']['metrics']['macd']['crossover']}")
print(f"RSI: {signals['mean_reversion']['metrics']['rsi_14']:.1f}")
```

### CLI (Legacy)

For backward compatibility, CLI is still available:

```bash
python .claude/skills/technicals/scripts/analyze.py VCB 2025-02-20 2026-02-20
```

## Output Format

Returns a Python dict with enhanced structure:

```json
{
  "symbol": "VCB",
  "signal": "bullish",
  "confidence": 78,
  "combined_score": 0.78,
  "levels": {
    "support": [92000, 95000],
    "resistance": [105000, 110000],
    "pivot_point": 98500
  },
  "trend_following": {
    "signal": "bullish",
    "confidence": 0.75,
    "metrics": {
      "ema_8": 99500,
      "ema_21": 97800,
      "ema_55": 95200,
      "price_above_ema21": true,
      "adx": 28.5,
      "trend_strength": "moderate",
      "di_plus": 32.1,
      "di_minus": 18.7
    }
  },
  "momentum": {
    "signal": "bullish",
    "confidence": 0.82,
    "metrics": {
      "momentum_1m": 5.2,
      "momentum_3m": 12.8,
      "momentum_6m": 18.5,
      "volume_momentum": 1.35,
      "macd": {
        "value": 0.45,
        "signal": 0.38,
        "histogram": 0.07,
        "crossover": "bullish",
        "crossover_date": "2026-02-15"
      },
      "stochastic": {
        "k": 68.5,
        "d": 65.2,
        "oversold": false,
        "overbought": false
      },
      "obv": {
        "value": 1250000000,
        "trend": "rising",
        "confirming_price": true
      }
    }
  },
  "mean_reversion": {
    "signal": "neutral",
    "confidence": 0.5,
    "metrics": {
      "z_score": 0.15,
      "rsi_14": 62.3,
      "ma_50": 97200,
      "bb_upper": 105000,
      "bb_middle": 98000,
      "bb_lower": 91000,
      "price_near_lower_band": false,
      "price_near_upper_band": false
    }
  },
  "volatility": {
    "signal": "neutral",
    "confidence": 0.5,
    "metrics": {
      "historical_volatility": 18.5,
      "volatility_regime": 0.95,
      "atr": {
        "value": 2500,
        "ma_20": 2350,
        "expanding": true
      }
    }
  }
}
```

## Indicator Details

### Trend Indicators

**EMA (Exponential Moving Average)**

- Periods: 8, 21, 55
- Bullish: Price > EMA-8 > EMA-21 > EMA-55
- Bearish: Price < EMA-8 < EMA-21 < EMA-55

**ADX (Average Directional Index)**

- Measures trend strength (not direction)
- ADX > 25: Strong trend
- ADX 20-25: Moderate trend
- ADX < 20: Weak or no trend

**Directional Movement (DI+/DI-)**

- DI+ > DI-: Bullish trend
- DI- > DI+: Bearish trend

### Momentum Indicators

**MACD (Moving Average Convergence Divergence)**

- Fast: 12-period EMA
- Slow: 26-period EMA
- Signal: 9-period EMA of MACD
- Crossover detection: Reports date of recent bullish/bearish crossovers

**Stochastic Oscillator**

- K: 14-period
- D: 3-period SMA of K
- Oversold: K < 20
- Overbought: K > 80

**OBV (On-Balance Volume)**

- Volume-based momentum indicator
- Rising OBV + rising price = strong uptrend
- Falling OBV + rising price = divergence (warning)

**RSI (Relative Strength Index)**

- 14-period RSI
- Oversold: RSI < 30
- Overbought: RSI > 70

### Mean Reversion Indicators

**Bollinger Bands**

- 20-period SMA ± 2 standard deviations
- Price near lower band: Potential reversal up
- Price near upper band: Potential reversal down

**Z-Score**

- (Price - MA_50) / StdDev_50
- Z > 2: Significantly above mean (overbought)
- Z < -2: Significantly below mean (oversold)

### Volatility Indicators

**ATR (Average True Range)**

- 14-period ATR
- Expanding ATR: Increasing volatility
- Contracting ATR: Decreasing volatility

**Historical Volatility**

- 21-day annualized standard deviation of returns
- HV regime: Current HV vs 63-day average

### Support/Resistance

**Pivot Points**

- Classic pivot calculation: P = (H + L + C) / 3
- Resistance 1: R1 = 2P - L
- Resistance 2: R2 = P + (H - L)
- Support 1: S1 = 2P - H
- Support 2: S2 = P - (H - L)

## Usage with Charts

### Python Workflow

```python
import sys
sys.path.insert(0, '.')
import pandas as pd

from vnstock_lib import fetch_quote
from technicals.analyze import analyze_technical
from financial_visualization.plot_technical_chart import generate_chart

# 1. Analyze technical indicators
signals = analyze_technical('VCB', '2025-02-20', '2026-02-20')

# 2. Save signals as CSV (optional)
pd.DataFrame([signals]).to_csv('drafts/technicals/data/signals.csv', index=False)

# 3. Generate chart with signals
chart_path = generate_chart(
    symbol='VCB',
    start_date='2025-02-20',
    end_date='2026-02-20',
    signals=signals,
    output_path='drafts/technicals/charts/technical_analysis.png'
)

print(f"Chart saved to: {chart_path}")
```

### Embed in Markdown Report

```markdown
## Technical Analysis

![Technical Chart](analyses/VCB_multiagent_2026-02-20/drafts/technicals/charts/technical_analysis.png)

**Signal**: BULLISH (confidence: 78%)

**Key Levels**:

- Support: 95,000 VND (Fib 0.618 retracement)
- Resistance: 105,000 VND (previous high)

**Indicators**:

- MACD: Bullish crossover on 2026-02-15
- RSI: 62 (neutral, room to run)
- ADX: 28 (trending market)
- OBV: Rising (volume confirming uptrend)

**Interpretation**:
Strong uptrend confirmed by EMA alignment and ADX > 25. MACD bullish crossover 5 days ago with rising OBV confirms momentum. Not overbought (RSI 62). Key support at 95k VND.
```

## Integration with Multi-Agent Workflow

When used as a sub-agent in multi-agent research:

```python
import sys
import os
sys.path.insert(0, '.')
import pandas as pd

from vnstock_lib import fetch_quote
from technicals.analyze import analyze_technical
from financial_visualization.plot_technical_chart import generate_chart

# 1. Create workspace structure
analysis_dir = 'analyses/VCB_multiagent_2026-02-20'
os.makedirs(f'{analysis_dir}/drafts/technicals/data', exist_ok=True)
os.makedirs(f'{analysis_dir}/drafts/technicals/charts', exist_ok=True)

# 2. Run analysis
signals = analyze_technical('VCB', '2025-02-20', '2026-02-20')

# 3. Save signals as CSV
pd.DataFrame([signals]).to_csv(
    f'{analysis_dir}/drafts/technicals/data/signals.csv',
    index=False
)

# 4. Generate chart
chart_path = generate_chart(
    symbol='VCB',
    start_date='2025-02-20',
    end_date='2026-02-20',
    signals=signals,
    output_path=f'{analysis_dir}/drafts/technicals/charts/technical_analysis.png'
)

# 5. Write insights markdown
# Agent writes narrative insights to:
# analyses/VCB_multiagent_2026-02-20/drafts/technicals/insights.md
```

## Notes

- **Data source priority**: Tries `vnstock_lib.fetch_quote()` first, falls back to `src.tools.api.get_prices()` for US stocks
- **Minimum data**: Requires 126 trading days for 6-month momentum calculations
- **Indicator libraries**: All calculations use pandas-ta library (pure Python, no C dependencies)
- **Vietnamese examples**: VCB (Vietcombank), HPG (Hoa Phat Steel), TCB (Techcombank), VPB (VPBank), ACB (Asia Commercial Bank)
