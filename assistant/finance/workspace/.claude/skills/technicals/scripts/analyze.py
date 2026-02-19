#!/usr/bin/env python3
"""Technical analysis of stock price data."""
import sys
import json
import math

sys.path.insert(0, '.')

from src.tools.api import get_prices


def calculate_trend_signals(closes: list, highs: list, lows: list) -> dict:
    """Calculate trend following signals."""
    if len(closes) < 55:
        return {"signal": "neutral", "confidence": 0.5, "metrics": {}}

    # Calculate EMAs
    def ema(data, period):
        multiplier = 2 / (period + 1)
        ema_val = sum(data[:period]) / period
        for price in data[period:]:
            ema_val = (price - ema_val) * multiplier + ema_val
        return ema_val

    ema_8 = ema(closes, 8)
    ema_21 = ema(closes, 21)
    ema_55 = ema(closes, 55)

    current_price = closes[-1]

    # Trend direction
    short_trend = current_price > ema_8 > ema_21
    medium_trend = ema_21 > ema_55

    # Simple trend strength (0-1)
    if short_trend and medium_trend:
        signal = "bullish"
        confidence = 0.7
    elif not short_trend and not medium_trend:
        signal = "bearish"
        confidence = 0.7
    else:
        signal = "neutral"
        confidence = 0.5

    return {
        "signal": signal,
        "confidence": confidence,
        "metrics": {
            "ema_8": round(ema_8, 2),
            "ema_21": round(ema_21, 2),
            "ema_55": round(ema_55, 2),
            "price_above_ema21": current_price > ema_21
        }
    }


def calculate_mean_reversion_signals(closes: list) -> dict:
    """Calculate mean reversion signals."""
    if len(closes) < 50:
        return {"signal": "neutral", "confidence": 0.5, "metrics": {}}

    # Z-score from 50-day MA
    ma_50 = sum(closes[-50:]) / 50
    std_50 = (sum((p - ma_50) ** 2 for p in closes[-50:]) / 50) ** 0.5
    z_score = (closes[-1] - ma_50) / std_50 if std_50 > 0 else 0

    # RSI calculation
    def calc_rsi(data, period=14):
        deltas = [data[i] - data[i-1] for i in range(1, len(data))]
        gains = [d if d > 0 else 0 for d in deltas[-period:]]
        losses = [-d if d < 0 else 0 for d in deltas[-period:]]
        avg_gain = sum(gains) / period
        avg_loss = sum(losses) / period
        if avg_loss == 0:
            return 100
        rs = avg_gain / avg_loss
        return 100 - (100 / (1 + rs))

    rsi_14 = calc_rsi(closes, 14)

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

    return {
        "signal": signal,
        "confidence": confidence,
        "metrics": {
            "z_score": round(z_score, 2),
            "rsi_14": round(rsi_14, 1),
            "ma_50": round(ma_50, 2)
        }
    }


def calculate_momentum_signals(closes: list, volumes: list) -> dict:
    """Calculate momentum signals."""
    if len(closes) < 126:
        return {"signal": "neutral", "confidence": 0.5, "metrics": {}}

    # Calculate returns
    returns = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]

    mom_1m = sum(returns[-21:])
    mom_3m = sum(returns[-63:])
    mom_6m = sum(returns[-126:]) if len(returns) >= 126 else sum(returns)

    # Volume momentum
    vol_ma = sum(volumes[-21:]) / 21 if len(volumes) >= 21 else sum(volumes) / len(volumes)
    vol_momentum = volumes[-1] / vol_ma if vol_ma > 0 else 1

    # Momentum score
    momentum_score = 0.4 * mom_1m + 0.3 * mom_3m + 0.3 * mom_6m
    volume_confirm = vol_momentum > 1.0

    if momentum_score > 0.05 and volume_confirm:
        signal = "bullish"
        confidence = min(abs(momentum_score) * 5, 1.0)
    elif momentum_score < -0.05 and volume_confirm:
        signal = "bearish"
        confidence = min(abs(momentum_score) * 5, 1.0)
    else:
        signal = "neutral"
        confidence = 0.5

    return {
        "signal": signal,
        "confidence": confidence,
        "metrics": {
            "momentum_1m": round(mom_1m * 100, 1),
            "momentum_3m": round(mom_3m * 100, 1),
            "momentum_6m": round(mom_6m * 100, 1),
            "volume_momentum": round(vol_momentum, 2)
        }
    }


def calculate_volatility_signals(closes: list) -> dict:
    """Calculate volatility-based signals."""
    if len(closes) < 63:
        return {"signal": "neutral", "confidence": 0.5, "metrics": {}}

    # Daily returns
    returns = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]

    # Historical volatility (21-day, annualized)
    recent_returns = returns[-21:]
    vol = (sum(r ** 2 for r in recent_returns) / len(recent_returns)) ** 0.5 * math.sqrt(252)

    # Volatility regime
    vol_ma = (sum(r ** 2 for r in returns[-63:]) / 63) ** 0.5 * math.sqrt(252)
    vol_regime = vol / vol_ma if vol_ma > 0 else 1

    if vol_regime < 0.8:
        signal = "bullish"  # Low vol regime - potential expansion
        confidence = 0.6
    elif vol_regime > 1.2:
        signal = "bearish"  # High vol regime
        confidence = 0.6
    else:
        signal = "neutral"
        confidence = 0.5

    return {
        "signal": signal,
        "confidence": confidence,
        "metrics": {
            "historical_volatility": round(vol * 100, 1),
            "volatility_regime": round(vol_regime, 2)
        }
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


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: analyze.py TICKER START_DATE END_DATE")
        print("Example: analyze.py AAPL 2024-06-01 2024-12-01")
        sys.exit(1)

    ticker = sys.argv[1]
    start_date = sys.argv[2]
    end_date = sys.argv[3]

    prices = get_prices(ticker, start_date, end_date)

    if not prices or len(prices) < 20:
        print(json.dumps({"error": "Insufficient price data", "ticker": ticker}))
        sys.exit(1)

    closes = [p.close for p in prices if hasattr(p, 'close') and p.close]
    highs = [p.high for p in prices if hasattr(p, 'high') and p.high]
    lows = [p.low for p in prices if hasattr(p, 'low') and p.low]
    volumes = [p.volume for p in prices if hasattr(p, 'volume') and p.volume]

    trend = calculate_trend_signals(closes, highs, lows)
    mean_reversion = calculate_mean_reversion_signals(closes)
    momentum = calculate_momentum_signals(closes, volumes)
    volatility = calculate_volatility_signals(closes)

    signals = {
        "trend": trend,
        "mean_reversion": mean_reversion,
        "momentum": momentum,
        "volatility": volatility,
    }

    weights = {
        "trend": 0.30,
        "mean_reversion": 0.20,
        "momentum": 0.30,
        "volatility": 0.20,
    }

    combined = weighted_signal_combination(signals, weights)

    result = {
        "ticker": ticker,
        "signal": combined["signal"],
        "confidence": combined["confidence"],
        "combined_score": combined["score"],
        "trend_following": trend,
        "mean_reversion": mean_reversion,
        "momentum": momentum,
        "volatility": volatility,
    }

    print(json.dumps(result, indent=2, default=str))
