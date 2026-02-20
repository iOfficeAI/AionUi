"""Stdout/stderr capture and exception rendering for notebook cells."""

from __future__ import annotations

import io
import sys
import traceback
from contextlib import contextmanager, redirect_stdout, redirect_stderr
from dataclasses import dataclass, field
from typing import Generator


@dataclass
class CapturedOutput:
    """Holds captured stdout, stderr, and exception info from a cell execution."""

    stdout: str = ""
    stderr: str = ""
    exception: Exception | None = None
    traceback_str: str = ""

    @property
    def has_stdout(self) -> bool:
        return bool(self.stdout.strip())

    @property
    def has_stderr(self) -> bool:
        return bool(self.stderr.strip())

    @property
    def has_error(self) -> bool:
        return self.exception is not None


@contextmanager
def capture_streams(echo: bool = True) -> Generator[CapturedOutput, None, None]:
    """Context manager that captures stdout/stderr and any raised exception.

    Args:
        echo: If True, also print captured output to the real console.

    Yields:
        CapturedOutput with stdout, stderr, and exception fields populated on exit.
    """
    result = CapturedOutput()
    out_buf = io.StringIO()
    err_buf = io.StringIO()

    try:
        with redirect_stdout(out_buf), redirect_stderr(err_buf):
            yield result
    except Exception as exc:
        result.exception = exc
        result.traceback_str = traceback.format_exc()
    finally:
        result.stdout = out_buf.getvalue()
        result.stderr = err_buf.getvalue()

        if echo:
            if result.stdout:
                sys.stdout.write(result.stdout)
            if result.stderr:
                sys.stderr.write(result.stderr)


def render_stdout(text: str) -> str:
    """Render captured stdout as a markdown code block."""
    if not text.strip():
        return ""
    return f"**Output (stdout)**\n\n```text\n{text.rstrip()}\n```\n\n"


def render_stderr(text: str) -> str:
    """Render captured stderr as a markdown code block."""
    if not text.strip():
        return ""
    return f"**Output (stderr)**\n\n```text\n{text.rstrip()}\n```\n\n"


def render_exception(exc: Exception, tb_str: str = "") -> str:
    """Render an exception as a blockquote error block in markdown."""
    error_text = str(exc).replace("\n", "\n> ")
    lines = [
        "> **Error:**",
        ">",
        "> ```text",
        f"> {type(exc).__name__}: {error_text}",
        "> ```",
        "",
        "",
    ]
    return "\n".join(lines)
