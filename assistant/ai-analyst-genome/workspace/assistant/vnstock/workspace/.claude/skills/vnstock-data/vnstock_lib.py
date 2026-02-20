#!/usr/bin/env python3
"""
Direct vnstock library wrapper - no CLI overhead.

This module provides Python-importable functions for vnstock data access,
eliminating the need for subprocess calls and JSON serialization.

Usage:
    import sys
    sys.path.insert(0, '.')
    from .claude.skills.vnstock_data.vnstock_lib import fetch_quote, fetch_ratios

    # Direct DataFrame access
    prices = fetch_quote('VCB', start='2025-01-01', end='2026-02-20')
    ratios = fetch_ratios('VCB', period='annual')
"""

import pandas as pd
from typing import Optional, List
from datetime import datetime


try:
    from vnstock import Vnstock
except ImportError as e:
    raise ImportError(
        "vnstock library not installed. Run: pip install vnstock>=3.4.2"
    ) from e


# Global Vnstock instance for reuse
_vnstock = Vnstock()


def fetch_quote(
    symbol: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    interval: str = '1D',
    source: str = 'KBS'
) -> pd.DataFrame:
    """
    Fetch historical OHLCV price data.

    Args:
        symbol: Stock ticker (e.g., 'VCB', 'HPG')
        start: Start date in 'YYYY-MM-DD' format
        end: End date in 'YYYY-MM-DD' format
        interval: Data interval ('1D', '1H', '15m', etc.)
        source: Data source ('KBS', 'VCI', 'TCBS')

    Returns:
        DataFrame with columns: time, open, high, low, close, volume

    Example:
        prices = fetch_quote('VCB', start='2025-02-01', end='2026-02-20')
        latest_close = prices['close'].iloc[-1]
    """
    stock = _vnstock.stock(symbol=symbol, source=source)
    df = stock.quote.history(start=start, end=end, interval=interval)

    if df is None or df.empty:
        raise ValueError(f"No price data found for {symbol}")

    return df


def fetch_balance_sheet(
    symbol: str,
    period: str = 'annual',
    lang: str = 'en',
    source: str = 'KBS'
) -> pd.DataFrame:
    """
    Fetch balance sheet statement.

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        lang: 'en' or 'vi' (kept for backwards compatibility, not passed to vnstock v3.4.2+)
        source: Data source

    Returns:
        DataFrame with balance sheet line items

    Example:
        bs = fetch_balance_sheet('VCB', period='annual')
        # Note: columns are 'item', 'item_id', '2025-Q4', '2025-Q3', etc.
    """
    stock = _vnstock.stock(symbol=symbol, source=source)
    # vnstock v3.4.2+ doesn't support lang parameter
    df = stock.finance.balance_sheet(period=period)

    if df is None or df.empty:
        raise ValueError(f"No balance sheet data found for {symbol}")

    return df


def fetch_income_statement(
    symbol: str,
    period: str = 'annual',
    lang: str = 'en',
    source: str = 'KBS'
) -> pd.DataFrame:
    """
    Fetch income statement.

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        lang: 'en' or 'vi' (kept for backwards compatibility, not passed to vnstock v3.4.2+)
        source: Data source

    Returns:
        DataFrame with income statement line items

    Example:
        income = fetch_income_statement('VCB', period='quarterly')
        # Note: columns are 'item', 'item_id', '2025-Q4', '2025-Q3', etc.
    """
    stock = _vnstock.stock(symbol=symbol, source=source)
    # vnstock v3.4.2+ doesn't support lang parameter
    df = stock.finance.income_statement(period=period)

    if df is None or df.empty:
        raise ValueError(f"No income statement data found for {symbol}")

    return df


def fetch_cash_flow(
    symbol: str,
    period: str = 'annual',
    lang: str = 'en',
    source: str = 'KBS'
) -> pd.DataFrame:
    """
    Fetch cash flow statement.

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        lang: 'en' or 'vi' (kept for backwards compatibility, not passed to vnstock v3.4.2+)
        source: Data source

    Returns:
        DataFrame with cash flow line items

    Example:
        cf = fetch_cash_flow('VCB', period='annual')
        # Note: columns are 'item', 'item_id', '2025-Q4', '2025-Q3', etc.
    """
    stock = _vnstock.stock(symbol=symbol, source=source)
    # vnstock v3.4.2+ doesn't support lang parameter
    df = stock.finance.cash_flow(period=period)

    if df is None or df.empty:
        raise ValueError(f"No cash flow data found for {symbol}")

    return df


def fetch_ratios(
    symbol: str,
    period: str = 'annual',
    lang: str = 'en',
    source: str = 'KBS'
) -> pd.DataFrame:
    """
    Fetch financial ratios.

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        lang: 'en' or 'vi' (kept for backwards compatibility, not passed to vnstock v3.4.2+)
        source: Data source

    Returns:
        DataFrame with financial ratios (ROE, ROA, P/E, P/B, etc.)

    Example:
        ratios = fetch_ratios('VCB', period='annual')
        # Note: columns are 'item', 'item_id', '2025-Q4', '2025-Q3', etc.
        # Access values: ratios.loc[ratios['item'] == 'ROE', '2025-Q4'].values[0]
    """
    stock = _vnstock.stock(symbol=symbol, source=source)
    # vnstock v3.4.2+ doesn't support lang parameter
    df = stock.finance.ratio(period=period)

    if df is None or df.empty:
        raise ValueError(f"No ratio data found for {symbol}")

    return df


def fetch_price_board(
    symbols: List[str],
    source: str = 'KBS'
) -> pd.DataFrame:
    """
    Fetch real-time price board with bid/ask data.

    Args:
        symbols: List of stock tickers (e.g., ['VCB', 'TCB', 'VPB'])
        source: Data source

    Returns:
        DataFrame with real-time bid/ask/last prices

    Example:
        board = fetch_price_board(['VCB', 'TCB', 'VPB'])
        vcb_price = board.loc[board['symbol'] == 'VCB', 'last'].values[0]
    """
    if not symbols:
        raise ValueError("Symbol list cannot be empty")

    stock = _vnstock.stock(symbol=symbols[0], source=source)
    df = stock.trading.price_board(symbols_list=','.join(symbols))

    if df is None or df.empty:
        raise ValueError(f"No price board data found for {symbols}")

    return df


def list_symbols(
    exchange: Optional[str] = None,
    industry: Optional[str] = None,
    group: Optional[str] = None,
    source: str = 'KBS'
) -> pd.DataFrame:
    """
    List stock symbols with optional filters.

    Args:
        exchange: Filter by exchange ('HOSE', 'HNX', 'UPCOM')
        industry: Filter by industry code
        group: Filter by group (e.g., 'VN30', 'VN100')
        source: Data source

    Returns:
        DataFrame with stock symbols and metadata
        Note: symbols_by_group() may return a Series instead of DataFrame

    Example:
        # Get VN30 constituents
        vn30 = list_symbols(group='VN30')
        # If Series, convert: symbols = vn30.tolist()
        # If DataFrame, extract: symbols = vn30['ticker'].tolist()

        # Get banking stocks
        banks = list_symbols(industry='BANKS')
    """
    stock = _vnstock.stock(symbol='VCB', source=source)  # Dummy symbol for listing
    listing = stock.listing

    if group:
        result = listing.symbols_by_group(group=group)
    elif exchange:
        result = listing.symbols_by_exchange(exchange=exchange)
    elif industry:
        result = listing.symbols_by_industries(industry_code=industry)
    else:
        result = listing.all_symbols()

    # Handle both Series and DataFrame returns
    if result is None:
        raise ValueError(f"No symbols found for filters: exchange={exchange}, industry={industry}, group={group}")

    # Convert Series to DataFrame for consistent interface
    if isinstance(result, pd.Series):
        if result.empty:
            raise ValueError(f"No symbols found for filters: exchange={exchange}, industry={industry}, group={group}")
        # Convert Series to DataFrame with 'ticker' column
        df = pd.DataFrame({'ticker': result.values})
    else:
        if result.empty:
            raise ValueError(f"No symbols found for filters: exchange={exchange}, industry={industry}, group={group}")
        df = result

    return df


def fetch_financial_data(
    symbol: str,
    period: str = 'annual',
    lang: str = 'en',
    source: str = 'KBS'
) -> dict:
    """
    Fetch all financial statements at once (convenience function).

    Args:
        symbol: Stock ticker
        period: 'annual' or 'quarterly'
        lang: 'en' or 'vi' (kept for backwards compatibility, not passed to vnstock v3.4.2+)
        source: Data source

    Returns:
        Dictionary with keys: 'balance_sheet', 'income_statement', 'cash_flow', 'ratios'

    Example:
        data = fetch_financial_data('VCB', period='annual')
        # Note: all DataFrames have columns 'item', 'item_id', '2025-Q4', etc.
        # Access values: data['ratios'].loc[data['ratios']['item'] == 'ROE', '2025-Q4'].values[0]
    """
    return {
        'balance_sheet': fetch_balance_sheet(symbol, period, lang, source),
        'income_statement': fetch_income_statement(symbol, period, lang, source),
        'cash_flow': fetch_cash_flow(symbol, period, lang, source),
        'ratios': fetch_ratios(symbol, period, lang, source)
    }


def calculate_returns(
    symbol: str,
    start: str,
    end: str,
    periods: Optional[List[str]] = None,
    source: str = 'KBS'
) -> pd.DataFrame:
    """
    Calculate returns over multiple periods.

    Args:
        symbol: Stock ticker
        start: Start date
        end: End date
        periods: List of period labels (e.g., ['1M', '3M', '6M', '12M'])
        source: Data source

    Returns:
        DataFrame with return calculations

    Example:
        returns = calculate_returns('VCB', '2025-02-20', '2026-02-20', ['1M', '3M', '12M'])
        return_12m = returns.loc[returns['period'] == '12M', 'return'].values[0]
    """
    prices = fetch_quote(symbol, start, end, interval='1D', source=source)

    if prices.empty:
        raise ValueError(f"No price data for {symbol}")

    prices = prices.sort_index()

    if periods is None:
        periods = ['1M', '3M', '6M', '12M']

    period_days = {
        '1M': 21,
        '3M': 63,
        '6M': 126,
        '12M': 252
    }

    results = []
    for period in periods:
        if period not in period_days:
            continue

        days = period_days[period]
        if len(prices) <= days:
            continue

        start_price = prices['close'].iloc[-days - 1]
        end_price = prices['close'].iloc[-1]
        period_return = (end_price / start_price) - 1

        results.append({
            'period': period,
            'days': days,
            'start_price': start_price,
            'end_price': end_price,
            'return': period_return
        })

    return pd.DataFrame(results)


if __name__ == '__main__':
    # Test functions
    print("Testing vnstock_lib functions...\n")

    # Test quote
    print("1. Fetching VCB price data...")
    try:
        prices = fetch_quote('VCB', start='2026-01-01', end='2026-02-20')
        print(f"   Fetched {len(prices)} price records")
        print(f"   Latest close: {prices['close'].iloc[-1]:,.0f} VND")
        print(f"   Columns: {prices.columns.tolist()}\n")
    except Exception as e:
        print(f"   Price fetch failed: {e}\n")

    # Test ratios
    print("2. Fetching VCB financial ratios...")
    try:
        ratios = fetch_ratios('VCB', period='annual')
        print(f"   Fetched {len(ratios)} ratio metrics")
        print(f"   Columns: {ratios.columns.tolist()}")
        if 'item' in ratios.columns:
            print(f"   Sample items: {ratios['item'].head(5).tolist()}")
            # Show how to access a specific ratio value
            if len(ratios) > 0:
                period_cols = [col for col in ratios.columns if col not in ['item', 'item_id']]
                if period_cols:
                    first_period = period_cols[0]
                    print(f"   Example: {ratios['item'].iloc[0]} ({first_period}): {ratios[first_period].iloc[0]}")
        print()
    except Exception as e:
        print(f"   Ratios fetch failed: {e}\n")

    # Test VN30 listing
    print("3. Fetching VN30 constituents...")
    try:
        vn30 = list_symbols(group='VN30')
        print(f"   Found {len(vn30)} VN30 stocks")
        print(f"   Columns: {vn30.columns.tolist()}")
        if 'ticker' in vn30.columns:
            symbols = vn30['ticker'].head(10).tolist()
            print(f"   First 10 symbols: {', '.join(symbols)}\n")
    except Exception as e:
        print(f"   VN30 listing failed: {e}\n")

    # Test income statement
    print("4. Fetching VCB income statement...")
    try:
        income = fetch_income_statement('VCB', period='quarterly')
        print(f"   Fetched {len(income)} income statement items")
        print(f"   Columns: {income.columns.tolist()}")
        if 'item' in income.columns:
            print(f"   Sample items: {income['item'].head(3).tolist()}")
        print()
    except Exception as e:
        print(f"   Income statement failed: {e}\n")

    # Test balance sheet
    print("5. Fetching VCB balance sheet...")
    try:
        bs = fetch_balance_sheet('VCB', period='annual')
        print(f"   Fetched {len(bs)} balance sheet items")
        print(f"   Columns: {bs.columns.tolist()}")
        if 'item' in bs.columns:
            print(f"   Sample items: {bs['item'].head(3).tolist()}")
        print()
    except Exception as e:
        print(f"   Balance sheet failed: {e}\n")

    # Test cash flow
    print("6. Fetching VCB cash flow...")
    try:
        cf = fetch_cash_flow('VCB', period='annual')
        print(f"   Fetched {len(cf)} cash flow items")
        print(f"   Columns: {cf.columns.tolist()}")
        if 'item' in cf.columns:
            print(f"   Sample items: {cf['item'].head(3).tolist()}")
        print()
    except Exception as e:
        print(f"   Cash flow failed: {e}\n")

    print("All tests completed!")
