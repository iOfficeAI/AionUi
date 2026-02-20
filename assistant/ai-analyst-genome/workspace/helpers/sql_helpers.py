#!/usr/bin/env python3
"""
SQL Helpers — Minimal Stub for Future SQL Warehouse Compatibility
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

IMPORTANT: This module is UNUSED for vnstock data platform.
It is provided as a stub for future SQL warehouse compatibility (e.g., DuckDB, PostgreSQL).

Current data access uses vnstock_lib.py and returns pandas DataFrames directly.
"""


def execute_query(query: str, connection=None):
    """
    Execute SQL query against database.

    UNUSED for vnstock (API-based, not SQL).
    Provided for future SQL warehouse compatibility.

    Args:
        query: SQL query string
        connection: Database connection object

    Raises:
        NotImplementedError: Always (not yet implemented)

    Future Use Cases:
        - DuckDB for local analytics
        - PostgreSQL for data warehouse
        - BigQuery for cloud analytics
    """
    raise NotImplementedError(
        "SQL queries not supported for vnstock data platform. "
        "Use vnstock_helpers.py for data access. "
        "This module is a stub for future SQL warehouse integration."
    )


def build_select_query(
    table: str,
    columns: list = None,
    where: str = None,
    order_by: str = None,
    limit: int = None
) -> str:
    """
    Build SELECT query string.

    UNUSED for vnstock (API-based, not SQL).
    Provided for future SQL warehouse compatibility.

    Args:
        table: Table name
        columns: List of column names (None = SELECT *)
        where: WHERE clause (without 'WHERE' keyword)
        order_by: ORDER BY clause (without 'ORDER BY' keyword)
        limit: LIMIT value

    Returns:
        SQL query string (not executed)

    Raises:
        NotImplementedError: Always (not yet implemented)

    Example (future use):
        >>> build_select_query(
        ...     table='stocks',
        ...     columns=['symbol', 'close', 'volume'],
        ...     where="exchange='HOSE' AND date>='2026-01-01'",
        ...     order_by='date DESC',
        ...     limit=100
        ... )
        "SELECT symbol, close, volume FROM stocks WHERE exchange='HOSE' AND date>='2026-01-01' ORDER BY date DESC LIMIT 100"
    """
    raise NotImplementedError(
        "SQL query building not supported for vnstock data platform. "
        "Use vnstock_helpers.py for data access. "
        "This module is a stub for future SQL warehouse integration."
    )


# Placeholder for future implementations
def insert_query(*args, **kwargs):
    """UNUSED - Future SQL warehouse support"""
    raise NotImplementedError("Not yet implemented")


def update_query(*args, **kwargs):
    """UNUSED - Future SQL warehouse support"""
    raise NotImplementedError("Not yet implemented")


def delete_query(*args, **kwargs):
    """UNUSED - Future SQL warehouse support"""
    raise NotImplementedError("Not yet implemented")


# CONTRACT: Data Platform Agnostic Interface (Future)
# When SQL warehouse support is added, this module will implement:
# - execute_query() → pandas.DataFrame
# - build_select_query() → str (SQL query)
# - transaction support (commit, rollback)
# - connection pooling
# - query parameterization (SQL injection prevention)
#
# For now, all data access goes through:
# - vnstock_helpers.py (wrapper for vnstock_lib.py)
# - cache_helpers.py (cached queries)
# - data_helpers.py (DataFrame profiling)
