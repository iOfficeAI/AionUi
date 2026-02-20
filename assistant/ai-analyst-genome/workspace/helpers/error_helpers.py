#!/usr/bin/env python3
"""
Error Helpers — User-Friendly Error Messages
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

Provides user-friendly error messages with recovery paths.
"""

from typing import Dict, Optional, List
from enum import Enum


class ErrorCategory(Enum):
    """Error categories for classification"""
    DATA_ERROR = "data"
    QUERY_ERROR = "query"
    TECHNICAL_ERROR = "technical"
    USER_INPUT_ERROR = "user_input"
    VALIDATION_ERROR = "validation"


class ErrorCode(Enum):
    """Error codes for logging"""
    # Data errors (E001-E099)
    E001_DATA_NOT_FOUND = "E001"
    E002_DATA_STALE = "E002"
    E003_DATA_CORRUPT = "E003"
    E004_SOURCE_UNAVAILABLE = "E004"
    E005_SYMBOL_INVALID = "E005"
    E006_DATE_RANGE_INVALID = "E006"

    # Query errors (E100-E199)
    E101_QUERY_TOO_COMPLEX = "E101"
    E102_QUERY_AMBIGUOUS = "E102"
    E103_METRIC_UNDEFINED = "E103"
    E104_INSUFFICIENT_DATA = "E104"

    # Technical errors (E200-E299)
    E201_API_TIMEOUT = "E201"
    E202_API_RATE_LIMIT = "E202"
    E203_CACHE_ERROR = "E203"
    E204_SYSTEM_ERROR = "E204"

    # User input errors (E300-E399)
    E301_INVALID_SYMBOL = "E301"
    E302_INVALID_DATE = "E302"
    E303_MISSING_PARAMETER = "E303"

    # Validation errors (E400-E499)
    E401_QUALITY_FAIL = "E401"
    E402_SIMPSONS_PARADOX = "E402"
    E403_CONFIDENCE_TOO_LOW = "E403"
    E404_CHART_DATA_MISMATCH = "E404"


def format_error(
    error_code: ErrorCode,
    context: Optional[Dict] = None,
    suggestions: Optional[List[str]] = None
) -> str:
    """
    Format user-friendly error message with recovery paths.

    Args:
        error_code: ErrorCode enum value
        context: Additional context (e.g., symbol, date, value)
        suggestions: Recovery suggestions

    Returns:
        Formatted error message string

    Example:
        >>> format_error(
        ...     ErrorCode.E001_DATA_NOT_FOUND,
        ...     context={"symbol": "XYZ", "date": "2026-02-21"},
        ...     suggestions=["Check if symbol is valid", "Try a different date range"]
        ... )
        "⚠️ DATA NOT FOUND (E001): No data available for XYZ on 2026-02-21.

        → Try:
        - Check if symbol is valid
        - Try a different date range"
    """
    if context is None:
        context = {}
    if suggestions is None:
        suggestions = _get_default_suggestions(error_code)

    # Map error codes to user-friendly messages
    messages = {
        ErrorCode.E001_DATA_NOT_FOUND: "DATA NOT FOUND: No data available for {symbol} on {date}.",
        ErrorCode.E002_DATA_STALE: "DATA STALE: Latest data is {age} old (expected <{max_age}).",
        ErrorCode.E003_DATA_CORRUPT: "DATA CORRUPT: Data quality check failed for {symbol}.",
        ErrorCode.E004_SOURCE_UNAVAILABLE: "SOURCE UNAVAILABLE: {source} is currently unavailable.",
        ErrorCode.E005_SYMBOL_INVALID: "INVALID SYMBOL: '{symbol}' is not a valid Vietnamese stock symbol.",
        ErrorCode.E006_DATE_RANGE_INVALID: "INVALID DATE RANGE: Start date {start} is after end date {end}.",

        ErrorCode.E101_QUERY_TOO_COMPLEX: "QUERY TOO COMPLEX: This query requires L5 strategic analysis (estimated {time}).",
        ErrorCode.E102_QUERY_AMBIGUOUS: "QUERY AMBIGUOUS: Please clarify if you want {option1} or {option2}.",
        ErrorCode.E103_METRIC_UNDEFINED: "METRIC UNDEFINED: '{metric}' is not a registered metric.",
        ErrorCode.E104_INSUFFICIENT_DATA: "INSUFFICIENT DATA: Only {count} data points available (need ≥{min_count}).",

        ErrorCode.E201_API_TIMEOUT: "API TIMEOUT: Data source timed out after {timeout}s.",
        ErrorCode.E202_API_RATE_LIMIT: "API RATE LIMIT: Exceeded rate limit ({limit} requests/minute).",
        ErrorCode.E203_CACHE_ERROR: "CACHE ERROR: Failed to read/write cache.",
        ErrorCode.E204_SYSTEM_ERROR: "SYSTEM ERROR: {details}",

        ErrorCode.E301_INVALID_SYMBOL: "INVALID INPUT: '{symbol}' is not a valid symbol format (expected 3-4 letters).",
        ErrorCode.E302_INVALID_DATE: "INVALID INPUT: '{date}' is not a valid date (expected YYYY-MM-DD).",
        ErrorCode.E303_MISSING_PARAMETER: "MISSING INPUT: Required parameter '{param}' not provided.",

        ErrorCode.E401_QUALITY_FAIL: "QUALITY FAIL: Data quality score {score} is below threshold ({threshold}).",
        ErrorCode.E402_SIMPSONS_PARADOX: "SIMPSON'S PARADOX: Aggregate trend reverses in {pct}% of subgroups.",
        ErrorCode.E403_CONFIDENCE_TOO_LOW: "CONFIDENCE TOO LOW: Analysis confidence {score} ({grade}) is below acceptable level (C).",
        ErrorCode.E404_CHART_DATA_MISMATCH: "CHART-DATA MISMATCH: Chart values deviate {pct}% from raw data (max 2%).",
    }

    template = messages.get(error_code, "UNKNOWN ERROR ({code}): {details}")
    message = template.format(code=error_code.value, **context)

    # Format with icon and suggestions
    formatted = f"⚠️ {message}\n"
    if suggestions:
        formatted += "\n→ Try:\n"
        for suggestion in suggestions:
            formatted += f"  - {suggestion}\n"

    return formatted.strip()


def _get_default_suggestions(error_code: ErrorCode) -> List[str]:
    """Get default recovery suggestions for error code"""
    suggestions_map = {
        ErrorCode.E001_DATA_NOT_FOUND: [
            "Check if symbol is valid (use /data-sources to browse)",
            "Try a different date range",
            "Verify the stock is not delisted"
        ],
        ErrorCode.E002_DATA_STALE: [
            "Use /cache refresh to fetch fresh data",
            "Accept stale data and proceed (confidence will be adjusted)",
            "Try again in a few minutes"
        ],
        ErrorCode.E003_DATA_CORRUPT: [
            "Use /data-quality-check to see detailed report",
            "Try a different data source (KBS/VCI/TCBS)",
            "Contact support if issue persists"
        ],
        ErrorCode.E004_SOURCE_UNAVAILABLE: [
            "Falling back to cache (if available)",
            "Retry in 5 seconds (automatic)",
            "Use /cache to check cached data"
        ],
        ErrorCode.E005_SYMBOL_INVALID: [
            "Use /data-sources to browse valid symbols",
            "Check for typos (e.g., 'VNM' not 'VNM.')",
            "Verify symbol is listed on HOSE/HNX/UPCOM"
        ],
        ErrorCode.E006_DATE_RANGE_INVALID: [
            "Swap start and end dates",
            "Use format YYYY-MM-DD (e.g., 2026-01-01)"
        ],

        ErrorCode.E101_QUERY_TOO_COMPLEX: [
            "Confirm to proceed (will take {time})",
            "Simplify query to L1-L3 for faster results",
            "Break into smaller sub-queries"
        ],
        ErrorCode.E102_QUERY_AMBIGUOUS: [
            "Rephrase query with more specifics",
            "Choose one option explicitly"
        ],
        ErrorCode.E103_METRIC_UNDEFINED: [
            "Use /metric-spec to define custom metric",
            "Use standard metrics: P/E, P/B, ROE, ROA (see /glossary)"
        ],
        ErrorCode.E104_INSUFFICIENT_DATA: [
            "Use a longer date range",
            "Accept smaller sample (confidence will be adjusted)",
            "Try a different symbol with more history"
        ],

        ErrorCode.E201_API_TIMEOUT: [
            "Retrying automatically (3 attempts)",
            "Use cached data instead? (yes/no)",
            "Try again later if issue persists"
        ],
        ErrorCode.E202_API_RATE_LIMIT: [
            "Waiting 5 seconds before retry...",
            "Use cached data instead? (yes/no)",
            "Reduce query frequency"
        ],
        ErrorCode.E203_CACHE_ERROR: [
            "Falling back to direct API query",
            "Clear cache with /cache clear",
            "Contact support if issue persists"
        ],
        ErrorCode.E204_SYSTEM_ERROR: [
            "Retry the operation",
            "Contact support with error details"
        ],

        ErrorCode.E301_INVALID_SYMBOL: [
            "Use /data-sources to browse valid symbols",
            "Check format: 3-4 uppercase letters (e.g., VNM, FPT)"
        ],
        ErrorCode.E302_INVALID_DATE: [
            "Use format YYYY-MM-DD (e.g., 2026-02-21)",
            "Use 'today' or 'yesterday' for relative dates"
        ],
        ErrorCode.E303_MISSING_PARAMETER: [
            "Provide the missing parameter",
            "Use /help [command] to see required parameters"
        ],

        ErrorCode.E401_QUALITY_FAIL: [
            "Review data quality report in _working/validation_report.md",
            "Proceed with caution (confidence will be adjusted)",
            "Try a different data source or date range"
        ],
        ErrorCode.E402_SIMPSONS_PARADOX: [
            "Review segmentation in _working/analysis_report.md",
            "Revise hypothesis to account for subgroup differences",
            "Abort analysis and investigate further"
        ],
        ErrorCode.E403_CONFIDENCE_TOO_LOW: [
            "Review validation report for issues",
            "Refine analysis (automatic, max 2 revisions)",
            "Proceed with low-confidence result (not recommended)"
        ],
        ErrorCode.E404_CHART_DATA_MISMATCH: [
            "Regenerate chart (automatic if <5% deviation)",
            "Review raw data vs chart in _working/design_review.md",
            "Contact support if issue persists"
        ],
    }

    return suggestions_map.get(error_code, ["Contact support with error code"])


def log_error(
    error_code: ErrorCode,
    context: Optional[Dict] = None,
    severity: str = "WARNING"
) -> None:
    """
    Log error to .knowledge/user/error_log.yaml

    Args:
        error_code: ErrorCode enum value
        context: Additional context
        severity: ERROR, WARNING, INFO

    Note: Actual logging implementation in Wave 1
    """
    # TODO: Implement logging to .knowledge/user/error_log.yaml
    # For now, just print to console
    import datetime
    timestamp = datetime.datetime.now().isoformat()
    print(f"[{timestamp}] [{severity}] {error_code.value}: {context}")


# Quick access functions
def data_not_found(symbol: str, date: str) -> str:
    """Shortcut for DATA_NOT_FOUND error"""
    return format_error(
        ErrorCode.E001_DATA_NOT_FOUND,
        context={"symbol": symbol, "date": date}
    )


def symbol_invalid(symbol: str) -> str:
    """Shortcut for SYMBOL_INVALID error"""
    return format_error(
        ErrorCode.E005_SYMBOL_INVALID,
        context={"symbol": symbol}
    )


def simpsons_paradox(pct: int) -> str:
    """Shortcut for SIMPSON'S PARADOX error"""
    return format_error(
        ErrorCode.E402_SIMPSONS_PARADOX,
        context={"pct": pct}
    )


def confidence_too_low(score: int, grade: str) -> str:
    """Shortcut for CONFIDENCE_TOO_LOW error"""
    return format_error(
        ErrorCode.E403_CONFIDENCE_TOO_LOW,
        context={"score": score, "grade": grade}
    )


# Example usage
if __name__ == "__main__":
    # Test error messages
    print(data_not_found("VNM", "2026-02-21"))
    print("\n" + "="*60 + "\n")
    print(symbol_invalid("XYZ"))
    print("\n" + "="*60 + "\n")
    print(simpsons_paradox(75))
    print("\n" + "="*60 + "\n")
    print(confidence_too_low(65, "D"))
