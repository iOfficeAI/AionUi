"""Core Notebook and Cell implementation."""

from __future__ import annotations

import ast
import inspect
import textwrap
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Generator, Optional

from .assets import AssetManager
from .capture import CapturedOutput, capture_streams, render_exception, render_stderr, render_stdout
from .emitters import render_code, render_figure, render_kv, render_md, render_note, render_summary, render_table


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
