#!/usr/bin/env python3
"""
Unified Data API Bridge for Vietnamese Stock Market Analyst.

Bridges the object-based API interface expected by analysis scripts
(get_financial_metrics, get_prices, get_market_cap, search_line_items)
to the vnstock DataFrame-based backend.

This module translates vnstock DataFrame responses into attribute-accessible
objects compatible with the analysis scripts copied from vnstock assistant.
"""

import os
import sys
import math
from datetime import datetime, timedelta
from typing import Optional, List, Any

import pandas as pd

# Resolve workspace root and add to path
_WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_HELPERS_PATH = os.path.join(_WORKSPACE_ROOT, 'helpers')
_VNSTOCK_LIB_PATH = os.path.join(_WORKSPACE_ROOT, '.claude', 'skills', 'vnstock-data')

for _p in [_WORKSPACE_ROOT, _HELPERS_PATH, _VNSTOCK_LIB_PATH]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from vnstock_helpers import (
        fetch_quote,
        fetch_ratios,
        fetch_balance_sheet,
        fetch_income_statement,
        fetch_cash_flow,
        fetch_price_board,
    )
except ImportError:
    from vnstock_lib import (
        fetch_quote,
        fetch_ratios,
        fetch_balance_sheet,
        fetch_income_statement,
        fetch_cash_flow,
        fetch_price_board,
    )


class DataRecord:
    """Generic attribute-accessible data object.

    Provides dot-notation access (record.field_name) matching the interface
    expected by analysis scripts from the vnstock assistant.
    """

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

    def __repr__(self):
        fields = ', '.join(f'{k}={v!r}' for k, v in vars(self).items()
                           if not k.startswith('_'))
        return f'DataRecord({fields})'

    def model_dump(self):
        return {k: v for k, v in vars(self).items() if not k.startswith('_')}


# ---------------------------------------------------------------------------
# Mapping: vnstock ratio item names -> attribute names
# ---------------------------------------------------------------------------

RATIO_NAME_MAP = {
    # Profitability
    'roe': 'return_on_equity',
    'return on equity': 'return_on_equity',
    'roa': 'return_on_assets',
    'return on assets': 'return_on_assets',
    'net profit margin': 'net_margin',
    'net margin': 'net_margin',
    'biên lợi nhuận ròng': 'net_margin',
    'operating margin': 'operating_margin',
    'biên lợi nhuận hoạt động': 'operating_margin',
    'gross margin': 'gross_margin',
    'gross profit margin': 'gross_margin',
    'biên lợi nhuận gộp': 'gross_margin',

    # Valuation
    'p/e': 'price_to_earnings_ratio',
    'pe': 'price_to_earnings_ratio',
    'price to earning': 'price_to_earnings_ratio',
    'price to earnings': 'price_to_earnings_ratio',
    'p/b': 'price_to_book_ratio',
    'pb': 'price_to_book_ratio',
    'price to book': 'price_to_book_ratio',
    'p/s': 'price_to_sales_ratio',
    'ps': 'price_to_sales_ratio',
    'price to sales': 'price_to_sales_ratio',
    'ev/ebitda': 'ev_to_ebitda',

    # Growth
    'revenue growth': 'revenue_growth',
    'tăng trưởng doanh thu': 'revenue_growth',
    'earnings growth': 'earnings_growth',
    'eps growth': 'earnings_growth',
    'tăng trưởng eps': 'earnings_growth',
    'book value growth': 'book_value_growth',

    # Per-share
    'eps': 'earnings_per_share',
    'earnings per share': 'earnings_per_share',
    'bvps': 'book_value_per_share',
    'book value per share': 'book_value_per_share',
    'fcf per share': 'free_cash_flow_per_share',

    # Leverage
    'debt to equity': 'debt_to_equity',
    'd/e': 'debt_to_equity',
    'current ratio': 'current_ratio',

    # Cash flow
    'fcf yield': 'free_cash_flow_yield',
    'free cash flow yield': 'free_cash_flow_yield',
    'dividend yield': 'dividend_yield',

    # Market
    'market cap': 'market_cap',
    'market capitalization': 'market_cap',
    'vốn hóa': 'market_cap',
}

# ---------------------------------------------------------------------------
# Mapping: vnstock financial statement item names -> attribute names
# ---------------------------------------------------------------------------

FINANCIAL_ITEM_MAP = {
    # Income statement
    'revenue': 'revenue',
    'total revenue': 'revenue',
    'doanh thu thuần': 'revenue',
    'net revenue': 'revenue',
    'gross profit': 'gross_profit',
    'lợi nhuận gộp': 'gross_profit',
    'operating profit': 'operating_income',
    'operating income': 'operating_income',
    'net income': 'net_income',
    'net profit': 'net_income',
    'lợi nhuận sau thuế': 'net_income',
    'profit after tax': 'net_income',
    'earnings per share': 'earnings_per_share',
    'eps': 'earnings_per_share',
    'lãi cơ bản trên cổ phiếu': 'earnings_per_share',

    # Balance sheet
    'total assets': 'total_assets',
    'tổng tài sản': 'total_assets',
    'total liabilities': 'total_liabilities',
    'tổng nợ': 'total_liabilities',
    'shareholders equity': 'shareholders_equity',
    "shareholders' equity": 'shareholders_equity',
    'vốn chủ sở hữu': 'shareholders_equity',
    'equity': 'shareholders_equity',
    'outstanding shares': 'outstanding_shares',
    'shares outstanding': 'outstanding_shares',
    'số cổ phiếu lưu hành': 'outstanding_shares',

    # Cash flow
    'capital expenditure': 'capital_expenditure',
    'capex': 'capital_expenditure',
    'chi đầu tư tscđ': 'capital_expenditure',
    'depreciation': 'depreciation_and_amortization',
    'depreciation and amortization': 'depreciation_and_amortization',
    'khấu hao': 'depreciation_and_amortization',
    'free cash flow': 'free_cash_flow',
    'fcf': 'free_cash_flow',
    'dividends paid': 'dividends_and_other_cash_distributions',
    'dividend paid': 'dividends_and_other_cash_distributions',
    'cổ tức đã trả': 'dividends_and_other_cash_distributions',
    'share repurchase': 'issuance_or_purchase_of_equity_shares',
    'stock issuance': 'issuance_or_purchase_of_equity_shares',
}


def _safe_float(value) -> Optional[float]:
    """Convert a value to float, returning None on failure."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _get_period_columns(df: pd.DataFrame) -> list:
    """Extract period columns from a vnstock DataFrame (exclude item/item_id)."""
    return [c for c in df.columns if c not in ('item', 'item_id', 'Unnamed: 0')]


def _match_item(item_name: str, mapping: dict) -> Optional[str]:
    """Find the attribute name for a vnstock item name using fuzzy matching."""
    if not item_name:
        return None
    lower = item_name.strip().lower()
    if lower in mapping:
        return mapping[lower]
    for key, attr in mapping.items():
        if key in lower or lower in key:
            return attr
    return None


def _df_to_ratio_dict(ratios_df: pd.DataFrame, period_col: str) -> dict:
    """Convert a vnstock ratios DataFrame column into an attribute dictionary."""
    result = {}
    for _, row in ratios_df.iterrows():
        item_name = str(row.get('item', ''))
        attr_name = _match_item(item_name, RATIO_NAME_MAP)
        if attr_name:
            result[attr_name] = _safe_float(row.get(period_col))
    return result


def _df_to_financial_dict(
    income_df: pd.DataFrame,
    balance_df: pd.DataFrame,
    cashflow_df: pd.DataFrame,
    period_col: str,
) -> dict:
    """Convert vnstock financial statement DataFrames into a flat attribute dict."""
    result = {}
    for df in [income_df, balance_df, cashflow_df]:
        if df is None or df.empty:
            continue
        if period_col not in df.columns:
            continue
        for _, row in df.iterrows():
            item_name = str(row.get('item', ''))
            attr_name = _match_item(item_name, FINANCIAL_ITEM_MAP)
            if attr_name and attr_name not in result:
                result[attr_name] = _safe_float(row.get(period_col))
    return result


# ---------------------------------------------------------------------------
# Public API Functions
# ---------------------------------------------------------------------------


def get_financial_metrics(
    ticker: str,
    end_date: str,
    period: str = 'ttm',
    limit: int = 10,
) -> list:
    """Fetch financial metrics as a list of DataRecord objects.

    Compatible with the attribute-access pattern used by analysis scripts:
        metrics[0].return_on_equity
        metrics[0].price_to_earnings_ratio

    Args:
        ticker: Stock symbol (e.g., 'VCB')
        end_date: End date (YYYY-MM-DD), used for context
        period: 'ttm', 'annual', or 'quarterly'
        limit: Max number of period records to return

    Returns:
        List of DataRecord objects ordered newest-first, each with attributes:
        return_on_equity, return_on_assets, net_margin, operating_margin,
        gross_margin, price_to_earnings_ratio, price_to_book_ratio,
        price_to_sales_ratio, revenue_growth, earnings_growth,
        earnings_per_share, debt_to_equity, current_ratio,
        free_cash_flow_yield, free_cash_flow_per_share, market_cap,
        report_period, etc.
    """
    vnstock_period = 'quarterly' if period in ('ttm', 'quarterly') else 'annual'

    try:
        ratios_df = fetch_ratios(ticker, period=vnstock_period)
    except Exception:
        return []

    if ratios_df is None or ratios_df.empty:
        return []

    period_cols = _get_period_columns(ratios_df)
    if not period_cols:
        return []

    period_cols = period_cols[:limit]

    records = []
    for pcol in period_cols:
        attrs = _df_to_ratio_dict(ratios_df, pcol)
        attrs['report_period'] = pcol
        attrs['ticker'] = ticker
        records.append(DataRecord(**attrs))

    return records


def get_prices(
    ticker: str,
    start_date: str,
    end_date: str,
) -> list:
    """Fetch historical price data as a list of DataRecord objects.

    Compatible with the attribute-access pattern:
        prices[0].close, prices[0].high, prices[0].volume

    Args:
        ticker: Stock symbol
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)

    Returns:
        List of DataRecord objects with attributes:
        time, open, high, low, close, volume
    """
    try:
        df = fetch_quote(ticker, start=start_date, end=end_date)
    except Exception:
        return []

    if df is None or df.empty:
        return []

    records = []
    for _, row in df.iterrows():
        records.append(DataRecord(
            time=str(row.get('time', row.name)),
            open=_safe_float(row.get('open')),
            high=_safe_float(row.get('high')),
            low=_safe_float(row.get('low')),
            close=_safe_float(row.get('close')),
            volume=_safe_float(row.get('volume')),
        ))

    return records


def get_market_cap(
    ticker: str,
    end_date: str,
) -> Optional[float]:
    """Fetch market capitalization for a stock.

    Attempts to get market cap from ratios data. Falls back to
    calculating from price * outstanding shares.

    Args:
        ticker: Stock symbol
        end_date: Reference date

    Returns:
        Market cap as float (in VND), or None if unavailable
    """
    try:
        ratios_df = fetch_ratios(ticker, period='quarterly')
        if ratios_df is not None and not ratios_df.empty:
            period_cols = _get_period_columns(ratios_df)
            if period_cols:
                for _, row in ratios_df.iterrows():
                    item_lower = str(row.get('item', '')).lower()
                    if 'market cap' in item_lower or 'vốn hóa' in item_lower:
                        val = _safe_float(row.get(period_cols[0]))
                        if val:
                            return val
    except Exception:
        pass

    # Fallback: price * shares outstanding
    try:
        board = fetch_price_board([ticker])
        if board is not None and not board.empty:
            price_row = board.iloc[0]
            price = None
            for col in ['close', 'last', 'match_price', 'price']:
                if col in board.columns:
                    price = _safe_float(price_row[col])
                    if price:
                        break

            if price:
                bs = fetch_balance_sheet(ticker, period='quarterly')
                if bs is not None and not bs.empty:
                    pcols = _get_period_columns(bs)
                    if pcols:
                        for _, row in bs.iterrows():
                            item_lower = str(row.get('item', '')).lower()
                            if 'outstanding' in item_lower or 'lưu hành' in item_lower:
                                shares = _safe_float(row.get(pcols[0]))
                                if shares:
                                    return price * shares
    except Exception:
        pass

    return None


def search_line_items(
    ticker: str,
    line_item_names: list,
    end_date: str,
    period: str = 'ttm',
    limit: int = 10,
) -> list:
    """Search for specific financial line items across statements.

    Returns DataRecord objects with the requested line items as attributes.
    Compatible with: item.net_income, item.free_cash_flow, etc.

    Args:
        ticker: Stock symbol
        line_item_names: List of attribute names to search for
            (e.g., ['net_income', 'free_cash_flow', 'capital_expenditure'])
        end_date: Reference date
        period: 'ttm', 'annual', or 'quarterly'
        limit: Max number of period records

    Returns:
        List of DataRecord objects ordered newest-first, each with
        the requested line item attributes.
    """
    vnstock_period = 'quarterly' if period in ('ttm', 'quarterly') else 'annual'

    income_df = None
    balance_df = None
    cashflow_df = None

    try:
        income_df = fetch_income_statement(ticker, period=vnstock_period)
    except Exception:
        pass
    try:
        balance_df = fetch_balance_sheet(ticker, period=vnstock_period)
    except Exception:
        pass
    try:
        cashflow_df = fetch_cash_flow(ticker, period=vnstock_period)
    except Exception:
        pass

    # Determine available period columns (intersection of all statements)
    all_pcols = set()
    for df in [income_df, balance_df, cashflow_df]:
        if df is not None and not df.empty:
            pcols = _get_period_columns(df)
            if not all_pcols:
                all_pcols = set(pcols)
            else:
                all_pcols &= set(pcols)

    if not all_pcols:
        # Fallback: use union
        for df in [income_df, balance_df, cashflow_df]:
            if df is not None and not df.empty:
                all_pcols |= set(_get_period_columns(df))

    # Sort period columns (newest first)
    sorted_pcols = sorted(all_pcols, reverse=True)[:limit]

    records = []
    for pcol in sorted_pcols:
        attrs = _df_to_financial_dict(income_df, balance_df, cashflow_df, pcol)
        attrs['report_period'] = pcol
        attrs['ticker'] = ticker

        # Ensure all requested line items have a value (even if None)
        for item_name in line_item_names:
            if item_name not in attrs:
                attrs[item_name] = None

        records.append(DataRecord(**attrs))

    return records


def get_company_news(
    ticker: str,
    end_date: str,
    limit: int = 20,
) -> list:
    """Fetch company news headlines.

    Note: vnstock does not provide a news API. This returns an empty list
    with a placeholder. Future implementation should integrate with a
    Vietnamese news API (cafef.vn, vietstock.vn, etc.).

    Args:
        ticker: Stock symbol
        end_date: Reference date
        limit: Max number of articles

    Returns:
        List of DataRecord objects with title, date attributes.
        Currently returns empty list (news API not yet integrated).
    """
    # Placeholder - vnstock does not provide news data
    # TODO: Integrate with Vietnamese financial news APIs
    return []
