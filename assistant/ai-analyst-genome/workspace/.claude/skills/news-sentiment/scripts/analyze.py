#!/usr/bin/env python3
"""News sentiment analysis."""
import sys
import json

sys.path.insert(0, '.')

from src.tools.api import get_company_news


# Simple sentiment keywords
POSITIVE_WORDS = ['beat', 'exceeds', 'surge', 'soar', 'rally', 'growth', 'profit', 'gain',
                  'upgrade', 'bullish', 'strong', 'record', 'success', 'innovative']
NEGATIVE_WORDS = ['miss', 'decline', 'fall', 'drop', 'loss', 'downgrade', 'bearish', 'weak',
                  'concern', 'lawsuit', 'investigation', 'recall', 'layoff', 'cut']


def analyze_headline_sentiment(headline: str) -> str:
    """Simple keyword-based sentiment analysis."""
    headline_lower = headline.lower()

    positive_count = sum(1 for word in POSITIVE_WORDS if word in headline_lower)
    negative_count = sum(1 for word in NEGATIVE_WORDS if word in headline_lower)

    if positive_count > negative_count:
        return "positive"
    elif negative_count > positive_count:
        return "negative"
    else:
        return "neutral"


def analyze_news(ticker: str, end_date: str, limit: int = 20) -> dict:
    """Analyze recent news for sentiment."""
    try:
        news = get_company_news(ticker, end_date, limit)
    except:
        return {
            "signal": "neutral",
            "confidence": 50,
            "news_count": 0,
            "details": "Could not fetch news"
        }

    if not news:
        return {
            "signal": "neutral",
            "confidence": 50,
            "news_count": 0,
            "details": "No recent news found"
        }

    sentiments = {
        "positive": 0,
        "negative": 0,
        "neutral": 0
    }

    headlines = []

    for article in news:
        title = getattr(article, 'title', '') or ''
        if title:
            sentiment = analyze_headline_sentiment(title)
            sentiments[sentiment] += 1
            headlines.append({
                "title": title[:100],
                "sentiment": sentiment
            })

    total = len(headlines)
    if total == 0:
        return {
            "signal": "neutral",
            "confidence": 50,
            "news_count": 0,
            "details": "No headlines to analyze"
        }

    # Calculate sentiment score
    positive_pct = sentiments["positive"] / total
    negative_pct = sentiments["negative"] / total

    if positive_pct > 0.5:
        signal = "bullish"
        confidence = min(85, int(50 + positive_pct * 50))
    elif negative_pct > 0.5:
        signal = "bearish"
        confidence = min(80, int(50 + negative_pct * 50))
    elif positive_pct > negative_pct:
        signal = "bullish"
        confidence = min(70, int(50 + (positive_pct - negative_pct) * 50))
    elif negative_pct > positive_pct:
        signal = "bearish"
        confidence = min(70, int(50 + (negative_pct - positive_pct) * 50))
    else:
        signal = "neutral"
        confidence = 50

    return {
        "signal": signal,
        "confidence": confidence,
        "news_count": total,
        "sentiment_breakdown": sentiments,
        "positive_pct": round(positive_pct * 100, 1),
        "negative_pct": round(negative_pct * 100, 1),
        "sample_headlines": headlines[:5]
    }


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: analyze.py TICKER END_DATE [LIMIT]")
        print("Example: analyze.py AAPL 2024-12-01 20")
        sys.exit(1)

    ticker = sys.argv[1]
    end_date = sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 20

    result = analyze_news(ticker, end_date, limit)
    result["ticker"] = ticker

    print(json.dumps(result, indent=2, default=str))
