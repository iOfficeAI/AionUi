#!/usr/bin/env python3
"""
Data Helpers -- DataFrame Profiling & Validation
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

Provides DataFrame profiling, schema validation, null checks,
duplicate detection, and data quality assessment functions.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta


# Expected schemas for different data types
OHLCV_SCHEMA = {
    'required_columns': ['time', 'open', 'high', 'low', 'close', 'volume'],
    'numeric_columns': ['open', 'high', 'low', 'close', 'volume'],
    'datetime_columns': ['time'],
}

FINANCIAL_SCHEMA = {
    'required_columns': ['item', 'item_id'],
    'note': 'Additional columns are period identifiers (e.g., 2025-Q4)',
}

RATIO_SCHEMA = {
    'required_columns': ['item', 'item_id'],
    'note': 'Additional columns are period identifiers (e.g., 2025-Q4)',
}

# Vietnamese market value ranges
VALUE_RANGES = {
    'price': {'min': 0, 'max': 1_000_000, 'unit': 'VND'},
    'volume': {'min': 0, 'max': 1_000_000_000, 'unit': 'shares'},
    'pe_ratio': {'min': -100, 'max': 1000, 'unit': 'x'},
    'pb_ratio': {'min': -10, 'max': 100, 'unit': 'x'},
    'roe': {'min': -100, 'max': 200, 'unit': '%'},
    'roa': {'min': -100, 'max': 100, 'unit': '%'},
}


def check_nulls(
    df: pd.DataFrame,
    critical_columns: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Check for null/missing values in a DataFrame.

    Args:
        df: Input DataFrame
        critical_columns: Columns where nulls are especially problematic

    Returns:
        Dictionary with null analysis:
        {
            'total_rows': int,
            'columns': {col: {'null_count': int, 'null_pct': float}},
            'total_nulls': int,
            'total_null_pct': float,
            'status': 'GREEN' | 'YELLOW' | 'RED',
            'critical_nulls': bool,
        }
    """
    if df.empty:
        return {
            'total_rows': 0,
            'columns': {},
            'total_nulls': 0,
            'total_null_pct': 0.0,
            'status': 'GREEN',
            'critical_nulls': False,
        }

    total_rows = len(df)
    columns = {}
    total_nulls = 0
    critical_nulls = False

    for col in df.columns:
        null_count = int(df[col].isnull().sum())
        null_pct = round(null_count / total_rows * 100, 2)
        columns[col] = {
            'null_count': null_count,
            'null_pct': null_pct,
        }
        total_nulls += null_count

        if critical_columns and col in critical_columns and null_count > 0:
            critical_nulls = True

    total_null_pct = round(total_nulls / (total_rows * len(df.columns)) * 100, 2)

    # Determine status
    max_col_null_pct = max((c['null_pct'] for c in columns.values()), default=0)
    if max_col_null_pct > 5 or critical_nulls:
        status = 'RED'
    elif max_col_null_pct > 1:
        status = 'YELLOW'
    else:
        status = 'GREEN'

    return {
        'total_rows': total_rows,
        'columns': columns,
        'total_nulls': total_nulls,
        'total_null_pct': total_null_pct,
        'status': status,
        'critical_nulls': critical_nulls,
    }


def check_duplicates(
    df: pd.DataFrame,
    subset: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Check for duplicate rows in a DataFrame.

    Args:
        df: Input DataFrame
        subset: Columns to consider for duplicate detection

    Returns:
        Dictionary with duplicate analysis:
        {
            'total_rows': int,
            'duplicate_count': int,
            'duplicate_pct': float,
            'duplicate_indices': list,
            'status': 'GREEN' | 'YELLOW' | 'RED',
        }
    """
    if df.empty:
        return {
            'total_rows': 0,
            'duplicate_count': 0,
            'duplicate_pct': 0.0,
            'duplicate_indices': [],
            'status': 'GREEN',
        }

    duplicates = df.duplicated(subset=subset, keep='first')
    duplicate_count = int(duplicates.sum())
    duplicate_pct = round(duplicate_count / len(df) * 100, 2)
    duplicate_indices = df.index[duplicates].tolist()

    if duplicate_count > 5:
        status = 'RED'
    elif duplicate_count > 0:
        status = 'YELLOW'
    else:
        status = 'GREEN'

    return {
        'total_rows': len(df),
        'duplicate_count': duplicate_count,
        'duplicate_pct': duplicate_pct,
        'duplicate_indices': duplicate_indices[:20],  # Limit to first 20
        'status': status,
    }


def check_schema(
    df: pd.DataFrame,
    expected_schema: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Validate DataFrame schema against expected schema.

    Args:
        df: Input DataFrame
        expected_schema: Dict with 'required_columns' and optional type specs

    Returns:
        Dictionary with schema validation results
    """
    required = expected_schema.get('required_columns', [])
    actual = df.columns.tolist()

    missing = [c for c in required if c not in actual]
    extra = [c for c in actual if c not in required]

    if missing:
        status = 'RED'
    elif extra:
        status = 'YELLOW'
    else:
        status = 'GREEN'

    return {
        'expected_columns': required,
        'actual_columns': actual,
        'missing_columns': missing,
        'extra_columns': extra,
        'status': status,
    }


def check_out_of_range(
    df: pd.DataFrame,
    column: str,
    min_val: Optional[float] = None,
    max_val: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Check for out-of-range values in a specific column.

    Args:
        df: Input DataFrame
        column: Column to check
        min_val: Minimum acceptable value (None = no lower bound)
        max_val: Maximum acceptable value (None = no upper bound)

    Returns:
        Dictionary with out-of-range analysis
    """
    if column not in df.columns:
        return {
            'column': column,
            'status': 'RED',
            'error': f"Column '{column}' not found",
        }

    series = pd.to_numeric(df[column], errors='coerce')
    violations = []

    if min_val is not None:
        below = series[series < min_val]
        for idx in below.index:
            violations.append({
                'index': int(idx) if isinstance(idx, (int, np.integer)) else str(idx),
                'value': float(below[idx]),
                'violation': f"< {min_val}",
            })

    if max_val is not None:
        above = series[series > max_val]
        for idx in above.index:
            violations.append({
                'index': int(idx) if isinstance(idx, (int, np.integer)) else str(idx),
                'value': float(above[idx]),
                'violation': f"> {max_val}",
            })

    count = len(violations)
    if count > 3:
        status = 'RED'
    elif count > 0:
        status = 'YELLOW'
    else:
        status = 'GREEN'

    return {
        'column': column,
        'min_val': min_val,
        'max_val': max_val,
        'violation_count': count,
        'violations': violations[:10],  # Limit to first 10
        'status': status,
    }


def check_temporal_consistency(
    df: pd.DataFrame,
    date_column: str = 'time',
    max_gap_days: int = 5,
) -> Dict[str, Any]:
    """
    Check for temporal consistency (gaps, order).

    Args:
        df: Input DataFrame
        date_column: Name of the datetime column
        max_gap_days: Maximum acceptable gap in trading days

    Returns:
        Dictionary with temporal consistency analysis
    """
    if date_column not in df.columns:
        return {
            'status': 'RED',
            'error': f"Date column '{date_column}' not found",
        }

    dates = pd.to_datetime(df[date_column], errors='coerce').dropna().sort_values()

    if len(dates) < 2:
        return {
            'total_dates': len(dates),
            'gaps': [],
            'is_chronological': True,
            'status': 'GREEN',
        }

    # Check chronological order
    is_chronological = dates.is_monotonic_increasing

    # Find gaps (excluding weekends)
    diffs = dates.diff().dropna()
    gaps = []
    for i, diff in enumerate(diffs):
        gap_days = diff.days
        # Skip normal weekends (2-3 day gaps)
        if gap_days > max_gap_days:
            gap_start = dates.iloc[i]
            gap_end = dates.iloc[i + 1] if i + 1 < len(dates) else None
            gaps.append({
                'start': str(gap_start.date()),
                'end': str(gap_end.date()) if gap_end is not None else None,
                'gap_days': gap_days,
            })

    if not is_chronological or any(g['gap_days'] > 30 for g in gaps):
        status = 'RED'
    elif gaps:
        status = 'YELLOW'
    else:
        status = 'GREEN'

    return {
        'total_dates': len(dates),
        'date_range': {
            'start': str(dates.iloc[0].date()),
            'end': str(dates.iloc[-1].date()),
        },
        'is_chronological': is_chronological,
        'gaps': gaps[:10],  # Limit to first 10
        'gap_count': len(gaps),
        'status': status,
    }


def check_ohlc_consistency(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Check OHLC data consistency: low <= open/close <= high.

    Returns:
        Dictionary with OHLC consistency analysis
    """
    required = ['open', 'high', 'low', 'close']
    missing = [c for c in required if c not in df.columns]
    if missing:
        return {'status': 'RED', 'error': f"Missing columns: {missing}"}

    violations = []

    # Check low <= open <= high
    bad_open = df[(df['open'] < df['low']) | (df['open'] > df['high'])]
    for idx in bad_open.index[:5]:
        violations.append({
            'index': int(idx) if isinstance(idx, (int, np.integer)) else str(idx),
            'type': 'open_out_of_range',
            'open': float(df.loc[idx, 'open']),
            'low': float(df.loc[idx, 'low']),
            'high': float(df.loc[idx, 'high']),
        })

    # Check low <= close <= high
    bad_close = df[(df['close'] < df['low']) | (df['close'] > df['high'])]
    for idx in bad_close.index[:5]:
        violations.append({
            'index': int(idx) if isinstance(idx, (int, np.integer)) else str(idx),
            'type': 'close_out_of_range',
            'close': float(df.loc[idx, 'close']),
            'low': float(df.loc[idx, 'low']),
            'high': float(df.loc[idx, 'high']),
        })

    # Check low <= high
    bad_range = df[df['low'] > df['high']]
    for idx in bad_range.index[:5]:
        violations.append({
            'index': int(idx) if isinstance(idx, (int, np.integer)) else str(idx),
            'type': 'low_above_high',
            'low': float(df.loc[idx, 'low']),
            'high': float(df.loc[idx, 'high']),
        })

    count = len(violations)
    if count > 3:
        status = 'RED'
    elif count > 0:
        status = 'YELLOW'
    else:
        status = 'GREEN'

    return {
        'violation_count': count,
        'violations': violations,
        'status': status,
    }


def auto_fix_nulls(
    df: pd.DataFrame,
    max_consecutive_fill: int = 3,
    columns: Optional[List[str]] = None,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Auto-fix null values by forward-filling up to max_consecutive_fill days.

    Args:
        df: Input DataFrame
        max_consecutive_fill: Max consecutive nulls to fill
        columns: Columns to fix (None = all numeric columns)

    Returns:
        Tuple of (fixed DataFrame, fix report)
    """
    df_fixed = df.copy()
    fixes = {}

    if columns is None:
        columns = df.select_dtypes(include=[np.number]).columns.tolist()

    for col in columns:
        if col not in df_fixed.columns:
            continue
        null_before = int(df_fixed[col].isnull().sum())
        if null_before == 0:
            continue

        # Forward fill with limit
        df_fixed[col] = df_fixed[col].ffill(limit=max_consecutive_fill)
        null_after = int(df_fixed[col].isnull().sum())
        fixed_count = null_before - null_after

        if fixed_count > 0:
            fixes[col] = {
                'nulls_before': null_before,
                'nulls_after': null_after,
                'fixed_count': fixed_count,
                'method': f'forward_fill(limit={max_consecutive_fill})',
            }

    return df_fixed, {
        'total_fixed': sum(f['fixed_count'] for f in fixes.values()),
        'columns_fixed': fixes,
        'method': 'forward_fill',
        'max_consecutive': max_consecutive_fill,
    }


def auto_fix_duplicates(
    df: pd.DataFrame,
    subset: Optional[List[str]] = None,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Remove exact duplicate rows, keeping first occurrence.

    Returns:
        Tuple of (deduplicated DataFrame, fix report)
    """
    before_count = len(df)
    df_fixed = df.drop_duplicates(subset=subset, keep='first')
    after_count = len(df_fixed)
    removed = before_count - after_count

    return df_fixed, {
        'rows_before': before_count,
        'rows_after': after_count,
        'duplicates_removed': removed,
    }


def profile_dataframe(
    df: pd.DataFrame,
    data_type: str = 'ohlcv',
) -> Dict[str, Any]:
    """
    Generate a comprehensive profile of a DataFrame.

    Args:
        df: Input DataFrame
        data_type: 'ohlcv', 'financial', or 'ratio'

    Returns:
        Comprehensive profiling report
    """
    schema_map = {
        'ohlcv': OHLCV_SCHEMA,
        'financial': FINANCIAL_SCHEMA,
        'ratio': RATIO_SCHEMA,
    }
    expected_schema = schema_map.get(data_type, OHLCV_SCHEMA)

    profile = {
        'row_count': len(df),
        'column_count': len(df.columns),
        'columns': df.columns.tolist(),
        'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
        'memory_usage_mb': round(df.memory_usage(deep=True).sum() / 1024 / 1024, 2),
        'null_check': check_nulls(df),
        'duplicate_check': check_duplicates(df),
        'schema_check': check_schema(df, expected_schema),
    }

    # Add numeric column statistics
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    if len(numeric_cols) > 0:
        profile['numeric_summary'] = {}
        for col in numeric_cols:
            profile['numeric_summary'][col] = {
                'min': float(df[col].min()) if not df[col].isnull().all() else None,
                'max': float(df[col].max()) if not df[col].isnull().all() else None,
                'mean': float(df[col].mean()) if not df[col].isnull().all() else None,
                'std': float(df[col].std()) if not df[col].isnull().all() else None,
                'median': float(df[col].median()) if not df[col].isnull().all() else None,
            }

    # Add temporal check for OHLCV data
    if data_type == 'ohlcv' and 'time' in df.columns:
        profile['temporal_check'] = check_temporal_consistency(df, 'time')
        profile['ohlc_consistency'] = check_ohlc_consistency(df)

    return profile


# Module self-test
if __name__ == '__main__':
    print("Testing data_helpers...\n")

    # Create sample OHLCV data
    dates = pd.date_range('2025-01-01', periods=100, freq='B')
    df = pd.DataFrame({
        'time': dates,
        'open': np.random.uniform(80000, 85000, 100),
        'high': np.random.uniform(84000, 87000, 100),
        'low': np.random.uniform(78000, 82000, 100),
        'close': np.random.uniform(80000, 85000, 100),
        'volume': np.random.randint(1000000, 5000000, 100),
    })

    # Inject some nulls
    df.loc[5, 'close'] = np.nan
    df.loc[6, 'close'] = np.nan

    # Inject a duplicate
    df = pd.concat([df, df.iloc[[0]]], ignore_index=True)

    print("1. Check nulls:")
    result = check_nulls(df, critical_columns=['close'])
    print(f"   Status: {result['status']}, Total nulls: {result['total_nulls']}\n")

    print("2. Check duplicates:")
    result = check_duplicates(df)
    print(f"   Status: {result['status']}, Count: {result['duplicate_count']}\n")

    print("3. Check schema:")
    result = check_schema(df, OHLCV_SCHEMA)
    print(f"   Status: {result['status']}, Missing: {result['missing_columns']}\n")

    print("4. Auto-fix nulls:")
    df_fixed, report = auto_fix_nulls(df)
    print(f"   Fixed: {report['total_fixed']} nulls\n")

    print("5. Auto-fix duplicates:")
    df_deduped, report = auto_fix_duplicates(df_fixed)
    print(f"   Removed: {report['duplicates_removed']} duplicates\n")

    print("6. Full profile:")
    profile = profile_dataframe(df, data_type='ohlcv')
    print(f"   Rows: {profile['row_count']}, Columns: {profile['column_count']}")
    print(f"   Memory: {profile['memory_usage_mb']} MB\n")

    print("All tests completed!")
