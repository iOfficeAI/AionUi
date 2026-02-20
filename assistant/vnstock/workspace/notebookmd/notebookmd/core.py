"""Core Notebook and Cell implementation."""

from __future__ import annotations

import ast
import inspect
import textwrap
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Generator, Literal, Optional, Sequence

from .assets import AssetManager
from .capture import CapturedOutput, capture_streams, render_exception, render_stderr, render_stdout
from .emitters import render_code, render_figure, render_kv, render_md, render_note, render_summary, render_table
from .widgets import (
    render_altair_chart,
    render_area_chart,
    render_audio,
    render_balloons,
    render_bar_chart,
    render_caption,
    render_code_block,
    render_columns_end,
    render_columns_start,
    render_column_separator,
    render_connection_status,
    render_container_end,
    render_container_start,
    render_dataframe,
    render_divider,
    render_echo,
    render_empty,
    render_error,
    render_expander_end,
    render_expander_start,
    render_header,
    render_image,
    render_info,
    render_json,
    render_latex,
    render_line_chart,
    render_metric,
    render_metric_row,
    render_plotly_chart,
    render_progress,
    render_snow,
    render_subheader,
    render_success,
    render_tab_end,
    render_tab_start,
    render_tabs_header,
    render_text,
    render_title,
    render_toast,
    render_video,
    render_warning,
    render_exception as render_widget_exception,
    render_write,
    render_stat,
    render_stats,
    render_badge,
    render_change,
    render_ranking,
)


@dataclass
class NotebookConfig:
    """Configuration for notebook rendering behavior."""

    max_table_rows: int = 30
    echo_to_console: bool = True
    include_code_default: bool = False
    float_format: str = "{:.4f}"


class Notebook:
    """A notebook-like markdown report builder.

    Usage::

        N = Notebook("dist/notebook.md", title="My Analysis")

        with N.cell("Load data", code=True):
            df = pd.read_csv("data.csv")
            N.note(f"Rows: {len(df):,}")
            N.table(df.head(), name="Preview")

        N.save()
    """

    def __init__(
        self,
        out_md: str,
        title: str = "Notebook",
        assets_dir: str | None = None,
        cfg: NotebookConfig | None = None,
    ):
        self.out_path = Path(out_md)
        self.assets_path = Path(assets_dir) if assets_dir else self.out_path.parent / "assets"
        self.title = title
        self.cfg = cfg or NotebookConfig()

        self._asset_mgr = AssetManager(self.assets_path, self.out_path.parent)
        self._started = False
        self._cell_index = 0
        self._chunks: list[str] = []

    def _w(self, s: str) -> None:
        """Append a chunk of markdown to the internal buffer."""
        self._chunks.append(s)

    def _ensure_started(self) -> None:
        """Lazily initialize the notebook header on first use."""
        if self._started:
            return
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self._asset_mgr.ensure_dir()
        self._started = True

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._w(f"# {self.title}\n\n_Generated: {now}_\n\n")
        self._w("## Artifacts\n\n")
        self._w("{{ARTIFACTS_PLACEHOLDER}}\n\n---\n\n")

    # ── Emitters (delegate to emitters module) ──

    def md(self, text: str) -> None:
        """Emit raw markdown text."""
        self._w(render_md(text))

    def note(self, text: str) -> None:
        """Emit a callout / note blockquote."""
        self._w(render_note(text))

    def code(self, source: str, lang: str = "python") -> None:
        """Emit a fenced code block."""
        self._w(render_code(source, lang))

    def table(self, df_obj: Any, name: str = "Table", max_rows: int | None = None) -> None:
        """Emit a DataFrame as a markdown table with truncation."""
        n = max_rows if max_rows is not None else self.cfg.max_table_rows
        self._w(render_table(df_obj, name=name, max_rows=n))

    def figure(self, fig: Any, filename: str, caption: str = "", dpi: int = 160) -> str:
        """Save a matplotlib figure and emit its markdown link.

        Returns:
            Relative path to the saved figure.
        """
        rel = self._asset_mgr.save_figure(fig, filename, dpi=dpi)
        self._w(render_figure(rel, caption=caption, filename=filename))
        return rel

    def kv(self, data: dict[str, Any], title: str = "Metrics") -> None:
        """Emit a key-value metrics table."""
        self._w(render_kv(data, title))

    def summary(self, df_obj: Any, title: str = "Data Summary") -> None:
        """Emit an auto-generated DataFrame summary (shape, nulls, stats)."""
        self._w(render_summary(df_obj, title))

    def export_csv(self, df: Any, filename: str, name: str | None = None) -> str:
        """Save a DataFrame as CSV and link it in the artifacts.

        Returns:
            Relative path to the saved CSV.
        """
        rel = self._asset_mgr.save_csv(df, filename)
        display_name = name or filename
        self._w(f"**Exported:** [{display_name}]({rel})\n\n")
        return rel

    # ── Streamlit-style Data Display ──

    def metric(
        self,
        label: str,
        value: Any,
        delta: Any | None = None,
        delta_color: Literal["normal", "inverse", "off"] = "normal",
    ) -> None:
        """Display a metric card with optional delta indicator (à la st.metric).

        Args:
            label: Short description of the metric.
            value: The primary metric value.
            delta: Optional change from previous value.
            delta_color: "normal" (green up / red down), "inverse", or "off".
        """
        self._w(render_metric(label, value, delta=delta, delta_color=delta_color))

    def metric_row(self, metrics: list[dict[str, Any]]) -> None:
        """Display multiple metrics side-by-side in a single row.

        Args:
            metrics: List of dicts with keys: label, value, delta (optional), delta_color (optional).

        Example::

            N.metric_row([
                {"label": "Revenue", "value": "$1.2M", "delta": "+12%"},
                {"label": "Users", "value": "3,400", "delta": "+200"},
                {"label": "Churn", "value": "2.1%", "delta": "-0.3%", "delta_color": "inverse"},
            ])
        """
        self._w(render_metric_row(metrics))

    def json(self, data: Any, expanded: bool = True) -> None:
        """Display data as formatted JSON (à la st.json).

        Args:
            data: Any JSON-serializable object.
            expanded: If True, pretty-print with indentation.
        """
        self._w(render_json(data, expanded=expanded))

    def dataframe(self, df_obj: Any, name: str = "", max_rows: int | None = None, use_container_width: bool = False) -> None:
        """Display a DataFrame (à la st.dataframe).

        Args:
            df_obj: A pandas DataFrame.
            name: Optional heading for the table.
            max_rows: Maximum rows to display.
            use_container_width: Ignored (API compat with Streamlit).
        """
        n = max_rows if max_rows is not None else self.cfg.max_table_rows
        self._w(render_dataframe(df_obj, name=name, max_rows=n, use_container_width=use_container_width))

    # ── Streamlit-style Chart Widgets ──

    def line_chart(
        self,
        data: Any,
        x: str | None = None,
        y: str | Sequence[str] | None = None,
        title: str = "",
        x_label: str = "",
        y_label: str = "",
        filename: str | None = None,
    ) -> str | None:
        """Display a line chart (à la st.line_chart).

        If matplotlib is available and data is a DataFrame, generates and saves
        an actual chart image. Otherwise, emits chart metadata as markdown.

        Args:
            data: DataFrame or dict-like data.
            x: Column name for x-axis.
            y: Column name(s) for y-axis.
            title: Chart title.
            x_label: X-axis label.
            y_label: Y-axis label.
            filename: Output filename for the chart image.

        Returns:
            Relative path to saved chart image, or None if no image was saved.
        """
        rel = self._try_render_mpl_chart("line", data, x, y, title, x_label, y_label, filename)
        if rel:
            self._w(render_figure(rel, caption=title, filename=rel))
            return rel
        self._w(render_line_chart(data, x=x, y=y, title=title, x_label=x_label, y_label=y_label))
        return None

    def area_chart(
        self,
        data: Any,
        x: str | None = None,
        y: str | Sequence[str] | None = None,
        title: str = "",
        x_label: str = "",
        y_label: str = "",
        filename: str | None = None,
    ) -> str | None:
        """Display an area chart (à la st.area_chart).

        Args:
            data: DataFrame or dict-like data.
            x: Column name for x-axis.
            y: Column name(s) for y-axis.
            title: Chart title.
            x_label: X-axis label.
            y_label: Y-axis label.
            filename: Output filename for the chart image.

        Returns:
            Relative path to saved chart image, or None.
        """
        rel = self._try_render_mpl_chart("area", data, x, y, title, x_label, y_label, filename)
        if rel:
            self._w(render_figure(rel, caption=title, filename=rel))
            return rel
        self._w(render_area_chart(data, x=x, y=y, title=title, x_label=x_label, y_label=y_label))
        return None

    def bar_chart(
        self,
        data: Any,
        x: str | None = None,
        y: str | Sequence[str] | None = None,
        title: str = "",
        x_label: str = "",
        y_label: str = "",
        horizontal: bool = False,
        filename: str | None = None,
    ) -> str | None:
        """Display a bar chart (à la st.bar_chart).

        Args:
            data: DataFrame or dict-like data.
            x: Column name for x-axis.
            y: Column name(s) for y-axis.
            title: Chart title.
            x_label: X-axis label.
            y_label: Y-axis label.
            horizontal: If True, render horizontal bars.
            filename: Output filename for the chart image.

        Returns:
            Relative path to saved chart image, or None.
        """
        rel = self._try_render_mpl_chart(
            "barh" if horizontal else "bar", data, x, y, title, x_label, y_label, filename
        )
        if rel:
            self._w(render_figure(rel, caption=title, filename=rel))
            return rel
        self._w(render_bar_chart(data, x=x, y=y, title=title, x_label=x_label, y_label=y_label, horizontal=horizontal))
        return None

    def plotly_chart(
        self,
        fig: Any,
        filename: str | None = None,
        caption: str = "",
        use_container_width: bool = True,
    ) -> str:
        """Save and display a Plotly figure (à la st.plotly_chart).

        Args:
            fig: A plotly Figure object.
            filename: Output filename (defaults to plotly_N.png).
            caption: Optional caption.
            use_container_width: Ignored (API compat with Streamlit).

        Returns:
            Relative path to the saved chart image.
        """
        fname = filename or f"plotly_{self._cell_index}_{id(fig) % 10000}.png"
        rel = self._asset_mgr.save_plotly(fig, fname)
        self._w(render_plotly_chart(rel, caption=caption, use_container_width=use_container_width))
        return rel

    def altair_chart(
        self,
        chart: Any,
        filename: str | None = None,
        caption: str = "",
        use_container_width: bool = True,
    ) -> str:
        """Save and display an Altair/Vega-Lite chart (à la st.altair_chart).

        Args:
            chart: An altair Chart object.
            filename: Output filename (defaults to altair_N.png).
            caption: Optional caption.
            use_container_width: Ignored (API compat with Streamlit).

        Returns:
            Relative path to the saved chart image.
        """
        fname = filename or f"altair_{self._cell_index}_{id(chart) % 10000}.png"
        rel = self._asset_mgr.save_altair(chart, fname)
        self._w(render_altair_chart(rel, caption=caption, use_container_width=use_container_width))
        return rel

    # ── Streamlit-style Text Elements ──

    def st_title(self, text: str, anchor: str | None = None) -> None:
        """Emit a title heading (à la st.title).

        Args:
            text: Title text.
            anchor: Optional HTML anchor ID.
        """
        self._w(render_title(text, anchor=anchor))

    def st_header(self, text: str, anchor: str | None = None, divider: bool = False) -> None:
        """Emit a header (à la st.header).

        Args:
            text: Header text.
            anchor: Optional HTML anchor ID.
            divider: If True, add a horizontal rule below.
        """
        self._w(render_header(text, anchor=anchor, divider=divider))

    def st_subheader(self, text: str, anchor: str | None = None, divider: bool = False) -> None:
        """Emit a subheader (à la st.subheader).

        Args:
            text: Subheader text.
            anchor: Optional HTML anchor ID.
            divider: If True, add a horizontal rule below.
        """
        self._w(render_subheader(text, anchor=anchor, divider=divider))

    def st_caption(self, text: str) -> None:
        """Emit small caption text (à la st.caption).

        Args:
            text: Caption text.
        """
        self._w(render_caption(text))

    def latex(self, body: str) -> None:
        """Emit a LaTeX math expression (à la st.latex).

        Args:
            body: LaTeX expression string.
        """
        self._w(render_latex(body))

    def text(self, body: str) -> None:
        """Emit fixed-width preformatted text (à la st.text).

        Args:
            body: Plain text to render in monospace.
        """
        self._w(render_text(body))

    def divider(self) -> None:
        """Emit a horizontal divider (à la st.divider)."""
        self._w(render_divider())

    # ── Streamlit-style Status Elements ──

    def success(self, body: str, icon: str = "✅") -> None:
        """Emit a success message (à la st.success).

        Args:
            body: Message text.
            icon: Icon prefix.
        """
        self._w(render_success(body, icon=icon))

    def error(self, body: str, icon: str = "❌") -> None:
        """Emit an error message (à la st.error).

        Args:
            body: Message text.
            icon: Icon prefix.
        """
        self._w(render_error(body, icon=icon))

    def warning(self, body: str, icon: str = "⚠️") -> None:
        """Emit a warning message (à la st.warning).

        Args:
            body: Message text.
            icon: Icon prefix.
        """
        self._w(render_warning(body, icon=icon))

    def info(self, body: str, icon: str = "ℹ️") -> None:
        """Emit an info message (à la st.info).

        Args:
            body: Message text.
            icon: Icon prefix.
        """
        self._w(render_info(body, icon=icon))

    def st_exception(self, exc: Exception) -> None:
        """Display an exception (à la st.exception).

        Args:
            exc: The exception to display.
        """
        self._w(render_widget_exception(exc))

    def progress(self, value: float, text: str = "") -> None:
        """Emit a progress bar (à la st.progress).

        Args:
            value: Progress from 0.0 to 1.0.
            text: Optional label text.
        """
        self._w(render_progress(value, text=text))

    def toast(self, body: str, icon: str = "🔔") -> None:
        """Emit a toast notification (à la st.toast).

        Args:
            body: Toast message.
            icon: Icon prefix.
        """
        self._w(render_toast(body, icon=icon))

    def balloons(self) -> None:
        """Emit a balloons celebration marker (à la st.balloons)."""
        self._w(render_balloons())

    def snow(self) -> None:
        """Emit a snow celebration marker (à la st.snow)."""
        self._w(render_snow())

    # ── Streamlit-style Layout Elements ──

    @contextmanager
    def expander(self, label: str, expanded: bool = False) -> Generator[None, None, None]:
        """Create a collapsible section (à la st.expander).

        Args:
            label: The expander heading.
            expanded: If True, section is open by default.

        Usage::

            with N.expander("Show details"):
                N.md("Hidden content here")
                N.table(df)
        """
        self._w(render_expander_start(label, expanded=expanded))
        yield
        self._w(render_expander_end())

    @contextmanager
    def container(self, border: bool = False) -> Generator[None, None, None]:
        """Create a visual container (à la st.container).

        Args:
            border: If True, add a border (rendered as blockquote).

        Usage::

            with N.container(border=True):
                N.md("Contained content")
        """
        self._w(render_container_start(border=border))
        yield
        self._w(render_container_end(border=border))

    def tabs(self, labels: Sequence[str]) -> _TabGroup:
        """Create a tab group (à la st.tabs).

        Returns a _TabGroup that yields tab context managers.

        Args:
            labels: List of tab labels.

        Usage::

            tabs = N.tabs(["Overview", "Details", "Raw Data"])
            with tabs.tab("Overview"):
                N.metric("Revenue", "$1.2M")
            with tabs.tab("Details"):
                N.table(df)
        """
        self._w(render_tabs_header(labels))
        return _TabGroup(self, labels)

    def columns(self, spec: int | Sequence[float] = 2) -> _ColumnGroup:
        """Create a column layout (à la st.columns).

        Since markdown doesn't support true columns, content is rendered
        sequentially with visual separators.

        Args:
            spec: Number of columns or list of relative widths.

        Usage::

            cols = N.columns(3)
            with cols.col(0):
                N.metric("A", "100")
            with cols.col(1):
                N.metric("B", "200")
        """
        self._w(render_columns_start(spec))
        n = spec if isinstance(spec, int) else len(spec)
        return _ColumnGroup(self, n)

    # ── Streamlit-style Media Elements ──

    def image(
        self,
        source: Any,
        caption: str = "",
        width: int | None = None,
        filename: str | None = None,
    ) -> str:
        """Display an image (à la st.image).

        Supports file paths, URLs, or raw image data (PIL/numpy).

        Args:
            source: File path string, URL, PIL Image, or numpy array.
            caption: Optional caption.
            width: Optional width in pixels.
            filename: Output filename when saving from PIL/numpy.

        Returns:
            Path or URL to the image.
        """
        # If it's a string (path or URL), render directly
        if isinstance(source, str):
            self._w(render_image(source, caption=caption, width=width))
            return source

        # If it's a PIL Image or numpy array, save it
        fname = filename or f"image_{self._cell_index}_{id(source) % 10000}.png"
        rel = self._asset_mgr.save_image(source, fname)
        self._w(render_image(rel, caption=caption, width=width))
        return rel

    def audio(self, source: str, caption: str = "") -> None:
        """Display an audio player link (à la st.audio).

        Args:
            source: Path or URL to the audio file.
            caption: Optional caption.
        """
        self._w(render_audio(source, caption=caption))

    def video(self, source: str, caption: str = "") -> None:
        """Display a video link (à la st.video).

        Args:
            source: Path or URL to the video file.
            caption: Optional caption.
        """
        self._w(render_video(source, caption=caption))

    # ── Streamlit-style Utility ──

    def echo(self, source: str, output: str = "") -> None:
        """Display code and its output together (à la st.echo).

        Args:
            source: The source code.
            output: The output produced by the code.
        """
        self._w(render_echo(source, output=output))

    def empty(self) -> None:
        """Emit an empty placeholder (à la st.empty)."""
        self._w(render_empty())

    def connection_status(
        self,
        name: str,
        status: Literal["connected", "disconnected", "error"] = "connected",
        details: str = "",
    ) -> None:
        """Display a data connection status indicator.

        Args:
            name: Connection name.
            status: Current status.
            details: Optional extra information.
        """
        self._w(render_connection_status(name, status=status, details=details))

    # ── Smart Write / Templating ──

    def write(self, *args: Any) -> None:
        """Auto-format and display any combination of values (à la st.write).

        Type dispatch:
        - str        → markdown text
        - dict       → JSON code block
        - DataFrame  → markdown table
        - int/float  → bold number
        - list/tuple → bullet list
        - Exception  → error callout
        - None       → ``None``
        - other      → ``str(obj)``

        Example::

            N.write("Hello", {"key": "value"}, df, 42)
        """
        self._w(render_write(*args))

    def stat(
        self,
        label: str,
        value: Any,
        description: str = "",
        fmt: str | None = None,
    ) -> None:
        """Display a single-line statistic with bold value and optional context.

        The go-to method for inline data callouts like:
            "Quality z-score: **+1.5** (93rd percentile, top 7%)"

        Args:
            label: Stat name.
            value: The value (auto-formatted if numeric + fmt given).
            description: Optional parenthetical context.
            fmt: Python format spec (e.g. "+.1f", ".2%", ",.0f").

        Examples::

            N.stat("Quality z-score", 1.5, "93rd percentile, top 7%", fmt="+.1f")
            N.stat("P/E Ratio", 15.2)
            N.stat("Return", 0.123, "annualized", fmt=".1%")
        """
        self._w(render_stat(label, value, description=description, fmt=fmt))

    def stats(
        self,
        stats: list[dict[str, Any]],
        separator: str = " · ",
    ) -> None:
        """Display multiple inline stats on one line.

        Args:
            stats: List of dicts with keys: label, value, fmt (opt), description (opt).
            separator: Delimiter between stats.

        Example::

            N.stats([
                {"label": "P/E", "value": 15.2, "fmt": ".1f"},
                {"label": "P/B", "value": 2.8, "fmt": ".1f"},
                {"label": "ROE", "value": 0.221, "fmt": ".1%"},
            ])
            # → "P/E: **15.2** · P/B: **2.8** · ROE: **22.1%**"
        """
        self._w(render_stats(stats, separator=separator))

    def badge(self, text: str, style: str = "default") -> None:
        """Display an inline badge/pill label.

        Args:
            text: Badge text (e.g. "BULLISH", "HOLD", "BUY").
            style: One of "default", "success", "warning", "error", "info".

        Example::

            N.badge("BULLISH", "success")
            N.badge("OVERVALUED", "warning")
        """
        self._w(render_badge(text, style=style))

    def change(
        self,
        label: str,
        current: float,
        previous: float,
        fmt: str = ".2f",
        pct: bool = True,
        invert: bool = False,
    ) -> None:
        """Display a value with absolute and percentage change.

        Args:
            label: Metric name.
            current: Current value.
            previous: Previous/baseline value.
            fmt: Format spec for the values.
            pct: Show percentage change.
            invert: If True, a decrease is positive (e.g. error rate, churn).

        Example::

            N.change("Revenue", 1_200_000, 1_000_000, fmt=",.0f")
            # → "Revenue: **1,200,000** (▲ +200,000, +20.0%)"

            N.change("Churn Rate", 0.021, 0.024, fmt=".1%", invert=True)
            # → "Churn Rate: **2.1%** (▲ -0.3%, -12.5%)"
        """
        self._w(render_change(label, current, previous, fmt=fmt, pct=pct, invert=invert))

    def ranking(
        self,
        label: str,
        value: Any,
        rank: int | None = None,
        total: int | None = None,
        percentile: float | None = None,
        fmt: str | None = None,
    ) -> None:
        """Display a value with rank/percentile context.

        Args:
            label: Metric name.
            value: The metric value.
            rank: Position in ranking (1-based).
            total: Total items in ranking.
            percentile: Percentile (0-100).
            fmt: Format spec for the value.

        Examples::

            N.ranking("Quality z-score", 1.5, percentile=93, fmt="+.1f")
            # → "Quality z-score: **+1.5** (93rd percentile, top 7%)"

            N.ranking("Market Cap", 12_500, rank=3, total=50, fmt=",.0f")
            # → "Market Cap: **12,500** (#3 of 50)"
        """
        self._w(render_ranking(label, value, rank=rank, total=total, percentile=percentile, fmt=fmt))

    # ── Internal chart helpers ──

    def _try_render_mpl_chart(
        self,
        chart_type: str,
        data: Any,
        x: str | None,
        y: str | Sequence[str] | None,
        title: str,
        x_label: str,
        y_label: str,
        filename: str | None,
    ) -> str | None:
        """Try to render a chart using matplotlib. Returns relative path or None."""
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            import pandas as pd
        except ImportError:
            return None

        if not isinstance(data, pd.DataFrame):
            try:
                data = pd.DataFrame(data)
            except Exception:
                return None

        fig, ax = plt.subplots(figsize=(10, 4))

        y_cols: list[str] = []
        if y is None:
            y_cols = data.select_dtypes(include="number").columns.tolist()
        elif isinstance(y, str):
            y_cols = [y]
        else:
            y_cols = list(y)

        x_data = data[x] if x else data.index

        for col in y_cols:
            if chart_type == "line":
                ax.plot(x_data, data[col], label=col, linewidth=1.5)
            elif chart_type == "area":
                ax.fill_between(x_data, data[col], alpha=0.4, label=col)
                ax.plot(x_data, data[col], linewidth=1.0)
            elif chart_type == "bar":
                ax.bar(range(len(data[col])), data[col], label=col, alpha=0.7)
            elif chart_type == "barh":
                ax.barh(range(len(data[col])), data[col], label=col, alpha=0.7)

        if title:
            ax.set_title(title)
        if x_label:
            ax.set_xlabel(x_label)
        if y_label:
            ax.set_ylabel(y_label)
        if len(y_cols) > 1:
            ax.legend()
        ax.grid(True, alpha=0.3)
        fig.tight_layout()

        fname = filename or f"{chart_type}_{self._cell_index}_{id(data) % 10000}.png"
        rel = self._asset_mgr.save_figure(fig, fname, dpi=160)
        return rel

    # ── Cell context manager ──

    @contextmanager
    def cell(self, title: str, code: bool | None = None) -> Generator[None, None, None]:
        """Create a notebook cell with optional code capture and stdout/stderr capture.

        Args:
            title: Cell heading text.
            code: If True, attempt to capture and display the source code of the cell body.
                  If None, uses cfg.include_code_default.

        Yields:
            Nothing — cell body executes inside the context.
        """
        self._ensure_started()
        self._cell_index += 1
        include_code = self.cfg.include_code_default if code is None else code

        self._w(f"## Cell {self._cell_index} — {title}\n\n")

        # Attempt AST-based code capture for the cell body
        if include_code:
            self._capture_cell_source()

        with capture_streams(echo=self.cfg.echo_to_console) as captured:
            yield

        # Render captured output
        if captured.has_stdout:
            self._w(render_stdout(captured.stdout))
        if captured.has_stderr:
            self._w(render_stderr(captured.stderr))
        if captured.has_error:
            self._w(render_exception(captured.exception, captured.traceback_str))
            self._w("---\n\n")
            raise captured.exception
        self._w("---\n\n")

    def _capture_cell_source(self) -> None:
        """Best-effort capture of the `with N.cell(...)` block source via AST parsing."""
        try:
            # Walk up the call stack to find the caller's frame
            frame = inspect.currentframe()
            # self.cell -> contextmanager wrapper -> caller
            caller = frame.f_back.f_back.f_back
            filename = caller.f_code.co_filename
            lineno = caller.f_lineno  # line of the `with` statement

            source = Path(filename).read_text(encoding="utf-8")
            tree = ast.parse(source, filename)

            # Find the `with` statement at the caller's line
            for node in ast.walk(tree):
                if isinstance(node, ast.With) and node.lineno == lineno:
                    body_lines = source.splitlines()
                    # Extract just the body (everything inside the with block)
                    start = node.body[0].lineno - 1
                    end = node.body[-1].end_lineno
                    snippet = "\n".join(body_lines[start:end])
                    snippet = textwrap.dedent(snippet).rstrip()
                    self._w("**Code**\n\n")
                    self._w(render_code(snippet, "python"))
                    return

            # Fallback: grab a few lines around the call site
            self._capture_cell_source_fallback(filename, lineno)
        except Exception:
            # Silently skip code capture if it fails
            pass

    def _capture_cell_source_fallback(self, filename: str, lineno: int) -> None:
        """Fallback code capture: grab lines around the with statement."""
        try:
            lines = Path(filename).read_text(encoding="utf-8").splitlines()
            # Find the end of the with block by looking for dedent
            start = lineno  # line after the `with`
            indent = len(lines[start]) - len(lines[start].lstrip()) if start < len(lines) else 0
            end = start + 1
            while end < len(lines) and lines[end].strip():
                line_indent = len(lines[end]) - len(lines[end].lstrip())
                if line_indent <= indent and lines[end].strip() and not lines[end].strip().startswith("#"):
                    break
                end += 1
            snippet = "\n".join(lines[start:end])
            snippet = textwrap.dedent(snippet).rstrip()
            if snippet:
                self._w("**Code**\n\n")
                self._w(render_code(snippet, "python"))
        except Exception:
            pass

    # ── Save / render ──

    def save(self) -> Path:
        """Write the notebook markdown to disk.

        Returns:
            Path to the saved markdown file.
        """
        self._ensure_started()

        content = "".join(self._chunks)

        # Replace the artifacts placeholder with the actual index
        artifact_index = self._asset_mgr.render_index()
        content = content.replace("{{ARTIFACTS_PLACEHOLDER}}", artifact_index)

        self.out_path.write_text(content, encoding="utf-8")
        return self.out_path

    def to_markdown(self) -> str:
        """Return the notebook content as a markdown string without saving."""
        self._ensure_started()
        content = "".join(self._chunks)
        artifact_index = self._asset_mgr.render_index()
        return content.replace("{{ARTIFACTS_PLACEHOLDER}}", artifact_index)


class _TabGroup:
    """Helper for creating tab sections within a notebook.

    Usage::

        tabs = N.tabs(["Overview", "Details"])
        with tabs.tab("Overview"):
            N.md("Overview content")
        with tabs.tab("Details"):
            N.table(df)
    """

    def __init__(self, notebook: Notebook, labels: Sequence[str]):
        self._notebook = notebook
        self._labels = list(labels)

    @contextmanager
    def tab(self, label: str) -> Generator[None, None, None]:
        """Open a tab section by label.

        Args:
            label: Must match one of the labels passed to N.tabs().
        """
        self._notebook._w(render_tab_start(label))
        yield
        self._notebook._w(render_tab_end())


class _ColumnGroup:
    """Helper for column layout within a notebook.

    Usage::

        cols = N.columns(3)
        with cols.col(0):
            N.metric("A", "100")
        with cols.col(1):
            N.metric("B", "200")
    """

    def __init__(self, notebook: Notebook, n: int):
        self._notebook = notebook
        self._n = n

    @contextmanager
    def col(self, index: int) -> Generator[None, None, None]:
        """Open a column section by index.

        Args:
            index: Zero-based column index.
        """
        if index > 0:
            self._notebook._w(render_column_separator())
        yield
        if index == self._n - 1:
            self._notebook._w(render_columns_end())
