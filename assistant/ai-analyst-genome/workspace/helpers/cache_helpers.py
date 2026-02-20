#!/usr/bin/env python3
"""
Cache Helpers -- Query Cache + Fallback
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

Provides caching layer for vnstock API responses using Parquet files.
Supports TTL-based invalidation and fallback to stale cache.
"""

import os
import hashlib
import json
import pandas as pd
from typing import Optional, Dict, Any, Callable
from datetime import datetime, timedelta

# Cache configuration
_WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(_WORKSPACE_ROOT, 'data', 'cache')
STATIC_DIR = os.path.join(_WORKSPACE_ROOT, 'data', 'static')

# TTL defaults (in minutes)
TTL_DEFAULTS = {
    'real_time': 5,       # Real-time price board
    'quote': 60,          # Daily OHLCV
    'balance_sheet': 1440,  # 24 hours
    'income_statement': 1440,
    'cash_flow': 1440,
    'ratios': 1440,
    'listings': 10080,    # 7 days
}

# Cache subdirectories
CACHE_SUBDIRS = {
    'quote': 'quotes',
    'real_time': 'quotes',
    'balance_sheet': 'financials',
    'income_statement': 'financials',
    'cash_flow': 'financials',
    'ratios': 'ratios',
    'listings': 'quotes',
}


def _ensure_cache_dirs():
    """Ensure cache directories exist."""
    for subdir in set(CACHE_SUBDIRS.values()):
        path = os.path.join(CACHE_DIR, subdir)
        os.makedirs(path, exist_ok=True)


def _generate_cache_key(
    query_type: str,
    symbol: str = '',
    source: str = 'KBS',
    **params,
) -> str:
    """
    Generate a unique cache key for a query.

    Args:
        query_type: Type of query (quote, ratios, balance_sheet, etc.)
        symbol: Stock symbol
        source: Data source
        **params: Additional parameters (period, interval, etc.)

    Returns:
        Cache key string (used as filename without extension)
    """
    key_parts = [query_type, symbol.upper(), source]
    if params:
        # Sort params for consistent hashing
        params_str = json.dumps(params, sort_keys=True)
        params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
        key_parts.append(params_hash)
    return '_'.join(key_parts)


def _get_cache_path(cache_key: str, query_type: str) -> str:
    """Get full file path for a cache entry."""
    subdir = CACHE_SUBDIRS.get(query_type, 'quotes')
    return os.path.join(CACHE_DIR, subdir, f'{cache_key}.parquet')


def _get_metadata_path(cache_key: str, query_type: str) -> str:
    """Get full file path for cache metadata."""
    subdir = CACHE_SUBDIRS.get(query_type, 'quotes')
    return os.path.join(CACHE_DIR, subdir, f'{cache_key}.meta.json')


def get_cached(
    query_type: str,
    symbol: str = '',
    source: str = 'KBS',
    **params,
) -> Optional[pd.DataFrame]:
    """
    Get cached data if available and not expired.

    Args:
        query_type: Type of query
        symbol: Stock symbol
        source: Data source
        **params: Additional parameters

    Returns:
        DataFrame if cache hit and not expired, None otherwise
    """
    cache_key = _generate_cache_key(query_type, symbol, source, **params)
    cache_path = _get_cache_path(cache_key, query_type)
    meta_path = _get_metadata_path(cache_key, query_type)

    if not os.path.exists(cache_path) or not os.path.exists(meta_path):
        return None

    # Check TTL
    try:
        with open(meta_path, 'r') as f:
            metadata = json.load(f)
        cached_at = datetime.fromisoformat(metadata['cached_at'])
        ttl_minutes = metadata.get('ttl_minutes', TTL_DEFAULTS.get(query_type, 60))
        expires_at = cached_at + timedelta(minutes=ttl_minutes)

        if datetime.now() > expires_at:
            return None  # Cache expired

        return pd.read_parquet(cache_path)
    except Exception:
        return None


def get_cached_stale(
    query_type: str,
    symbol: str = '',
    source: str = 'KBS',
    **params,
) -> Optional[Dict[str, Any]]:
    """
    Get cached data even if expired (for fallback).

    Returns:
        Dictionary with 'data' (DataFrame) and 'metadata' (dict),
        or None if no cache exists at all.
    """
    cache_key = _generate_cache_key(query_type, symbol, source, **params)
    cache_path = _get_cache_path(cache_key, query_type)
    meta_path = _get_metadata_path(cache_key, query_type)

    if not os.path.exists(cache_path):
        return None

    try:
        df = pd.read_parquet(cache_path)
        metadata = {}
        if os.path.exists(meta_path):
            with open(meta_path, 'r') as f:
                metadata = json.load(f)

        cached_at = metadata.get('cached_at', 'unknown')
        return {
            'data': df,
            'metadata': metadata,
            'cached_at': cached_at,
            'is_stale': True,
        }
    except Exception:
        return None


def set_cached(
    df: pd.DataFrame,
    query_type: str,
    symbol: str = '',
    source: str = 'KBS',
    ttl_minutes: Optional[int] = None,
    **params,
) -> str:
    """
    Cache a DataFrame result.

    Args:
        df: Data to cache
        query_type: Type of query
        symbol: Stock symbol
        source: Data source
        ttl_minutes: Override TTL (None = use default)
        **params: Additional parameters

    Returns:
        Cache key string
    """
    _ensure_cache_dirs()

    cache_key = _generate_cache_key(query_type, symbol, source, **params)
    cache_path = _get_cache_path(cache_key, query_type)
    meta_path = _get_metadata_path(cache_key, query_type)

    if ttl_minutes is None:
        ttl_minutes = TTL_DEFAULTS.get(query_type, 60)

    # Write data
    df.to_parquet(cache_path, index=False)

    # Write metadata
    metadata = {
        'cache_key': cache_key,
        'query_type': query_type,
        'symbol': symbol,
        'source': source,
        'params': params,
        'cached_at': datetime.now().isoformat(),
        'ttl_minutes': ttl_minutes,
        'row_count': len(df),
        'columns': df.columns.tolist(),
        'size_bytes': os.path.getsize(cache_path),
    }

    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)

    return cache_key


def cached_query(
    fetch_func: Callable,
    query_type: str,
    symbol: str = '',
    source: str = 'KBS',
    ttl_minutes: Optional[int] = None,
    force_refresh: bool = False,
    allow_stale: bool = True,
    **params,
) -> Dict[str, Any]:
    """
    Execute a query with caching. Main entry point for cache-aware data access.

    Args:
        fetch_func: Function to call if cache miss (returns DataFrame)
        query_type: Type of query
        symbol: Stock symbol
        source: Data source
        ttl_minutes: Override TTL
        force_refresh: Skip cache and fetch fresh data
        allow_stale: Use stale cache if API fails
        **params: Additional parameters passed to fetch_func

    Returns:
        Dictionary with:
        {
            'data': DataFrame,
            'source': 'cache' | 'api' | 'stale_cache' | 'static',
            'cached_at': datetime string,
            'staleness_minutes': float,
            'cache_key': str,
        }
    """
    # Try fresh cache first (unless force_refresh)
    if not force_refresh:
        cached = get_cached(query_type, symbol, source, **params)
        if cached is not None:
            cache_key = _generate_cache_key(query_type, symbol, source, **params)
            meta_path = _get_metadata_path(cache_key, query_type)
            cached_at = datetime.now().isoformat()
            staleness = 0.0
            try:
                with open(meta_path, 'r') as f:
                    meta = json.load(f)
                cached_at = meta['cached_at']
                staleness = (datetime.now() - datetime.fromisoformat(cached_at)).total_seconds() / 60
            except Exception:
                pass
            return {
                'data': cached,
                'source': 'cache',
                'cached_at': cached_at,
                'staleness_minutes': round(staleness, 1),
                'cache_key': cache_key,
            }

    # Try fresh API
    try:
        df = fetch_func()
        cache_key = set_cached(df, query_type, symbol, source, ttl_minutes, **params)
        return {
            'data': df,
            'source': 'api',
            'cached_at': datetime.now().isoformat(),
            'staleness_minutes': 0.0,
            'cache_key': cache_key,
        }
    except Exception as api_error:
        # Fall back to stale cache
        if allow_stale:
            stale = get_cached_stale(query_type, symbol, source, **params)
            if stale is not None:
                cached_at = stale.get('cached_at', 'unknown')
                staleness = 0.0
                if cached_at != 'unknown':
                    try:
                        staleness = (datetime.now() - datetime.fromisoformat(cached_at)).total_seconds() / 60
                    except Exception:
                        pass
                return {
                    'data': stale['data'],
                    'source': 'stale_cache',
                    'cached_at': cached_at,
                    'staleness_minutes': round(staleness, 1),
                    'cache_key': _generate_cache_key(query_type, symbol, source, **params),
                    'warning': f"Using stale cached data (API error: {api_error})",
                }

        # No cache available, raise original error
        raise api_error


def clear_cache(
    category: Optional[str] = None,
    stale_only: bool = False,
) -> Dict[str, int]:
    """
    Clear cached data.

    Args:
        category: 'quotes', 'financials', 'ratios', or None for all
        stale_only: Only clear entries past their TTL

    Returns:
        Dictionary with: removed_files, freed_bytes
    """
    removed = 0
    freed_bytes = 0

    if category:
        dirs = [os.path.join(CACHE_DIR, category)]
    else:
        dirs = [os.path.join(CACHE_DIR, d) for d in set(CACHE_SUBDIRS.values())]

    for cache_subdir in dirs:
        if not os.path.exists(cache_subdir):
            continue

        for filename in os.listdir(cache_subdir):
            filepath = os.path.join(cache_subdir, filename)
            if not os.path.isfile(filepath):
                continue

            if stale_only and filename.endswith('.meta.json'):
                continue

            if stale_only:
                # Check if stale
                meta_path = filepath.replace('.parquet', '.meta.json')
                if os.path.exists(meta_path):
                    try:
                        with open(meta_path, 'r') as f:
                            meta = json.load(f)
                        cached_at = datetime.fromisoformat(meta['cached_at'])
                        ttl = meta.get('ttl_minutes', 60)
                        if datetime.now() < cached_at + timedelta(minutes=ttl):
                            continue  # Still fresh, skip
                    except Exception:
                        pass

            size = os.path.getsize(filepath)
            os.remove(filepath)
            freed_bytes += size
            removed += 1

    return {
        'removed_files': removed,
        'freed_bytes': freed_bytes,
        'freed_mb': round(freed_bytes / 1024 / 1024, 2),
    }


def cache_status() -> Dict[str, Any]:
    """
    Get cache status summary.

    Returns:
        Dictionary with cache statistics
    """
    total_files = 0
    total_bytes = 0
    fresh_count = 0
    stale_count = 0
    categories = {}

    for subdir_name in set(CACHE_SUBDIRS.values()):
        subdir_path = os.path.join(CACHE_DIR, subdir_name)
        if not os.path.exists(subdir_path):
            categories[subdir_name] = {'files': 0, 'bytes': 0}
            continue

        cat_files = 0
        cat_bytes = 0

        for filename in os.listdir(subdir_path):
            filepath = os.path.join(subdir_path, filename)
            if not os.path.isfile(filepath):
                continue

            size = os.path.getsize(filepath)

            if filename.endswith('.parquet'):
                total_files += 1
                cat_files += 1
                total_bytes += size
                cat_bytes += size

                # Check freshness
                meta_path = filepath.replace('.parquet', '.meta.json')
                if os.path.exists(meta_path):
                    try:
                        with open(meta_path, 'r') as f:
                            meta = json.load(f)
                        cached_at = datetime.fromisoformat(meta['cached_at'])
                        ttl = meta.get('ttl_minutes', 60)
                        if datetime.now() < cached_at + timedelta(minutes=ttl):
                            fresh_count += 1
                        else:
                            stale_count += 1
                    except Exception:
                        stale_count += 1

        categories[subdir_name] = {
            'files': cat_files,
            'bytes': cat_bytes,
            'mb': round(cat_bytes / 1024 / 1024, 2),
        }

    return {
        'total_files': total_files,
        'total_bytes': total_bytes,
        'total_mb': round(total_bytes / 1024 / 1024, 2),
        'max_mb': 500,
        'fresh_count': fresh_count,
        'stale_count': stale_count,
        'hit_rate_pct': round(fresh_count / max(total_files, 1) * 100, 1),
        'categories': categories,
    }


# Module self-test
if __name__ == '__main__':
    import numpy as np

    print("Testing cache_helpers...\n")

    _ensure_cache_dirs()

    # Create sample data
    df = pd.DataFrame({
        'time': pd.date_range('2025-01-01', periods=10),
        'close': np.random.uniform(80000, 85000, 10),
        'volume': np.random.randint(1000000, 5000000, 10),
    })

    # Test set/get
    print("1. Cache write:")
    key = set_cached(df, 'quote', 'VCB', 'KBS', interval='1D')
    print(f"   Key: {key}\n")

    print("2. Cache read:")
    result = get_cached('quote', 'VCB', 'KBS', interval='1D')
    print(f"   Found: {result is not None}, Rows: {len(result) if result is not None else 0}\n")

    print("3. Cache status:")
    status = cache_status()
    print(f"   Files: {status['total_files']}, Size: {status['total_mb']} MB\n")

    print("4. Clear stale:")
    result = clear_cache(stale_only=True)
    print(f"   Removed: {result['removed_files']} files\n")

    print("All tests completed!")
