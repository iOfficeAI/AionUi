# Forecast Skill

# Simple Time-Series Forecasting (No ML)

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Provide simple time-series projections using trend extrapolation with confidence bands. This skill does NOT use ML models (ARIMA, Prophet, neural networks). It uses linear/polynomial trend extension with explicit caveats about projection limitations.

## When to Use

- **Trigger:** `/forecast` command or when user asks about future price/metric projections
- **Syntax:** `/forecast [symbol] [metric] [horizon]`
- **Example:** `/forecast VCB price 6m`
- **Context:** After analysis reveals a trend worth projecting forward

## Allowed Methods

### Method 1: Linear Trend Extrapolation

**When:** Steady trend over sufficient history

```python
import numpy as np

def linear_forecast(series, horizon_periods):
    """
    Simple linear extrapolation with confidence band.
    """
    x = np.arange(len(series))
    y = series.values

    # Fit linear trend
    slope, intercept = np.polyfit(x, y, 1)

    # Project forward
    future_x = np.arange(len(series), len(series) + horizon_periods)
    forecast = slope * future_x + intercept

    # Confidence band: use historical residual std
    residuals = y - (slope * x + intercept)
    std = residuals.std()
    ci_upper = forecast + 1.96 * std
    ci_lower = forecast - 1.96 * std

    return {
        'forecast': forecast,
        'ci_upper': ci_upper,
        'ci_lower': ci_lower,
        'slope': slope,
        'r_squared': 1 - (residuals.var() / y.var()),
    }
```

### Method 2: Moving Average Projection

**When:** Noisy data, want smoothed projection

```python
def ma_forecast(series, window=20, horizon_periods=60):
    """
    Project using the most recent moving average trend.
    """
    ma = series.rolling(window).mean()
    recent_slope = (ma.iloc[-1] - ma.iloc[-window]) / window

    forecast = [ma.iloc[-1] + recent_slope * i for i in range(1, horizon_periods + 1)]

    # Confidence widens with horizon
    std = series.diff().std()
    ci_widths = [1.96 * std * np.sqrt(i) for i in range(1, horizon_periods + 1)]

    return {
        'forecast': forecast,
        'ci_upper': [f + w for f, w in zip(forecast, ci_widths)],
        'ci_lower': [f - w for f, w in zip(forecast, ci_widths)],
    }
```

### Method 3: Mean-Reversion Projection

**When:** Metric has known long-term average (P/E, ROE)

```python
def mean_reversion_forecast(current, long_term_avg, half_life_periods):
    """
    Exponential decay toward long-term mean.
    Assumes mean-reverting behavior (suitable for valuation ratios).
    """
    forecast = []
    value = current
    decay = 0.5 ** (1 / half_life_periods)

    for t in range(1, horizon + 1):
        value = long_term_avg + (value - long_term_avg) * decay
        forecast.append(value)

    return {'forecast': forecast, 'target': long_term_avg, 'half_life': half_life_periods}
```

## Forbidden Methods

These are explicitly NOT allowed per the statistical ceiling:

- ARIMA / SARIMA
- Prophet
- LSTM / Neural networks
- Random forests / Gradient boosting
- Regression models
- Any scikit-learn / TensorFlow / PyTorch model

## Output Format

```yaml
forecast:
  symbol: 'VCB'
  metric: 'close_price'
  horizon: '6 months'
  method: 'linear_trend'
  current_value: 82500
  forecast_values:
    - { period: '2026-03', value: 84200, ci_lower: 76100, ci_upper: 92300 }
    - { period: '2026-04', value: 85900, ci_lower: 75400, ci_upper: 96400 }
    - { period: '2026-05', value: 87600, ci_lower: 74700, ci_upper: 100500 }
    - { period: '2026-06', value: 89300, ci_lower: 74000, ci_upper: 104600 }
    - { period: '2026-07', value: 91000, ci_lower: 73300, ci_upper: 108700 }
    - { period: '2026-08', value: 92700, ci_lower: 72600, ci_upper: 112800 }
  trend_direction: 'up'
  monthly_change: '+1700 VND'
  r_squared: 0.72

  caveats:
    - 'This is a PROJECTION, not a prediction. Past trends do not guarantee future results.'
    - 'Confidence intervals widen significantly with horizon length.'
    - 'Method: simple linear extrapolation (no ML, no regression modeling).'
    - 'External events (FTSE review, SBV rate changes, earnings surprises) not modeled.'
    - 'Vietnamese price limits (+-7% daily) may cause actual path to differ from projection.'
```

## Mandatory Caveats

Every forecast MUST include these caveats:

1. "This is a **projection** assuming current trends continue, not a **prediction**."
2. "Confidence intervals **widen significantly** with longer horizons."
3. "Method: [method name] - no ML or regression models used."
4. "External events not modeled: [list relevant events for Vietnamese market]."
5. "Historical trends may not continue. Use for scenario planning, not investment decisions."

## Vietnamese Market Forecast Considerations

- **Price limits:** Daily +/-7% cap means trends play out over multiple sessions
- **Tet effect:** Account for market closure during Tet (typically 5-7 trading days)
- **Quarterly earnings:** Expect increased volatility around earnings dates
- **Foreign flows:** FTSE/MSCI review dates create discontinuities
- **Trading hours:** 9:00-15:00 ICT, T+2 settlement

## Instructions

1. **Verify data sufficiency:** Need at least 60 data points for linear trend, 120 for MA
2. **Choose method based on data pattern:**
   - Steady trend: Linear extrapolation
   - Noisy/cyclical: Moving average
   - Valuation ratio: Mean reversion
3. **Always show confidence bands:** 95% CI is mandatory
4. **Cap horizon:** Maximum 12 months (projections beyond this are unreliable)
5. **Include caveats:** All 5 mandatory caveats must appear in output
6. **VND formatting:** All price projections in VND with comma separator

## Error Handling

| Scenario                         | Action                                                                |
| -------------------------------- | --------------------------------------------------------------------- |
| Insufficient data (<30 points)   | Error: "Need at least 30 data points. Only [N] available."            |
| No clear trend (R-squared < 0.3) | Warn: "No significant trend detected. Projection has low confidence." |
| Horizon > 12 months              | Cap at 12 months with warning                                         |
| Non-numeric metric               | Error: "Cannot forecast non-numeric data"                             |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
