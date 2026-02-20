#!/usr/bin/env python3
"""
VnstockConnectionManager -- Adapter for ConnectionManager Interface
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

Wraps vnstock_lib.py into a standardized ConnectionManager interface
for use by data-sources skill and data-explorer agent.

Usage:
    from vnstock_adapter import VnstockConnectionManager

    mgr = VnstockConnectionManager()
    mgr.connect()
    df = mgr.query({"query_type": "quote", "symbol": "VCB", "start": "2025-01-01", "end": "2025-12-31"})
    mgr.close()
"""

import os
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# vnstock_lib lives in the same directory as this file
# ---------------------------------------------------------------------------
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from vnstock_lib import (
    fetch_quote as _fetch_quote,
    fetch_price_board as _fetch_price_board,
    fetch_balance_sheet as _fetch_balance_sheet,
    fetch_income_statement as _fetch_income_statement,
    fetch_cash_flow as _fetch_cash_flow,
    fetch_ratios as _fetch_ratios,
    list_symbols as _list_symbols,
    calculate_returns as _calculate_returns,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VALID_SOURCES = ["KBS", "VCI", "TCBS"]
DEFAULT_SOURCE = "KBS"

VALID_QUERY_TYPES = [
    "quote",
    "price_board",
    "balance_sheet",
    "income_statement",
    "cash_flow",
    "ratios",
    "symbols",
    "returns",
]

DEFAULT_INTERVAL = "1D"
DEFAULT_PERIOD = "quarter"


# ---------------------------------------------------------------------------
# ConnectionManager Interface
# ---------------------------------------------------------------------------
class VnstockConnectionManager:
    """
    Standardized connection manager for vnstock data platform.

    Implements the ConnectionManager interface expected by the
    data-sources skill and data-explorer agent.

    Attributes:
        source (str): Active data source (KBS, VCI, TCBS).
        connected (bool): Whether the connection is active.
        last_query_at (datetime): Timestamp of last successful query.
    """

    def __init__(self, source: str = DEFAULT_SOURCE):
        """
        Initialize the connection manager.

        Args:
            source: Data source to use. One of KBS, VCI, TCBS.
                    Defaults to KBS (primary source).
        """
        if source not in VALID_SOURCES:
            raise ValueError(
                f"Invalid source '{source}'. Must be one of: {VALID_SOURCES}"
            )
        self.source = source
        self.connected = False
        self.last_query_at: Optional[datetime] = None
        self._query_count = 0

    def connect(self) -> Dict[str, Any]:
        """
        Establish connection to vnstock data platform.

        For vnstock, this is a lightweight check since the library
        manages its own HTTP sessions internally.

        Returns:
            dict: Connection status with keys:
                - status: "connected" or "error"
                - source: Active data source
                - message: Human-readable status message
        """
        try:
            # Validate that vnstock library is importable and functional
            # by doing a lightweight symbols list check
            result = _list_symbols(group="VN30", source=self.source)
            if result is not None and len(result) > 0:
                self.connected = True
                return {
                    "status": "connected",
                    "source": self.source,
                    "message": f"Connected to vnstock ({self.source}). "
                               f"VN30 symbols: {len(result)} found.",
                }
            else:
                self.connected = False
                return {
                    "status": "error",
                    "source": self.source,
                    "message": "vnstock returned empty result for VN30 listing.",
                }
        except Exception as e:
            self.connected = False
            return {
                "status": "error",
                "source": self.source,
                "message": f"Connection failed: {str(e)}",
            }

    def query(self, query_spec: Dict[str, Any]) -> Any:
        """
        Execute a data query against vnstock.

        Args:
            query_spec: Dictionary with query parameters:
                - query_type (str, required): One of VALID_QUERY_TYPES
                - symbol (str): Stock ticker (required for most queries)
                - start (str): Start date "YYYY-MM-DD" (for quotes)
                - end (str): End date "YYYY-MM-DD" (for quotes)
                - interval (str): Data interval, default "1D"
                - period (str): "quarter" or "annual" (for financials)
                - symbols (list): List of tickers (for price_board)
                - source (str): Override default source for this query
                - exchange (str): Exchange filter (for symbols listing)
                - group (str): Group filter e.g. "VN30" (for symbols listing)

        Returns:
            pandas.DataFrame: Query results.

        Raises:
            ValueError: If query_type is invalid or required params missing.
            ConnectionError: If not connected.
            RuntimeError: If query execution fails.
        """
        if not self.connected:
            raise ConnectionError(
                "Not connected. Call connect() first."
            )

        query_type = query_spec.get("query_type")
        if query_type not in VALID_QUERY_TYPES:
            raise ValueError(
                f"Invalid query_type '{query_type}'. "
                f"Must be one of: {VALID_QUERY_TYPES}"
            )

        source = query_spec.get("source", self.source)
        if source not in VALID_SOURCES:
            source = self.source

        try:
            result = self._dispatch_query(query_type, query_spec, source)
            self.last_query_at = datetime.now()
            self._query_count += 1
            return result
        except Exception as e:
            raise RuntimeError(
                f"Query failed ({query_type}): {str(e)}"
            ) from e

    def _dispatch_query(
        self, query_type: str, spec: Dict[str, Any], source: str
    ) -> Any:
        """Route query to appropriate vnstock_lib function."""

        if query_type == "quote":
            symbol = self._require_param(spec, "symbol")
            end = spec.get("end", datetime.now().strftime("%Y-%m-%d"))
            start = spec.get(
                "start",
                (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d"),
            )
            interval = spec.get("interval", DEFAULT_INTERVAL)
            return _fetch_quote(
                symbol=symbol,
                start=start,
                end=end,
                interval=interval,
                source=source,
            )

        elif query_type == "price_board":
            symbols = spec.get("symbols")
            if not symbols:
                symbol = spec.get("symbol")
                if symbol:
                    symbols = [symbol]
                else:
                    raise ValueError(
                        "price_board requires 'symbols' (list) or 'symbol' (str)"
                    )
            return _fetch_price_board(symbols_list=symbols, source=source)

        elif query_type == "balance_sheet":
            symbol = self._require_param(spec, "symbol")
            period = spec.get("period", DEFAULT_PERIOD)
            return _fetch_balance_sheet(
                symbol=symbol, period=period, source=source
            )

        elif query_type == "income_statement":
            symbol = self._require_param(spec, "symbol")
            period = spec.get("period", DEFAULT_PERIOD)
            return _fetch_income_statement(
                symbol=symbol, period=period, source=source
            )

        elif query_type == "cash_flow":
            symbol = self._require_param(spec, "symbol")
            period = spec.get("period", DEFAULT_PERIOD)
            return _fetch_cash_flow(
                symbol=symbol, period=period, source=source
            )

        elif query_type == "ratios":
            symbol = self._require_param(spec, "symbol")
            period = spec.get("period", DEFAULT_PERIOD)
            return _fetch_ratios(
                symbol=symbol, period=period, source=source
            )

        elif query_type == "symbols":
            exchange = spec.get("exchange")
            group = spec.get("group")
            industry = spec.get("industry")
            return _list_symbols(
                exchange=exchange,
                industry=industry,
                group=group,
                source=source,
            )

        elif query_type == "returns":
            symbol = self._require_param(spec, "symbol")
            end = spec.get("end", datetime.now().strftime("%Y-%m-%d"))
            start = spec.get(
                "start",
                (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d"),
            )
            return _calculate_returns(
                symbol=symbol, start=start, end=end, source=source
            )

        else:
            raise ValueError(f"Unhandled query_type: {query_type}")

    def switch_source(self, new_source: str) -> Dict[str, str]:
        """
        Switch to a different data source.

        Args:
            new_source: One of KBS, VCI, TCBS.

        Returns:
            dict: Status of source switch.
        """
        if new_source not in VALID_SOURCES:
            raise ValueError(
                f"Invalid source '{new_source}'. Must be one of: {VALID_SOURCES}"
            )
        old_source = self.source
        self.source = new_source
        return {
            "status": "switched",
            "old_source": old_source,
            "new_source": new_source,
            "message": f"Switched from {old_source} to {new_source}",
        }

    def status(self) -> Dict[str, Any]:
        """
        Return current connection status.

        Returns:
            dict: Connection status details.
        """
        return {
            "connected": self.connected,
            "source": self.source,
            "available_sources": VALID_SOURCES,
            "last_query_at": (
                self.last_query_at.isoformat() if self.last_query_at else None
            ),
            "query_count": self._query_count,
        }

    def close(self) -> Dict[str, str]:
        """
        Close the connection.

        For vnstock, this is a lightweight cleanup since the library
        manages its own sessions.

        Returns:
            dict: Disconnection status.
        """
        self.connected = False
        self._query_count = 0
        self.last_query_at = None
        return {
            "status": "disconnected",
            "message": "Connection closed.",
        }

    @staticmethod
    def _require_param(spec: Dict[str, Any], key: str) -> Any:
        """
        Validate that a required parameter exists in query_spec.

        Args:
            spec: Query specification dict.
            key: Required parameter name.

        Returns:
            The parameter value.

        Raises:
            ValueError: If parameter is missing.
        """
        value = spec.get(key)
        if value is None:
            raise ValueError(
                f"Required parameter '{key}' missing from query_spec."
            )
        return value

    def __repr__(self) -> str:
        status = "connected" if self.connected else "disconnected"
        return (
            f"VnstockConnectionManager(source={self.source}, "
            f"status={status}, queries={self._query_count})"
        )
