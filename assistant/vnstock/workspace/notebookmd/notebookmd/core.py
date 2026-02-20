"""Core Notebook (Streamlit-like report builder) implementation."""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Generator, Literal, Sequence

from .assets import AssetManager
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
    """Configuration for report rendering behavior."""

    max_table_rows: int = 30
    float_format: str = "{:.4f}"


class Notebook:
    """Streamlit-like report builder that renders to markdown.

    Designed for AI agents to generate data analysis reports with a familiar
    ``st.*``-style API.  Just call methods sequentially — no cells, no
    execution contexts, no stdout capture.

    Usage::

        st = Notebook("dist/report.md", title="My Analysis")

        st.header("Key Metrics")
        st.metric("Revenue", "$1.2M", delta="+12%")
        st.table(df.head(), name="Preview")

        st.header("Charts")
        st.line_chart(df, x="date", y="close", title="Price Trend")

        st.success("Analysis complete!")
        st.save()
    """

    def __init__(
        self,
        out_md: str,
        title: str = "Report",
        assets_dir: str | None = None,
        cfg: NotebookConfig | None = None,
    ):
        self.out_path = Path(out_md)
        self.assets_path = Path(assets_dir) if assets_dir else self.out_path.parent / "assets"
        self._title = title
        self.cfg = cfg or NotebookConfig()

        self._asset_mgr = AssetManager(self.assets_path, self.out_path.parent)
        self._started = False
        self._counter = 0  # General-purpose counter for unique filenames
        self._chunks: list[str] = []

    def _w(self, s: str) -> None:
        """Append a chunk of markdown to the internal buffer."""
        self._chunks.append(s)

    def _ensure_started(self) -> None:
        """Lazily initialize the report header on first use."""
        if self._started:
            return
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self._asset_mgr.ensure_dir()
        self._started = True

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._w(f"# {self._title}\n\n_Generated: {now}_\n\n")
        self._w("## Artifacts\n\n")
        self._w("{{ARTIFACTS_PLACEHOLDER}}\n\n---\n\n")

    def _next_id(self) -> int:
        """Return an auto-incrementing counter for unique asset filenames."""
        self._counter += 1
        return self._counter

    # ── Sections ──

    def section(self, title: str, description: str = "") -> _SectionContext:
        """Start a new semantic section with a heading and optional description.

        Works both as a plain call and as a context manager::

            # Plain call — just emits the heading, content follows below
            st.section("Key Metrics", "Fundamental indicators for VCB")
            st.metric("ROE", "22.5%")
            st.kv({"P/E": "15.2x", "P/B": "2.3x"})

            # Context manager — heading emitted on enter, divider on exit
            with st.section("Price Trend"):
                st.line_chart(df, x="date", y="close")

        Args:
            title: Section heading text.
            description: Optional short description rendered as a caption.

        Returns:
            A context manager (also usable as a plain call).
        """
        self._ensure_started()
        self._w(f"## {title}\n\n")
        if description:
            self._w(f"_{description}_\n\n")
        return _SectionContext(self)

    # ── Text Elements ──

    def title(self, text: str, anchor: str | None = None) -> None:
        """Emit a title heading (like st.title).

        Args:
            text: Title text.
            anchor: Optional HTML anchor ID.
        """
        self._ensure_started()
        self._w(render_title(text, anchor=anchor))

    def header(self, text: str, anchor: str | None = None, divider: bool = False) -> None:
        """Emit a section header (like st.header).

        Args:
            text: Header text.
            anchor: Optional HTML anchor ID.
            divider: If True, add a horizontal rule below.
        """
        self._ensure_started()
        self._w(render_header(text, anchor=anchor, divider=divider))

    def subheader(self, text: str, anchor: str | None = None, divider: bool = False) -> None:
        """Emit a subheader (like st.subheader).

        Args:
            text: Subheader text.
            anchor: Optional HTML anchor ID.
            divider: If True, add a horizontal rule below.
        """
        self._ensure_started()
        self._w(render_subheader(text, anchor=anchor, divider=divider))

    def caption(self, text: str) -> None:
        """Emit small caption text (like st.caption).

        Args:
            text: Caption text.
        """
        self._w(render_caption(text))

    def md(self, text: str) -> None:
        """Emit raw markdown text."""
        self._w(render_md(text))

    def note(self, text: str) -> None:
        """Emit a callout / note blockquote."""
        self._w(render_note(text))

    def code(self, source: str, lang: str = "python") -> None:
        """Emit a fenced code block."""
        self._w(render_code(source, lang))

    def text(self, body: str) -> None:
        """Emit fixed-width preformatted text (like st.text).

        Args:
            body: Plain text to render in monospace.
        """
        self._w(render_text(body))

    def latex(self, body: str) -> None:
        """Emit a LaTeX math expression (like st.latex).

        Args:
            body: LaTeX expression string.
        """
        self._w(render_latex(body))

    def divider(self) -> None:
        """Emit a horizontal divider (like st.divider)."""
        self._w(render_divider())

    # ── Data Display ──

    def table(self, df_obj: Any, name: str = "Table", max_rows: int | None = None) -> None:
        """Emit a DataFrame as a markdown table with truncation."""
        n = max_rows if max_rows is not None else self.cfg.max_table_rows
        self._w(render_table(df_obj, name=name, max_rows=n))

    def dataframe(self, df_obj: Any, name: str = "", max_rows: int | None = None, use_container_width: bool = False) -> None:
        """Display a DataFrame (like st.dataframe).

        Args:
            df_obj: A pandas DataFrame.
            name: Optional heading for the table.
            max_rows: Maximum rows to display.
            use_container_width: Ignored (API compat with Streamlit).
        """
        n = max_rows if max_rows is not None else self.cfg.max_table_rows
        self._w(render_dataframe(df_obj, name=name, max_rows=n, use_container_width=use_container_width))

    def metric(
        self,
        label: str,
        value: Any,
        delta: Any | None = None,
        delta_color: Literal["normal", "inverse", "off"] = "normal",
    ) -> None:
        """Display a metric card with optional delta indicator (like st.metric).

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

            st.metric_row([
                {"label": "Revenue", "value": "$1.2M", "delta": "+12%"},
                {"label": "Users", "value": "3,400", "delta": "+200"},
            ])
        """
        self._w(render_metric_row(metrics))

    def json(self, data: Any, expanded: bool = True) -> None:
        """Display data as formatted JSON (like st.json).

        Args:
            data: Any JSON-serializable object.
            expanded: If True, pretty-print with indentation.
        """
        self._w(render_json(data, expanded=expanded))

    def kv(self, data: dict[str, Any], title: str = "Metrics") -> None:
        """Emit a key-value metrics table."""
        self._w(render_kv(data, title))

    def summary(self, df_obj: Any, title: str = "Data Summary") -> None:
        """Emit an auto-generated DataFrame summary (shape, nulls, stats)."""
        self._w(render_summary(df_obj, title))

    # ── Chart Widgets ──

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
        """Display a line chart (like st.line_chart).

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
        """Display an area chart (like st.area_chart).

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
        """Display a bar chart (like st.bar_chart).

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

    def figure(self, fig: Any, filename: str, caption: str = "", dpi: int = 160) -> str:
        """Save a matplotlib figure and emit its markdown link.

        Returns:
            Relative path to the saved figure.
        """
        rel = self._asset_mgr.save_figure(fig, filename, dpi=dpi)
        self._w(render_figure(rel, caption=caption, filename=filename))
        return rel

    def plotly_chart(
        self,
        fig: Any,
        filename: str | None = None,
        caption: str = "",
        use_container_width: bool = True,
    ) -> str:
        """Save and display a Plotly figure (like st.plotly_chart).

        Returns:
            Relative path to the saved chart image.
        """
        fname = filename or f"plotly_{self._next_id()}.png"
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
        """Save and display an Altair/Vega-Lite chart (like st.altair_chart).

        Returns:
            Relative path to the saved chart image.
        """
        fname = filename or f"altair_{self._next_id()}.png"
        rel = self._asset_mgr.save_altair(chart, fname)
        self._w(render_altair_chart(rel, caption=caption, use_container_width=use_container_width))
        return rel

    # ── Status Elements ──

    def success(self, body: str, icon: str = "✅") -> None:
        """Emit a success message (like st.success)."""
        self._w(render_success(body, icon=icon))

    def error(self, body: str, icon: str = "❌") -> None:
        """Emit an error message (like st.error)."""
        self._w(render_error(body, icon=icon))

    def warning(self, body: str, icon: str = "⚠️") -> None:
        """Emit a warning message (like st.warning)."""
        self._w(render_warning(body, icon=icon))

    def info(self, body: str, icon: str = "ℹ️") -> None:
        """Emit an info message (like st.info)."""
        self._w(render_info(body, icon=icon))

    def exception(self, exc: Exception) -> None:
        """Display an exception (like st.exception).

        Args:
            exc: The exception to display.
        """
        self._w(render_widget_exception(exc))

    def progress(self, value: float, text: str = "") -> None:
        """Emit a progress bar (like st.progress).

        Args:
            value: Progress from 0.0 to 1.0.
            text: Optional label text.
        """
        self._w(render_progress(value, text=text))

    def toast(self, body: str, icon: str = "🔔") -> None:
        """Emit a toast notification (like st.toast)."""
        self._w(render_toast(body, icon=icon))

    def balloons(self) -> None:
        """Emit a balloons celebration marker (like st.balloons)."""
        self._w(render_balloons())

    def snow(self) -> None:
        """Emit a snow celebration marker (like st.snow)."""
        self._w(render_snow())

    # ── Layout Elements ──

    @contextmanager
    def expander(self, label: str, expanded: bool = False) -> Generator[None, None, None]:
        """Create a collapsible section (like st.expander).

        Args:
            label: The expander heading.
            expanded: If True, section is open by default.

        Usage::

            with st.expander("Show details"):
                st.md("Hidden content here")
                st.table(df)
        """
        self._w(render_expander_start(label, expanded=expanded))
        yield
        self._w(render_expander_end())

    @contextmanager
    def container(self, border: bool = False) -> Generator[None, None, None]:
        """Create a visual container (like st.container).

        Args:
            border: If True, add a border (rendered as blockquote).

        Usage::

            with st.container(border=True):
                st.md("Contained content")
        """
        self._w(render_container_start(border=border))
        yield
        self._w(render_container_end(border=border))

    def tabs(self, labels: Sequence[str]) -> _TabGroup:
        """Create a tab group (like st.tabs).

        Returns a _TabGroup that yields tab context managers.

        Args:
            labels: List of tab labels.

        Usage::

            tabs = st.tabs(["Overview", "Details", "Raw Data"])
            with tabs.tab("Overview"):
                st.metric("Revenue", "$1.2M")
            with tabs.tab("Details"):
                st.table(df)
        """
        self._w(render_tabs_header(labels))
        return _TabGroup(self, labels)

    def columns(self, spec: int | Sequence[float] = 2) -> _ColumnGroup:
        """Create a column layout (like st.columns).

        Since markdown doesn't support true columns, content is rendered
        sequentially with visual separators.

        Args:
            spec: Number of columns or list of relative widths.

        Usage::

            cols = st.columns(3)
            with cols.col(0):
                st.metric("A", "100")
            with cols.col(1):
                st.metric("B", "200")
        """
        self._w(render_columns_start(spec))
        n = spec if isinstance(spec, int) else len(spec)
        return _ColumnGroup(self, n)

    # ── Media Elements ──

    def image(
        self,
        source: Any,
        caption: str = "",
        width: int | None = None,
        filename: str | None = None,
    ) -> str:
        """Display an image (like st.image).

        Supports file paths, URLs, or raw image data (PIL/numpy).

        Args:
            source: File path string, URL, PIL Image, or numpy array.
            caption: Optional caption.
            width: Optional width in pixels.
            filename: Output filename when saving from PIL/numpy.

        Returns:
            Path or URL to the image.
        """
        if isinstance(source, str):
            self._w(render_image(source, caption=caption, width=width))
            return source

        fname = filename or f"image_{self._next_id()}.png"
        rel = self._asset_mgr.save_image(source, fname)
        self._w(render_image(rel, caption=caption, width=width))
        return rel

    def audio(self, source: str, caption: str = "") -> None:
        """Display an audio player link (like st.audio)."""
        self._w(render_audio(source, caption=caption))

    def video(self, source: str, caption: str = "") -> None:
        """Display a video link (like st.video)."""
        self._w(render_video(source, caption=caption))

    # ── Smart Write / Utility ──

    def write(self, *args: Any) -> None:
        """Auto-format and display any combination of values (like st.write).

        Type dispatch:
        - str        -> markdown text
        - dict       -> JSON code block
        - DataFrame  -> markdown table
        - int/float  -> bold number
        - list/tuple -> bullet list
        - Exception  -> error callout
        - None       -> ``None``
        - other      -> ``str(obj)``

        Example::

            st.write("Hello", {"key": "value"}, df, 42)
        """
        self._w(render_write(*args))

    def echo(self, source: str, output: str = "") -> None:
        """Display code and its output together (like st.echo).

        Args:
            source: The source code.
            output: The output produced by the code.
        """
        self._w(render_echo(source, output=output))

    def empty(self) -> None:
        """Emit an empty placeholder (like st.empty)."""
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

    def export_csv(self, df: Any, filename: str, name: str | None = None) -> str:
        """Save a DataFrame as CSV and link it in the artifacts.

        Returns:
            Relative path to the saved CSV.
        """
        rel = self._asset_mgr.save_csv(df, filename)
        display_name = name or filename
        self._w(f"**Exported:** [{display_name}]({rel})\n\n")
        return rel

    # ── Analytics-oriented helpers ──

    def stat(
        self,
        label: str,
        value: Any,
        description: str = "",
        fmt: str | None = None,
    ) -> None:
        """Display a single-line statistic with bold value and optional context.

        Examples::

            st.stat("Quality z-score", 1.5, "93rd percentile, top 7%", fmt="+.1f")
            st.stat("P/E Ratio", 15.2)
            st.stat("Return", 0.123, "annualized", fmt=".1%")
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

            st.stats([
                {"label": "P/E", "value": 15.2, "fmt": ".1f"},
                {"label": "P/B", "value": 2.8, "fmt": ".1f"},
                {"label": "ROE", "value": 0.221, "fmt": ".1%"},
            ])
        """
        self._w(render_stats(stats, separator=separator))

    def badge(self, text: str, style: str = "default") -> None:
        """Display an inline badge/pill label.

        Args:
            text: Badge text (e.g. "BULLISH", "HOLD", "BUY").
            style: One of "default", "success", "warning", "error", "info".
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

        Example::

            st.change("Revenue", 1_200_000, 1_000_000, fmt=",.0f")
            # -> "Revenue: **1,200,000** (^ +200,000, +20.0%)"
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

        Examples::

            st.ranking("Quality z-score", 1.5, percentile=93, fmt="+.1f")
            st.ranking("Market Cap", 12_500, rank=3, total=50, fmt=",.0f")
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

        fname = filename or f"{chart_type}_{self._next_id()}.png"
        rel = self._asset_mgr.save_figure(fig, fname, dpi=160)
        return rel

    # ── Save / render ──

    def save(self) -> Path:
        """Write the report markdown to disk.

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
        """Return the report content as a markdown string without saving."""
        self._ensure_started()
        content = "".join(self._chunks)
        artifact_index = self._asset_mgr.render_index()
        return content.replace("{{ARTIFACTS_PLACEHOLDER}}", artifact_index)


class _SectionContext:
    """Returned by ``Notebook.section()`` to allow optional context-manager use.

    When used as a plain call the heading is already emitted and this object is
    simply discarded.  When used with ``with``, it emits a divider on exit to
    visually close the section::

        # Both styles are valid:
        st.section("Setup")           # plain call
        with st.section("Analysis"):  # context manager
            st.write("...")
    """

    def __init__(self, notebook: Notebook):
        self._notebook = notebook

    def __enter__(self) -> None:
        return None

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        # Add a divider to visually close the section
        self._notebook._w("\n---\n\n")
        return None


class _TabGroup:
    """Helper for creating tab sections within a report.

    Usage::

        tabs = st.tabs(["Overview", "Details"])
        with tabs.tab("Overview"):
            st.md("Overview content")
        with tabs.tab("Details"):
            st.table(df)
    """

    def __init__(self, notebook: Notebook, labels: Sequence[str]):
        self._notebook = notebook
        self._labels = list(labels)

    @contextmanager
    def tab(self, label: str) -> Generator[None, None, None]:
        """Open a tab section by label.

        Args:
            label: Must match one of the labels passed to st.tabs().
        """
        self._notebook._w(render_tab_start(label))
        yield
        self._notebook._w(render_tab_end())


class _ColumnGroup:
    """Helper for column layout within a report.

    Usage::

        cols = st.columns(3)
        with cols.col(0):
            st.metric("A", "100")
        with cols.col(1):
            st.metric("B", "200")
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
