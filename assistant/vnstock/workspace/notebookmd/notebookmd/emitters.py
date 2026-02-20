"""Emitter functions: table, figure, markdown, code, note, kv rendering."""

from __future__ import annotations

from typing import Any, Optional

try:
    import pandas as pd
except ImportError:
    pd = None  # type: ignore


def render_md(text: str) -> str:
    """Render raw markdown text."""
    return text.rstrip() + "\n\n"


def render_note(text: str) -> str:
    """Render a callout / note as a blockquote."""
    return f"> **Note:** {text.strip()}\n\n"


def render_code(source: str, lang: str = "python") -> str:
    """Render a code block with syntax highlighting."""
    return f"```{lang}\n{source.rstrip()}\n```\n\n"


def render_table(
    df_obj: Any,
    name: str = "Table",
    max_rows: int = 30,
) -> str:
    """Render a pandas DataFrame as a markdown table with truncation.

    Args:
        df_obj: A pandas DataFrame (or anything with .to_markdown()).
        name: Section heading for the table.
        max_rows: Maximum rows to display before truncation.

    Returns:
        Markdown string with heading, table, and shape info.
    """
    chunks: list[str] = []
    chunks.append(f"#### {name}\n\n")

    if pd is None:
        chunks.append("> **Note:** pandas not installed; cannot render table.\n\n")
        return "".join(chunks)

    if not hasattr(df_obj, "to_markdown"):
        chunks.append("> **Note:** Object does not support `.to_markdown()`.\n\n")
        return "".join(chunks)

    nrows = len(df_obj)
    ncols = len(df_obj.columns)
    view = df_obj.head(max_rows).copy()

    if nrows > max_rows:
        ellipsis_row = {col: "…" for col in view.columns}
        ellipsis_df = type(df_obj)([ellipsis_row])
        view = type(df_obj)(pd.concat([view, ellipsis_df], ignore_index=True))

    try:
        chunks.append(view.to_markdown(index=False) + "\n\n")
    except TypeError:
        chunks.append(view.to_markdown() + "\n\n")

    chunks.append(f"_shape: {nrows:,} rows × {ncols:,} cols_\n\n")
    return "".join(chunks)


def render_figure(rel_path: str, caption: str = "", filename: str = "") -> str:
    """Render a figure link with optional caption.

    Args:
        rel_path: Relative path to the image file.
        caption: Optional caption text.
        filename: Original filename (used as alt text fallback).

    Returns:
        Markdown image link with caption.
    """
    alt = caption or filename or rel_path
    chunks = [f"![{alt}]({rel_path})\n\n"]
    if caption:
        chunks.append(f"*{caption}*\n\n")
    return "".join(chunks)


def render_kv(data: dict[str, Any], title: str = "Metrics") -> str:
    """Render a key-value dictionary as a markdown table.

    Args:
        data: Dictionary of metric names to values.
        title: Section heading.

    Returns:
        Markdown table with Key and Value columns.
    """
    lines = [f"#### {title}\n\n", "| Key | Value |\n", "| --- | --- |\n"]
    for k, v in data.items():
        lines.append(f"| {k} | {v} |\n")
    lines.append("\n")
    return "".join(lines)


def render_summary(df_obj: Any, title: str = "Data Summary") -> str:
    """Render an auto-generated summary of a DataFrame.

    Includes shape, columns, dtypes, null counts, and basic stats for numeric columns.

    Args:
        df_obj: A pandas DataFrame.
        title: Section heading.

    Returns:
        Markdown summary block.
    """
    if pd is None:
        return "> **Note:** pandas not installed; cannot generate summary.\n\n"

    if not isinstance(df_obj, pd.DataFrame):
        return "> **Note:** Object is not a pandas DataFrame.\n\n"

    chunks: list[str] = []
    chunks.append(f"#### {title}\n\n")

    nrows, ncols = df_obj.shape
    chunks.append(f"- **Shape**: {nrows:,} rows × {ncols:,} cols\n")
    chunks.append(f"- **Columns**: {', '.join(df_obj.columns[:20])}")
    if ncols > 20:
        chunks.append(f" … (+{ncols - 20} more)")
    chunks.append("\n\n")

    # Null counts (top 10)
    null_counts = df_obj.isnull().sum()
    nulls = null_counts[null_counts > 0].sort_values(ascending=False).head(10)
    if len(nulls) > 0:
        chunks.append("**Top null columns:**\n\n")
        chunks.append("| Column | Nulls | % |\n| --- | --- | --- |\n")
        for col, cnt in nulls.items():
            pct = cnt / nrows * 100
            chunks.append(f"| {col} | {cnt:,} | {pct:.1f}% |\n")
        chunks.append("\n")

    # Basic stats for numeric columns
    numeric = df_obj.select_dtypes(include="number")
    if len(numeric.columns) > 0:
        desc = numeric.describe().T[["mean", "std", "min", "max"]].head(10)
        chunks.append("**Numeric stats (top 10):**\n\n")
        try:
            chunks.append(desc.to_markdown() + "\n\n")
        except Exception:
            chunks.append(str(desc) + "\n\n")

    return "".join(chunks)
