# Technical Analysis Scripts - Library Usage

## ⚠️ Use as Library, Not CLI

These scripts should be **imported as Python libraries**, not run as CLI commands.

### ❌ Old Way (Deprecated CLI)

```bash
python scripts/analyze.py VCB 2025-02-20 2026-02-20 > signals.json
```

### ✅ New Way (Library Import)

```python
import sys
sys.path.insert(0, '.')

from technicals.scripts.analyze import analyze_technical

# Analyze technical indicators
signals = analyze_technical('VCB', '2025-02-20', '2026-02-20')

# Access signals directly (no JSON parsing)
print(f"Signal: {signals['signal']}")
print(f"Confidence: {signals['confidence']}%")
print(f"MACD crossover: {signals['momentum']['metrics']['macd']['crossover']}")
print(f"RSI: {signals['mean_reversion']['metrics']['rsi_14']:.1f}")
```

## Available Functions

### `analyze.py`

Main analysis function:

```python
from technicals.scripts.analyze import analyze_technical

signals = analyze_technical(
    symbol='VCB',
    start_date='2025-02-20',
    end_date='2026-02-20'
)

# Returns dict with:
# - signal: 'bullish', 'bearish', or 'neutral'
# - confidence: 0-100
# - levels: support/resistance
# - trend_following: EMA, ADX metrics
# - momentum: MACD, RSI, OBV metrics
# - mean_reversion: Bollinger Bands, z-score
# - volatility: ATR, historical volatility
```

Helper functions also available:

```python
from technicals.scripts.analyze import (
    calculate_support_resistance,
    calculate_trend_signals,
    calculate_momentum_signals,
    calculate_mean_reversion_signals,
    calculate_volatility_signals
)

# Use individual calculators
import pandas as pd
from vnstock_lib import fetch_quote

df = fetch_quote('VCB', start='2025-02-20', end='2026-02-20')
trend = calculate_trend_signals(df)
momentum = calculate_momentum_signals(df)
```

## Output Format

Returns Python dict (not JSON file). Save to CSV if needed:

```python
import pandas as pd

signals = analyze_technical('VCB', '2025-02-20', '2026-02-20')
pd.DataFrame([signals]).to_csv('signals.csv', index=False)
```

## Legacy CLI Support

CLI wrapper (`if __name__ == "__main__"`) is preserved for backward compatibility.
Use library imports for all new code.
