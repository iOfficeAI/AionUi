#!/usr/bin/env python3
"""
vnstock Helpers -- High-Level Data Access Wrappers
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

Wrapper functions for vnstock_lib.py that add validation, logging,
and error handling on top of raw data access.
"""

import sys
import os
import pandas as pd
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

# Add workspace root to path for imports
_WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_VNSTOCK_LIB_PATH = os.path.join(
    _WORKSPACE_ROOT, '.claude', 'skills', 'vnstock-data'
)
if _VNSTOCK_LIB_PATH not in sys.path:
    sys.path.insert(0, _VNSTOCK_LIB_PATH)

try:
    from vnstock_lib import (
        fetch_quote as _fetch_quote,
        fetch_price_board as _fetch_price_board,
        fetch_balance_sheet as _fetch_balance_sheet,
        fetch_income_statement as _fetch_income_statement,
        fetch_cash_flow as _fetch_cash_flow,
        fetch_ratios as _fetch_ratios,
        fetch_financial_data as _fetch_financial_data,
        calculate_returns as _calculate_returns,
        list_symbols as _list_symbols,
    )
except ImportError as e:
    raise ImportError(
        "Cannot import vnstock_lib. Ensure .claude/skills/vnstock-data/vnstock_lib.py exists. "
        f"Original error: {e}"
    )


# Default configuration
DEFAULT_SOURCE = 'KBS'
FALLBACK_SOURCES = ['KBS', 'VCI', 'TCBS']


def _validate_symbol(symbol: str) -> str:
    """Normalize and validate a stock symbol."""
    if not symbol or not isinstance(symbol, str):
        raise ValueError("Symbol must be a non-empty string")
    symbol = symbol.strip().upper().replace('.', '')
    if not (2 <= len(symbol) <= 5):
        raise ValueError(
            f"Invalid symbol format: '{symbol}' (expected 2-5 uppercase letters)"
        )
    return symbol


def _try_sources(func, *args, sources: Optional[List[str]] = None, **kwargs) -> Any:
    """
    Try calling func with each source in order until one succeeds.
    Provides automatic source fallback.
    """
    if sources is None:
        sources = FALLBACK_SOURCES

    last_error = None
    for source in sources:
        try:
            return func(*args, source=source, **kwargs)
        except Exception as e:
            last_error = e
            continue

    raise last_error


def fetch_quote(
    symbol: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    interval: str = '1D',
    source: str = DEFAULT_SOURCE,
    auto_fallback: bool = True,
) -> pd.DataFrame:
    """
    Fetch historical OHLCV price data with validation and fallback.

    Args:
        symbol: Stock ticker (e.g., 'VCB', 'HPG')
        start: Start date 'YYYY-MM-DD' (default: 1 year ago)
        end: End date 'YYYY-MM-DD' (default: today)
        interval: Data interval ('1D', '1H', '15m')
        source: Data source ('KBS', 'VCI', 'TCBS')
        auto_fallback: Try other sources if primary fails

    Returns:
        DataFrame with columns: time, open, high, low, close, volume
    """
    symbol = _validate_symbol(symbol)

    if end is None:
        end = datetime.now().strftime('%Y-%m-%d')
    if start is None:
        start = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')

    if auto_fallback:
        sources = [source] + [s for s in FALLBACK_SOURCES if s != source]
        return _try_sources(
            _fetch_quote, symbol, start=start, end=end,
            interval=interval, sources=sources
        )
    else:
        return _fetch_quote(symbol, start=start, end=end,
                            interval=interval, source=source)


def fetch_price_board(
    symbols: List[str],
    source: str = DEFAULT_SOURCE,
    auto_fallback: bool = True,
) -> pd.DataFrame:
    """
    Fetch real-time price board with bid/ask data.

    Args:
        symbols: List of stock tickers (e.g., ['VCB', 'TCB'])
        source: Data source
        auto_fallback: Try other sources if primary fails

    Returns:
        DataFrame with real-time bid/ask/last prices
    """
    symbols = [_validate_symbol(s) for s in symbols]

    if auto_fallback:
        sources = [source] + [s for s in FALLBACK_SOURCES if s != source]
        return _try_sources(
            _fetch_price_board, symbols, sources=sources
        )
    else:
        return _fetch_price_board(symbols, source=source)


def fetch_ratios(
    symbol: str,
    period: str = 'annual',
    source: str = DEFAULT_SOURCE,
    auto_fallback: bool = True,
) -> pd.DataFrame:
    """
    Fetch financial ratios (P/E, P/B, ROE, ROA, etc.).

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        source: Data source
        auto_fallback: Try other sources if primary fails

    Returns:
        DataFrame with columns: item, item_id, period_columns...
    """
    symbol = _validate_symbol(symbol)

    if auto_fallback:
        sources = [source] + [s for s in FALLBACK_SOURCES if s != source]
        return _try_sources(
            _fetch_ratios, symbol, period=period, sources=sources
        )
    else:
        return _fetch_ratios(symbol, period=period, source=source)


def fetch_balance_sheet(
    symbol: str,
    period: str = 'annual',
    source: str = DEFAULT_SOURCE,
    auto_fallback: bool = True,
) -> pd.DataFrame:
    """
    Fetch balance sheet statement.

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        source: Data source
        auto_fallback: Try other sources if primary fails

    Returns:
        DataFrame with balance sheet line items
    """
    symbol = _validate_symbol(symbol)

    if auto_fallback:
        sources = [source] + [s for s in FALLBACK_SOURCES if s != source]
        return _try_sources(
            _fetch_balance_sheet, symbol, period=period, sources=sources
        )
    else:
        return _fetch_balance_sheet(symbol, period=period, source=source)


def fetch_income_statement(
    symbol: str,
    period: str = 'annual',
    source: str = DEFAULT_SOURCE,
    auto_fallback: bool = True,
) -> pd.DataFrame:
    """
    Fetch income statement.

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        source: Data source
        auto_fallback: Try other sources if primary fails

    Returns:
        DataFrame with income statement line items
    """
    symbol = _validate_symbol(symbol)

    if auto_fallback:
        sources = [source] + [s for s in FALLBACK_SOURCES if s != source]
        return _try_sources(
            _fetch_income_statement, symbol, period=period, sources=sources
        )
    else:
        return _fetch_income_statement(symbol, period=period, source=source)


def fetch_cash_flow(
    symbol: str,
    period: str = 'annual',
    source: str = DEFAULT_SOURCE,
    auto_fallback: bool = True,
) -> pd.DataFrame:
    """
    Fetch cash flow statement.

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        source: Data source
        auto_fallback: Try other sources if primary fails

    Returns:
        DataFrame with cash flow line items
    """
    symbol = _validate_symbol(symbol)

    if auto_fallback:
        sources = [source] + [s for s in FALLBACK_SOURCES if s != source]
        return _try_sources(
            _fetch_cash_flow, symbol, period=period, sources=sources
        )
    else:
        return _fetch_cash_flow(symbol, period=period, source=source)


def fetch_financial_data(
    symbol: str,
    period: str = 'annual',
    source: str = DEFAULT_SOURCE,
) -> Dict[str, pd.DataFrame]:
    """
    Fetch all financial statements at once.

    Returns:
        Dictionary with keys: 'balance_sheet', 'income_statement',
                              'cash_flow', 'ratios'
    """
    symbol = _validate_symbol(symbol)
    return _fetch_financial_data(symbol, period=period, source=source)


def calculate_returns(
    symbol: str,
    start: str,
    end: str,
    periods: Optional[List[str]] = None,
    source: str = DEFAULT_SOURCE,
) -> pd.DataFrame:
    """
    Calculate returns over multiple periods.

    Returns:
        DataFrame with columns: period, days, start_price, end_price, return
    """
    symbol = _validate_symbol(symbol)
    return _calculate_returns(symbol, start, end, periods=periods, source=source)


def list_symbols(
    exchange: Optional[str] = None,
    industry: Optional[str] = None,
    group: Optional[str] = None,
    source: str = DEFAULT_SOURCE,
) -> pd.DataFrame:
    """
    List stock symbols with optional filters.

    Args:
        exchange: Filter by exchange ('HOSE', 'HNX', 'UPCOM')
        industry: Filter by industry code
        group: Filter by group ('VN30', 'VN100')
        source: Data source

    Returns:
        DataFrame with stock symbols and metadata
    """
    return _list_symbols(exchange=exchange, industry=industry,
                         group=group, source=source)


def get_latest_price(
    symbol: str,
    source: str = DEFAULT_SOURCE,
) -> Dict[str, Any]:
    """
    Get the latest price for a single symbol.
    Convenience function for L1 queries.

    Returns:
        Dictionary with: symbol, price, change, change_pct, volume, timestamp
    """
    symbol = _validate_symbol(symbol)
    board = fetch_price_board([symbol], source=source)

    if board.empty:
        raise ValueError(f"No price data for {symbol}")

    row = board.iloc[0]
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M ICT')

    # Extract fields (column names may vary by source)
    result = {
        'symbol': symbol,
        'timestamp': timestamp,
        'source': source,
    }

    # Try common column names for price data
    for col in board.columns:
        result[col] = row[col]

    return result


def get_ratio_value(
    symbol: str,
    ratio_name: str,
    period: str = 'annual',
    source: str = DEFAULT_SOURCE,
) -> Optional[float]:
    """
    Get a specific ratio value for a symbol.
    Convenience function for L1/L2 queries.

    Args:
        symbol: Stock ticker
        ratio_name: Name of ratio (e.g., 'ROE', 'P/E')
        period: 'annual' or 'quarterly'
        source: Data source

    Returns:
        Latest ratio value as float, or None if not found
    """
    symbol = _validate_symbol(symbol)
    ratios = fetch_ratios(symbol, period=period, source=source)

    if ratios.empty or 'item' not in ratios.columns:
        return None

    # Find matching ratio row (case-insensitive partial match)
    ratio_name_lower = ratio_name.lower()
    matching = ratios[ratios['item'].str.lower().str.contains(ratio_name_lower, na=False)]

    if matching.empty:
        return None

    # Get latest period value (first non-id/item column)
    period_cols = [c for c in ratios.columns if c not in ('item', 'item_id')]
    if not period_cols:
        return None

    value = matching.iloc[0][period_cols[0]]
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


# Module self-test
if __name__ == '__main__':
    print("Testing vnstock_helpers...\n")

    # Test symbol validation
    print("1. Symbol validation:")
    assert _validate_symbol('vcb') == 'VCB'
    assert _validate_symbol(' hpg ') == 'HPG'
    assert _validate_symbol('VNM.') == 'VNM'
    print("   PASS\n")

    # Test data access
    print("2. Fetching VCB latest price...")
    try:
        price = get_latest_price('VCB')
        print(f"   {price}\n")
    except Exception as e:
        print(f"   Error: {e}\n")

    print("3. Fetching VCB P/E ratio...")
    try:
        pe = get_ratio_value('VCB', 'P/E')
        print(f"   P/E = {pe}\n")
    except Exception as e:
        print(f"   Error: {e}\n")

    print("4. Listing VN30 symbols...")
    try:
        vn30 = list_symbols(group='VN30')
        print(f"   Found {len(vn30)} symbols\n")
    except Exception as e:
        print(f"   Error: {e}\n")

    print("All tests completed!")
