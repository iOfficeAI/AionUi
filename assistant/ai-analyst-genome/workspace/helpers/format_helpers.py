#!/usr/bin/env python3
"""
Format Helpers -- Vietnamese Market Output Formatting
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

Provides formatting functions for VND currency, dates (ICT timezone),
bilingual labels, and significant figure rules.
"""

from typing import Optional, Union
from datetime import datetime, timezone, timedelta


# ICT timezone (UTC+7)
ICT = timezone(timedelta(hours=7))


# Bilingual label mapping
BILINGUAL_LABELS = {
    'VN30': 'VN30 (Ro chi so 30 co phieu)',
    'VN100': 'VN100 (Ro chi so 100 co phieu)',
    'HOSE': 'HOSE (So Giao dich Chung khoan TP.HCM)',
    'HNX': 'HNX (So Giao dich Chung khoan Ha Noi)',
    'UPCOM': 'UPCOM (Thi truong Dang ky Giao dich)',
    'P/E': 'P/E (He so gia tren thu nhap)',
    'P/B': 'P/B (He so gia tren gia tri so sach)',
    'ROE': 'ROE (Ty suat sinh loi tren von chu so huu)',
    'ROA': 'ROA (Ty suat sinh loi tren tong tai san)',
    'EPS': 'EPS (Thu nhap tren moi co phieu)',
    'Market Cap': 'Market Cap (Von hoa thi truong)',
    'Revenue': 'Revenue (Doanh thu)',
    'Net Income': 'Net Income (Loi nhuan rong)',
    'Dividend Yield': 'Dividend Yield (Ty suat co tuc)',
    'Volume': 'Volume (Khoi luong giao dich)',
    'PE': 'P/E (He so gia tren thu nhap)',
    'PB': 'P/B (He so gia tren gia tri so sach)',
}


def format_vnd(
    amount: Union[int, float],
    show_suffix: bool = True,
    use_billions: bool = False,
) -> str:
    """
    Format a number as Vietnamese Dong.

    Args:
        amount: Amount in VND
        show_suffix: Include 'VND' suffix
        use_billions: Use 'billion VND' for large amounts

    Returns:
        Formatted string (e.g., "82,500 VND", "245.3 billion VND")

    Examples:
        >>> format_vnd(82500)
        '82,500 VND'
        >>> format_vnd(245300000000, use_billions=True)
        '245.3 billion VND'
    """
    if amount is None:
        return 'N/A'

    amount = float(amount)

    if use_billions and abs(amount) >= 1_000_000_000:
        billions = amount / 1_000_000_000
        formatted = f'{billions:,.1f} billion'
    elif abs(amount) >= 1_000_000_000 and not use_billions:
        # Auto-detect large numbers
        billions = amount / 1_000_000_000
        formatted = f'{billions:,.1f} billion'
    else:
        formatted = f'{amount:,.0f}'

    if show_suffix:
        formatted += ' VND'

    return formatted


def format_percentage(
    value: Union[int, float],
    decimals: int = 1,
    show_sign: bool = False,
) -> str:
    """
    Format a number as percentage.

    Args:
        value: Percentage value (e.g., 15.2 for 15.2%)
        decimals: Number of decimal places
        show_sign: Show + for positive values

    Returns:
        Formatted string (e.g., "15.2%", "+1.8%")
    """
    if value is None:
        return 'N/A'

    value = float(value)
    sign = '+' if show_sign and value > 0 else ''
    return f'{sign}{value:.{decimals}f}%'


def format_ratio(
    value: Union[int, float],
    ratio_type: str = 'pe',
    decimals: Optional[int] = None,
) -> str:
    """
    Format a financial ratio.

    Args:
        value: Ratio value
        ratio_type: 'pe', 'pb', 'roe', 'roa', etc.
        decimals: Override decimal places

    Returns:
        Formatted string (e.g., "15.2x", "1.85x", "18.5%")
    """
    if value is None:
        return 'N/A'

    value = float(value)

    # Default decimals by ratio type
    if decimals is None:
        decimal_map = {
            'pe': 1, 'pb': 2, 'ev_ebitda': 1,
            'roe': 1, 'roa': 1, 'margin': 1,
            'dividend_yield': 1,
        }
        decimals = decimal_map.get(ratio_type, 1)

    # Suffix by ratio type
    pct_types = {'roe', 'roa', 'margin', 'dividend_yield'}
    if ratio_type in pct_types:
        return f'{value:.{decimals}f}%'
    else:
        return f'{value:.{decimals}f}x'


def format_volume(
    volume: Union[int, float],
    abbreviate: bool = False,
) -> str:
    """
    Format trading volume.

    Args:
        volume: Share count
        abbreviate: Use M/K abbreviations

    Returns:
        Formatted string (e.g., "3,245,600", "3.2M")
    """
    if volume is None:
        return 'N/A'

    volume = float(volume)

    if abbreviate:
        if volume >= 1_000_000:
            return f'{volume / 1_000_000:.1f}M'
        elif volume >= 1_000:
            return f'{volume / 1_000:.1f}K'

    return f'{volume:,.0f}'


def format_datetime_ict(
    dt: Optional[datetime] = None,
    fmt: str = 'datetime',
) -> str:
    """
    Format datetime in ICT timezone (UTC+7).

    Args:
        dt: Datetime object (None = now)
        fmt: 'datetime', 'date', 'time', 'relative'

    Returns:
        Formatted string (e.g., "2026-02-21 14:35 ICT")
    """
    if dt is None:
        dt = datetime.now(ICT)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=ICT)
    else:
        dt = dt.astimezone(ICT)

    if fmt == 'date':
        return dt.strftime('%Y-%m-%d')
    elif fmt == 'time':
        return dt.strftime('%H:%M ICT')
    elif fmt == 'relative':
        return format_relative_time(dt)
    else:
        return dt.strftime('%Y-%m-%d %H:%M ICT')


def format_relative_time(dt: datetime) -> str:
    """
    Format datetime as relative time string.

    Args:
        dt: Datetime to compare against now

    Returns:
        Relative time string (e.g., "3 min ago", "2 hours ago")
    """
    now = datetime.now(ICT)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ICT)

    diff = now - dt
    seconds = int(diff.total_seconds())

    if seconds < 60:
        return f'{seconds}s ago'
    elif seconds < 3600:
        minutes = seconds // 60
        return f'{minutes} min ago'
    elif seconds < 86400:
        hours = seconds // 3600
        return f'{hours} hours ago'
    else:
        days = seconds // 86400
        return f'{days} days ago'


def format_change(
    current: Union[int, float],
    previous: Union[int, float],
    as_vnd: bool = True,
) -> str:
    """
    Format price change with absolute and percentage.

    Args:
        current: Current value
        previous: Previous value
        as_vnd: Format values as VND

    Returns:
        Formatted string (e.g., "+1,500 VND (+1.85%)")
    """
    if current is None or previous is None or previous == 0:
        return 'N/A'

    change = float(current) - float(previous)
    change_pct = (change / float(previous)) * 100
    sign = '+' if change > 0 else ''

    if as_vnd:
        return f'{sign}{change:,.0f} VND ({sign}{change_pct:.1f}%)'
    else:
        return f'{sign}{change:,.2f} ({sign}{change_pct:.1f}%)'


def bilingual_label(term: str) -> str:
    """
    Get bilingual label for a market term.

    Args:
        term: English term (e.g., 'P/E', 'HOSE', 'VN30')

    Returns:
        Bilingual label (e.g., "P/E (He so gia tren thu nhap)")
    """
    return BILINGUAL_LABELS.get(term, term)


def format_confidence(score: int, grade: str) -> str:
    """
    Format confidence score with grade.

    Args:
        score: Confidence score 0-100
        grade: Letter grade (A-F)

    Returns:
        Formatted string (e.g., "95 (A)")
    """
    return f'{score} ({grade})'


def grade_from_score(score: int) -> str:
    """
    Convert numeric confidence score to letter grade.

    Args:
        score: Confidence score 0-100

    Returns:
        Letter grade: A, B, C, D, or F
    """
    if score >= 90:
        return 'A'
    elif score >= 80:
        return 'B'
    elif score >= 70:
        return 'C'
    elif score >= 60:
        return 'D'
    else:
        return 'F'


# Module self-test
if __name__ == '__main__':
    print("Testing format_helpers...\n")

    print("1. VND formatting:")
    print(f"   {format_vnd(82500)}")
    print(f"   {format_vnd(1245000)}")
    print(f"   {format_vnd(245300000000, use_billions=True)}")
    print()

    print("2. Percentage formatting:")
    print(f"   {format_percentage(15.2)}")
    print(f"   {format_percentage(1.85, show_sign=True)}")
    print(f"   {format_percentage(-3.7, show_sign=True)}")
    print()

    print("3. Ratio formatting:")
    print(f"   P/E: {format_ratio(15.2, 'pe')}")
    print(f"   P/B: {format_ratio(1.853, 'pb')}")
    print(f"   ROE: {format_ratio(18.5, 'roe')}")
    print()

    print("4. DateTime (ICT):")
    print(f"   {format_datetime_ict()}")
    print(f"   {format_datetime_ict(fmt='date')}")
    print()

    print("5. Bilingual labels:")
    for term in ['P/E', 'HOSE', 'VN30', 'ROE']:
        print(f"   {bilingual_label(term)}")
    print()

    print("6. Change formatting:")
    print(f"   {format_change(82500, 81000)}")
    print(f"   {format_change(78000, 81000)}")
    print()

    print("All tests completed!")
