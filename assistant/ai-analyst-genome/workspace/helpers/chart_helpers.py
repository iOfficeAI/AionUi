#!/usr/bin/env python3
"""
Chart Helpers -- Matplotlib Wrappers with SWD Patterns
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

Provides chart generation functions using Storytelling With Data (SWD) patterns:
declutter, emphasize, annotate. Applies brand tokens from genome_config.yaml.
"""

import os
import numpy as np
import pandas as pd
from typing import Optional, List, Dict, Any, Tuple, Union

try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend
    import matplotlib.pyplot as plt
    import matplotlib.ticker as mticker
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


# Brand tokens from genome_config.yaml
BRAND = {
    'primary': '#1a1a2e',
    'secondary': '#D97706',
    'accent': '#D97706',
    'accent_light': '#F0A060',
    'bg_light': '#F7F6F2',
    'bg_dark': '#1A1A17',
    'positive': '#059669',
    'negative': '#DC2626',
    'text_primary': '#1F2937',
    'text_secondary': '#4B5563',
    'border': '#E5E7EB',
    'chart_palette': ['#D97706', '#DC2626', '#059669', '#6B7280', '#4cc9f0', '#7209b7'],
    'font_heading': 'Inter',
    'font_body': 'Inter',
}

# Output directory
_WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHARTS_DIR = os.path.join(_WORKSPACE_ROOT, '_working', 'charts')
STYLE_FILE = os.path.join(_WORKSPACE_ROOT, 'helpers', 'analytics_chart_style.mplstyle')


def _ensure_chart_dir():
    """Ensure chart output directory exists."""
    os.makedirs(CHARTS_DIR, exist_ok=True)


def _apply_swd_style(ax: 'plt.Axes') -> None:
    """
    Apply SWD (Storytelling With Data) decluttering patterns.
    Removes chart junk, mutes gridlines, emphasizes data.
    """
    # Remove top and right spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    # Mute remaining spines
    ax.spines['bottom'].set_color(BRAND['border'])
    ax.spines['left'].set_color(BRAND['border'])

    # Light gridlines (y-axis only)
    ax.yaxis.grid(True, color=BRAND['border'], linewidth=0.5, alpha=0.5)
    ax.xaxis.grid(False)

    # Tick styling
    ax.tick_params(axis='both', colors=BRAND['text_secondary'], labelsize=10)

    # Background
    ax.set_facecolor(BRAND['bg_light'])


def _add_attribution(fig: 'plt.Figure') -> None:
    """Add AI Analyst Lab attribution footer."""
    fig.text(
        0.99, 0.01,
        'Powered by AI Analyst Lab | aianalystlab.ai',
        ha='right', va='bottom',
        fontsize=7, color=BRAND['text_secondary'],
        style='italic', alpha=0.6,
    )


def vnd_formatter(x: float, _pos: int = 0) -> str:
    """Matplotlib formatter for VND values."""
    if x >= 1_000_000_000:
        return f'{x / 1_000_000_000:.1f}B'
    elif x >= 1_000_000:
        return f'{x / 1_000_000:.1f}M'
    elif x >= 1_000:
        return f'{x / 1_000:.0f}K'
    return f'{x:.0f}'


def pct_formatter(x: float, _pos: int = 0) -> str:
    """Matplotlib formatter for percentage values."""
    return f'{x:.1f}%'


def create_bar_chart(
    data: Dict[str, float],
    title: str = '',
    xlabel: str = '',
    ylabel: str = '',
    highlight_keys: Optional[List[str]] = None,
    highlight_color: Optional[str] = None,
    filename: Optional[str] = None,
    figsize: Tuple[int, int] = (10, 6),
    horizontal: bool = False,
    value_format: str = 'vnd',
) -> Optional[str]:
    """
    Create a bar chart with SWD patterns.

    Args:
        data: Dictionary of {label: value}
        title: Chart title
        xlabel: X-axis label
        ylabel: Y-axis label
        highlight_keys: Keys to highlight with accent color
        highlight_color: Color for highlighted bars (default: accent)
        filename: Output filename (auto-generated if None)
        figsize: Figure size (width, height)
        horizontal: Horizontal bars if True
        value_format: 'vnd', 'pct', or 'number'

    Returns:
        File path of saved chart, or None if matplotlib unavailable
    """
    if not HAS_MATPLOTLIB:
        return None

    _ensure_chart_dir()

    if highlight_color is None:
        highlight_color = BRAND['accent']

    fig, ax = plt.subplots(figsize=figsize)
    _apply_swd_style(ax)

    labels = list(data.keys())
    values = list(data.values())

    # Color: highlight specified keys, mute others
    colors = []
    for label in labels:
        if highlight_keys and label in highlight_keys:
            colors.append(highlight_color)
        else:
            colors.append(BRAND['chart_palette'][3])  # Muted gray

    if horizontal:
        bars = ax.barh(labels, values, color=colors)
    else:
        bars = ax.bar(labels, values, color=colors)

    # Format axis
    if value_format == 'vnd':
        if horizontal:
            ax.xaxis.set_major_formatter(mticker.FuncFormatter(vnd_formatter))
        else:
            ax.yaxis.set_major_formatter(mticker.FuncFormatter(vnd_formatter))
    elif value_format == 'pct':
        if horizontal:
            ax.xaxis.set_major_formatter(mticker.FuncFormatter(pct_formatter))
        else:
            ax.yaxis.set_major_formatter(mticker.FuncFormatter(pct_formatter))

    ax.set_title(title, fontsize=14, fontweight='bold',
                 color=BRAND['primary'], pad=15)
    ax.set_xlabel(xlabel, fontsize=10, color=BRAND['text_secondary'])
    ax.set_ylabel(ylabel, fontsize=10, color=BRAND['text_secondary'])

    _add_attribution(fig)
    plt.tight_layout()

    # Save
    if filename is None:
        filename = f'bar_{title.lower().replace(" ", "_")[:30]}.png'
    filepath = os.path.join(CHARTS_DIR, filename)
    fig.savefig(filepath, dpi=150, bbox_inches='tight',
                facecolor=BRAND['bg_light'])
    plt.close(fig)

    return filepath


def create_line_chart(
    data: Dict[str, pd.Series],
    title: str = '',
    xlabel: str = '',
    ylabel: str = '',
    highlight_series: Optional[List[str]] = None,
    filename: Optional[str] = None,
    figsize: Tuple[int, int] = (12, 6),
    value_format: str = 'vnd',
) -> Optional[str]:
    """
    Create a line chart with SWD patterns.

    Args:
        data: Dictionary of {series_name: pd.Series}
        title: Chart title
        highlight_series: Series names to emphasize
        filename: Output filename
        figsize: Figure size
        value_format: 'vnd', 'pct', or 'number'

    Returns:
        File path of saved chart, or None if matplotlib unavailable
    """
    if not HAS_MATPLOTLIB:
        return None

    _ensure_chart_dir()

    fig, ax = plt.subplots(figsize=figsize)
    _apply_swd_style(ax)

    for i, (name, series) in enumerate(data.items()):
        is_highlighted = highlight_series and name in highlight_series
        color = BRAND['chart_palette'][i % len(BRAND['chart_palette'])]
        linewidth = 2.5 if is_highlighted else 1.0
        alpha = 1.0 if is_highlighted else 0.4

        ax.plot(series.index, series.values, label=name,
                color=color, linewidth=linewidth, alpha=alpha)

    if value_format == 'vnd':
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(vnd_formatter))
    elif value_format == 'pct':
        ax.yaxis.set_major_formatter(mticker.FuncFormatter(pct_formatter))

    ax.set_title(title, fontsize=14, fontweight='bold',
                 color=BRAND['primary'], pad=15)
    ax.set_xlabel(xlabel, fontsize=10, color=BRAND['text_secondary'])
    ax.set_ylabel(ylabel, fontsize=10, color=BRAND['text_secondary'])

    if len(data) > 1:
        ax.legend(frameon=False, fontsize=9, loc='best')

    _add_attribution(fig)
    plt.tight_layout()

    if filename is None:
        filename = f'line_{title.lower().replace(" ", "_")[:30]}.png'
    filepath = os.path.join(CHARTS_DIR, filename)
    fig.savefig(filepath, dpi=150, bbox_inches='tight',
                facecolor=BRAND['bg_light'])
    plt.close(fig)

    return filepath


def create_comparison_table(
    data: pd.DataFrame,
    title: str = '',
    highlight_column: Optional[str] = None,
    filename: Optional[str] = None,
    figsize: Tuple[int, int] = (10, 4),
) -> Optional[str]:
    """
    Create a comparison table as an image (for L2 queries).

    Args:
        data: DataFrame to render as table
        title: Table title
        highlight_column: Column to highlight with accent color
        filename: Output filename
        figsize: Figure size

    Returns:
        File path of saved chart, or None
    """
    if not HAS_MATPLOTLIB:
        return None

    _ensure_chart_dir()

    fig, ax = plt.subplots(figsize=figsize)
    ax.axis('off')

    # Create table
    table = ax.table(
        cellText=data.values,
        colLabels=data.columns,
        rowLabels=data.index if data.index.name else None,
        cellLoc='center',
        loc='center',
    )

    # Style table
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1.2, 1.5)

    # Style headers
    for j in range(len(data.columns)):
        cell = table[0, j]
        cell.set_facecolor(BRAND['primary'])
        cell.set_text_props(color='white', fontweight='bold')

    # Highlight column
    if highlight_column and highlight_column in data.columns:
        col_idx = data.columns.tolist().index(highlight_column)
        for i in range(1, len(data) + 1):
            table[i, col_idx].set_facecolor('#FEF3C7')

    if title:
        ax.set_title(title, fontsize=14, fontweight='bold',
                     color=BRAND['primary'], pad=20)

    _add_attribution(fig)
    plt.tight_layout()

    if filename is None:
        filename = f'table_{title.lower().replace(" ", "_")[:30]}.png'
    filepath = os.path.join(CHARTS_DIR, filename)
    fig.savefig(filepath, dpi=150, bbox_inches='tight',
                facecolor=BRAND['bg_light'])
    plt.close(fig)

    return filepath


def highlight_bar(
    bars: List,
    indices: List[int],
    color: Optional[str] = None,
) -> None:
    """
    Highlight specific bars in an existing bar chart (SWD emphasis pattern).

    Args:
        bars: List of bar patches from ax.bar()
        indices: Bar indices to highlight
        color: Highlight color (default: accent)
    """
    if color is None:
        color = BRAND['accent']

    for i, bar in enumerate(bars):
        if i in indices:
            bar.set_color(color)
            bar.set_alpha(1.0)
        else:
            bar.set_alpha(0.3)


# Module self-test
if __name__ == '__main__':
    print("Testing chart_helpers...\n")

    if not HAS_MATPLOTLIB:
        print("Matplotlib not available, skipping visual tests\n")
    else:
        _ensure_chart_dir()

        # Test bar chart
        print("1. Bar chart:")
        path = create_bar_chart(
            {'VCB': 82500, 'TCB': 45200, 'BID': 52800, 'CTG': 38900},
            title='Bank Stock Prices',
            ylabel='Price',
            highlight_keys=['VCB'],
            value_format='vnd',
        )
        print(f"   Saved: {path}\n")

        # Test line chart
        print("2. Line chart:")
        dates = pd.date_range('2025-01-01', periods=60, freq='B')
        path = create_line_chart(
            {
                'VCB': pd.Series(np.random.uniform(78000, 85000, 60), index=dates),
                'TCB': pd.Series(np.random.uniform(40000, 48000, 60), index=dates),
            },
            title='Price History',
            ylabel='Price',
            highlight_series=['VCB'],
            value_format='vnd',
        )
        print(f"   Saved: {path}\n")

        # Test comparison table
        print("3. Comparison table:")
        df = pd.DataFrame({
            'Symbol': ['VCB', 'TCB'],
            'Price (VND)': ['82,500', '45,200'],
            'P/E': ['15.2x', '8.5x'],
            'ROE': ['18.5%', '22.3%'],
        })
        path = create_comparison_table(
            df, title='VCB vs TCB Comparison',
            highlight_column='P/E',
        )
        print(f"   Saved: {path}\n")

    print("All tests completed!")
