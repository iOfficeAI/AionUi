#!/usr/bin/env python3
"""Technical analysis of stock price data using pandas-ta library."""
import sys
import json
import math

sys.path.insert(0, '.')

try:
    import pandas as pd
    import pandas_ta as ta
except ImportError as e:
    print(json.dumps({"error": f"Required libraries not installed: {e}. Run: pip install pandas pandas-ta"}))
    sys.exit(1)

try:
    from vnstock_lib import fetch_quote
except ImportError:
    # Fallback to US API if vnstock_lib not available
    from src.tools.api import get_prices


def calculate_support_resistance(df: pd.DataFrame) -> dict:
    """Calculate support and resistance levels using pivot points."""
    if len(df) < 10:
        return {"support": [], "resistance": [], "pivot_point": None}

    # Classic pivot point calculation
    high = df['high'].iloc[-1]
    low = df['low'].iloc[-1]
    close = df['close'].iloc[-1]

    pivot = (high + low + close) / 3
    r1 = 2 * pivot - low
    r2 = pivot + (high - low)
    s1 = 2 * pivot - high
    s2 = pivot - (high - low)

    return {
        "support": [round(s2, 2), round(s1, 2)],
        "resistance": [round(r1, 2), round(r2, 2)],
        "pivot_point": round(pivot, 2)
    }


def calculate_trend_signals(df: pd.DataFrame) -> dict:
    """Calculate trend following signals using pandas-ta."""
    if len(df) < 55:
        return {"signal": "neutral", "confidence": 0.5, "metrics": {}}

    # Calculate EMAs using pandas-ta
    df['ema_8'] = df.ta.ema(length=8)
    df['ema_21'] = df.ta.ema(length=21)
    df['ema_55'] = df.ta.ema(length=55)

    # Calculate ADX for trend strength
    adx_df = df.ta.adx(length=14)
    if adx_df is not None and not adx_df.empty:
        df['adx'] = adx_df['ADX_14']
        df['di_plus'] = adx_df['DMP_14']
        df['di_minus'] = adx_df['DMN_14']

    current_price = df['close'].iloc[-1]
    ema_8 = df['ema_8'].iloc[-1]
    ema_21 = df['ema_21'].iloc[-1]
    ema_55 = df['ema_55'].iloc[-1]

    # Trend direction
    short_trend = current_price > ema_8 > ema_21
    medium_trend = ema_21 > ema_55

    # Trend strength from ADX
    adx_val = df['adx'].iloc[-1] if 'adx' in df.columns else 20
    trend_strength = "strong" if adx_val > 25 else "moderate" if adx_val > 20 else "weak"

    # Signal logic
    if short_trend and medium_trend:
        signal = "bullish"
        confidence = min(0.7 + (adx_val - 20) / 100, 0.95)
    elif not short_trend and not medium_trend:
        signal = "bearish"
        confidence = min(0.7 + (adx_val - 20) / 100, 0.95)
    else:
        signal = "neutral"
        confidence = 0.5

    metrics = {
        "ema_8": round(ema_8, 2),
        "ema_21": round(ema_21, 2),
        "ema_55": round(ema_55, 2),
        "price_above_ema21": current_price > ema_21,
        "adx": round(adx_val, 1),
        "trend_strength": trend_strength
    }

    if 'di_plus' in df.columns and 'di_minus' in df.columns:
        metrics["di_plus"] = round(df['di_plus'].iloc[-1], 1)
        metrics["di_minus"] = round(df['di_minus'].iloc[-1], 1)

    return {
        "signal": signal,
        "confidence": round(confidence, 2),
        "metrics": metrics
    }


def calculate_mean_reversion_signals(df: pd.DataFrame) -> dict:
    """Calculate mean reversion signals using pandas-ta."""
    if len(df) < 50:
        return {"signal": "neutral", "confidence": 0.5, "metrics": {}}

    # Calculate RSI using pandas-ta
    df['rsi'] = df.ta.rsi(length=14)

    # Calculate Bollinger Bands using pandas-ta
    bbands = df.ta.bbands(length=20, std=2)
    if bbands is not None and not bbands.empty:
        df['bb_upper'] = bbands[f'BBU_20_2.0']
        df['bb_middle'] = bbands[f'BBM_20_2.0']
        df['bb_lower'] = bbands[f'BBL_20_2.0']

    # Z-score from 50-day MA
    ma_50 = df['close'].rolling(50).mean().iloc[-1]
    std_50 = df['close'].rolling(50).std().iloc[-1]
    current_price = df['close'].iloc[-1]
    z_score = (current_price - ma_50) / std_50 if std_50 > 0 else 0

    rsi_14 = df['rsi'].iloc[-1]

    # Mean reversion signals
    if z_score < -2 and rsi_14 < 30:
        signal = "bullish"  # Oversold
        confidence = min(abs(z_score) / 4, 1.0)
    elif z_score > 2 and rsi_14 > 70:
        signal = "bearish"  # Overbought
        confidence = min(abs(z_score) / 4, 1.0)
    else:
        signal = "neutral"
        confidence = 0.5

    metrics = {
        "z_score": round(z_score, 2),
        "rsi_14": round(rsi_14, 1),
        "ma_50": round(ma_50, 2)
    }

    if 'bb_upper' in df.columns:
        metrics["bb_upper"] = round(df['bb_upper'].iloc[-1], 2)
        metrics["bb_middle"] = round(df['bb_middle'].iloc[-1], 2)
        metrics["bb_lower"] = round(df['bb_lower'].iloc[-1], 2)
        metrics["price_near_lower_band"] = current_price < df['bb_lower'].iloc[-1] * 1.02
        metrics["price_near_upper_band"] = current_price > df['bb_upper'].iloc[-1] * 0.98

    return {
        "signal": signal,
        "confidence": round(confidence, 2),
        "metrics": metrics
    }


def calculate_momentum_signals(df: pd.DataFrame) -> dict:
    """Calculate momentum signals using pandas-ta."""
    if len(df) < 126:
        return {"signal": "neutral", "confidence": 0.5, "metrics": {}}

    # Calculate MACD using pandas-ta
    macd = df.ta.macd(fast=12, slow=26, signal=9)
    if macd is not None and not macd.empty:
        df['macd'] = macd['MACD_12_26_9']
        df['macd_signal'] = macd['MACDs_12_26_9']
        df['macd_hist'] = macd['MACDh_12_26_9']

    # Calculate Stochastic using pandas-ta
    stoch = df.ta.stoch(high='high', low='low', close='close', k=14, d=3)
    if stoch is not None and not stoch.empty:
        df['stoch_k'] = stoch['STOCHk_14_3_3']
        df['stoch_d'] = stoch['STOCHd_14_3_3']

    # Calculate OBV using pandas-ta
    df['obv'] = df.ta.obv()

    # Calculate returns
    df['returns'] = df['close'].pct_change()

    mom_1m = df['returns'].iloc[-21:].sum() if len(df) >= 21 else 0
    mom_3m = df['returns'].iloc[-63:].sum() if len(df) >= 63 else 0
    mom_6m = df['returns'].iloc[-126:].sum() if len(df) >= 126 else 0

    # Volume momentum
    vol_ma = df['volume'].rolling(21).mean().iloc[-1] if len(df) >= 21 else df['volume'].mean()
    vol_momentum = df['volume'].iloc[-1] / vol_ma if vol_ma > 0 else 1

    # OBV trend
    obv_current = df['obv'].iloc[-1] if 'obv' in df.columns else 0
    obv_ma = df['obv'].rolling(21).mean().iloc[-1] if 'obv' in df.columns and len(df) >= 21 else 0
    obv_rising = obv_current > obv_ma if obv_ma != 0 else False

    # MACD crossover
    macd_bullish = False
    macd_crossover_date = None
    if 'macd' in df.columns and 'macd_signal' in df.columns:
        macd_current = df['macd'].iloc[-1]
        macd_signal_current = df['macd_signal'].iloc[-1]
        macd_bullish = macd_current > macd_signal_current

        # Find recent crossover
        for i in range(min(10, len(df) - 1), 0, -1):
            if df['macd'].iloc[-i-1] <= df['macd_signal'].iloc[-i-1] and df['macd'].iloc[-i] > df['macd_signal'].iloc[-i]:
                macd_crossover_date = str(df.index[-i].date()) if hasattr(df.index[-i], 'date') else str(df.index[-i])
                break

    # Stochastic signals
    stoch_oversold = False
    stoch_overbought = False
    if 'stoch_k' in df.columns:
        stoch_k = df['stoch_k'].iloc[-1]
        stoch_oversold = stoch_k < 20
        stoch_overbought = stoch_k > 80

    # Momentum score
    momentum_score = 0.4 * mom_1m + 0.3 * mom_3m + 0.3 * mom_6m
    volume_confirm = vol_momentum > 1.0

    if momentum_score > 0.05 and (volume_confirm or obv_rising or macd_bullish):
        signal = "bullish"
        confidence = min(abs(momentum_score) * 5, 1.0)
    elif momentum_score < -0.05 and (volume_confirm or not obv_rising or not macd_bullish):
        signal = "bearish"
        confidence = min(abs(momentum_score) * 5, 1.0)
    else:
        signal = "neutral"
        confidence = 0.5

    metrics = {
        "momentum_1m": round(mom_1m * 100, 1),
        "momentum_3m": round(mom_3m * 100, 1),
        "momentum_6m": round(mom_6m * 100, 1),
        "volume_momentum": round(vol_momentum, 2)
    }

    if 'macd' in df.columns:
        metrics["macd"] = {
            "value": round(df['macd'].iloc[-1], 4),
            "signal": round(df['macd_signal'].iloc[-1], 4),
            "histogram": round(df['macd_hist'].iloc[-1], 4),
            "crossover": "bullish" if macd_bullish else "bearish",
            "crossover_date": macd_crossover_date
        }

    if 'stoch_k' in df.columns:
        metrics["stochastic"] = {
            "k": round(df['stoch_k'].iloc[-1], 1),
            "d": round(df['stoch_d'].iloc[-1], 1),
            "oversold": stoch_oversold,
            "overbought": stoch_overbought
        }

    if 'obv' in df.columns:
        metrics["obv"] = {
            "value": int(obv_current),
            "trend": "rising" if obv_rising else "falling",
            "confirming_price": obv_rising == (momentum_score > 0)
        }

    return {
        "signal": signal,
        "confidence": round(confidence, 2),
        "metrics": metrics
    }


def calculate_volatility_signals(df: pd.DataFrame) -> dict:
    """Calculate volatility-based signals using pandas-ta."""
    if len(df) < 63:
        return {"signal": "neutral", "confidence": 0.5, "metrics": {}}

    # Calculate ATR using pandas-ta
    df['atr'] = df.ta.atr(length=14)

    # Daily returns
    df['returns'] = df['close'].pct_change()

    # Historical volatility (21-day, annualized)
    recent_returns = df['returns'].iloc[-21:]
    vol = recent_returns.std() * math.sqrt(252)

    # Volatility regime
    vol_ma_returns = df['returns'].iloc[-63:]
    vol_ma = vol_ma_returns.std() * math.sqrt(252)
    vol_regime = vol / vol_ma if vol_ma > 0 else 1

    # ATR analysis
    atr_current = df['atr'].iloc[-1] if 'atr' in df.columns else 0
    atr_ma = df['atr'].rolling(20).mean().iloc[-1] if 'atr' in df.columns and len(df) >= 20 else 0
    atr_expanding = atr_current > atr_ma if atr_ma > 0 else False

    if vol_regime < 0.8:
        signal = "bullish"  # Low vol regime - potential expansion
        confidence = 0.6
    elif vol_regime > 1.2:
        signal = "bearish"  # High vol regime
        confidence = 0.6
    else:
        signal = "neutral"
        confidence = 0.5

    metrics = {
        "historical_volatility": round(vol * 100, 1),
        "volatility_regime": round(vol_regime, 2)
    }

    if 'atr' in df.columns:
        metrics["atr"] = {
            "value": round(atr_current, 2),
            "ma_20": round(atr_ma, 2),
            "expanding": atr_expanding
        }

    return {
        "signal": signal,
        "confidence": round(confidence, 2),
        "metrics": metrics
    }


def weighted_signal_combination(signals: dict, weights: dict) -> dict:
    """Combine multiple signals with weights."""
    signal_values = {"bullish": 1, "neutral": 0, "bearish": -1}

    weighted_sum = 0
    total_confidence = 0

    for strategy, signal in signals.items():
        numeric_signal = signal_values[signal["signal"]]
        weight = weights.get(strategy, 0.2)
        confidence = signal["confidence"]

        weighted_sum += numeric_signal * weight * confidence
        total_confidence += weight * confidence

    if total_confidence > 0:
        final_score = weighted_sum / total_confidence
    else:
        final_score = 0

    if final_score > 0.2:
        signal = "bullish"
    elif final_score < -0.2:
        signal = "bearish"
    else:
        signal = "neutral"

    return {
        "signal": signal,
        "confidence": round(abs(final_score) * 100),
        "score": round(final_score, 2)
    }


def analyze_technical(symbol: str, start_date: str, end_date: str) -> dict:
    """
    Main function for technical analysis - can be imported by other modules.

    Args:
        symbol: Stock ticker symbol
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format

    Returns:
        Dict with technical analysis signals
    """
    # Try to use vnstock_lib first, fallback to US API
    try:
        df = fetch_quote(symbol, start=start_date, end=end_date)
    except (NameError, ImportError):
        # Fallback to US API
        try:
            from src.tools.api import get_prices
            prices = get_prices(symbol, start_date, end_date)
            if not prices or len(prices) < 20:
                return {"error": "Insufficient price data", "symbol": symbol}

            # Convert to DataFrame
            df = pd.DataFrame([
                {
                    'time': p.time,
                    'open': p.open,
                    'high': p.high,
                    'low': p.low,
                    'close': p.close,
                    'volume': p.volume
                }
                for p in prices
            ])
            df.set_index('time', inplace=True)
        except Exception as e:
            return {"error": f"Failed to fetch price data: {e}", "symbol": symbol}
    except Exception as e:
        return {"error": f"Failed to fetch price data: {e}", "symbol": symbol}

    if df is None or len(df) < 20:
        return {"error": "Insufficient price data", "symbol": symbol}

    # Calculate support/resistance levels
    levels = calculate_support_resistance(df)

    # Calculate all signals
    trend = calculate_trend_signals(df)
    mean_reversion = calculate_mean_reversion_signals(df)
    momentum = calculate_momentum_signals(df)
    volatility = calculate_volatility_signals(df)

    signals = {
        "trend": trend,
        "mean_reversion": mean_reversion,
        "momentum": momentum,
        "volatility": volatility,
    }

    weights = {
        "trend": 0.25,
        "mean_reversion": 0.20,
        "momentum": 0.30,
        "volatility": 0.15,
        "volume": 0.10,
    }

    combined = weighted_signal_combination(signals, weights)

    result = {
        "symbol": symbol,
        "signal": combined["signal"],
        "confidence": combined["confidence"],
        "combined_score": combined["score"],
        "levels": levels,
        "trend_following": trend,
        "mean_reversion": mean_reversion,
        "momentum": momentum,
        "volatility": volatility,
    }

    return result


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: analyze.py SYMBOL START_DATE END_DATE")
        print("Example: analyze.py VCB 2025-02-20 2026-02-20")
        sys.exit(1)

    symbol = sys.argv[1]
    start_date = sys.argv[2]
    end_date = sys.argv[3]

    # Use the main function
    result = analyze_technical(symbol, start_date, end_date)

    if "error" in result:
        print(json.dumps(result))
        sys.exit(1)

    print(json.dumps(result, indent=2, default=str))
