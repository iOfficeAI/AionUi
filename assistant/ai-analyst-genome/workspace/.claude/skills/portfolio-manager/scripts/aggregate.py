#!/usr/bin/env python3
"""Portfolio management - aggregate signals and generate trading decisions."""
import sys
import json


def aggregate_signals(signals: dict) -> dict:
    """Aggregate multiple analyst signals into a consensus."""
    if not signals:
        return {
            "consensus_signal": "hold",
            "confidence": 50,
            "bullish_count": 0,
            "bearish_count": 0,
            "neutral_count": 0,
            "details": "No signals to aggregate"
        }

    bullish_count = 0
    bearish_count = 0
    neutral_count = 0
    total_confidence = 0
    signal_count = 0

    weighted_score = 0

    for analyst, signal_data in signals.items():
        signal = signal_data.get("signal", "neutral")
        confidence = signal_data.get("confidence", 50)

        if signal == "bullish":
            bullish_count += 1
            weighted_score += confidence / 100
        elif signal == "bearish":
            bearish_count += 1
            weighted_score -= confidence / 100
        else:
            neutral_count += 1

        total_confidence += confidence
        signal_count += 1

    avg_confidence = total_confidence / signal_count if signal_count > 0 else 50

    # Determine consensus
    if bullish_count >= 4 and avg_confidence > 70:
        consensus = "strong_buy"
    elif bullish_count >= 3 or (bullish_count >= 2 and avg_confidence > 65):
        consensus = "buy"
    elif bearish_count >= 4 and avg_confidence > 70:
        consensus = "strong_sell"
    elif bearish_count >= 3 or (bearish_count >= 2 and avg_confidence > 65):
        consensus = "sell"
    else:
        consensus = "hold"

    return {
        "consensus_signal": consensus,
        "confidence": round(avg_confidence),
        "bullish_count": bullish_count,
        "bearish_count": bearish_count,
        "neutral_count": neutral_count,
        "weighted_score": round(weighted_score, 2),
        "total_analysts": signal_count
    }


def generate_trading_decision(ticker: str, aggregated: dict, position_limit: float = None,
                              current_price: float = None) -> dict:
    """Generate a trading decision based on aggregated signals."""
    consensus = aggregated["consensus_signal"]
    confidence = aggregated["confidence"]

    # Map consensus to action
    action_map = {
        "strong_buy": "buy",
        "buy": "buy",
        "hold": "hold",
        "sell": "sell",
        "strong_sell": "sell"
    }
    action = action_map.get(consensus, "hold")

    # Calculate quantity if we have position limit and price
    quantity = 0
    if position_limit and current_price and current_price > 0:
        if action in ["buy", "sell"]:
            # Use portion of position limit based on confidence
            confidence_factor = min(confidence / 100, 1.0)
            allocation = position_limit * confidence_factor * 0.5  # Use 50% of limit as base
            quantity = int(allocation / current_price)

    # Generate reasoning
    bullish = aggregated["bullish_count"]
    bearish = aggregated["bearish_count"]
    total = aggregated["total_analysts"]

    if action == "buy":
        reasoning = f"Bullish consensus ({bullish}/{total} analysts) with {confidence}% avg confidence"
    elif action == "sell":
        reasoning = f"Bearish consensus ({bearish}/{total} analysts) with {confidence}% avg confidence"
    else:
        reasoning = f"Mixed signals ({bullish} bullish, {bearish} bearish) - maintaining position"

    return {
        "ticker": ticker,
        "action": action,
        "quantity": quantity,
        "confidence": confidence,
        "reasoning": reasoning,
        "consensus_details": aggregated
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: aggregate.py '{signals_json}' [ticker] [position_limit] [current_price]")
        print("Example: aggregate.py '{\"buffett\": {\"signal\": \"bullish\", \"confidence\": 75}}' AAPL 50000 175")
        sys.exit(1)

    # Parse signals JSON
    try:
        signals = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid signals JSON"}))
        sys.exit(1)

    ticker = sys.argv[2] if len(sys.argv) > 2 else "UNKNOWN"
    position_limit = float(sys.argv[3]) if len(sys.argv) > 3 else None
    current_price = float(sys.argv[4]) if len(sys.argv) > 4 else None

    aggregated = aggregate_signals(signals)
    decision = generate_trading_decision(ticker, aggregated, position_limit, current_price)

    print(json.dumps(decision, indent=2, default=str))
