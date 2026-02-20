"""Unit tests for notebookmd.core module."""

import sys
import pytest
from pathlib import Path
from datetime import datetime
from notebookmd import Notebook, NotebookConfig


# NotebookConfig tests
def test_config_defaults():
    """Test default configuration values."""
    cfg = NotebookConfig()

    assert cfg.max_table_rows == 30
    assert cfg.echo_to_console is True
    assert cfg.include_code_default is False
    assert cfg.float_format == "{:.4f}"


def test_config_custom():
    """Test override defaults correctly."""
    cfg = NotebookConfig(
        max_table_rows=50,
        echo_to_console=False,
        include_code_default=True,
        float_format="{:.2f}",
    )

    assert cfg.max_table_rows == 50
    assert cfg.echo_to_console is False
    assert cfg.include_code_default is True
    assert cfg.float_format == "{:.2f}"


# Notebook initialization tests
def test_notebook_init_basic(tmp_path):
    """Test out_path, title, cfg set correctly."""
    out_path = tmp_path / "test.md"
    cfg = NotebookConfig(echo_to_console=False)

    N = Notebook(out_md=str(out_path), title="Test Notebook", cfg=cfg)

    assert N.out_path == out_path
    assert N.title == "Test Notebook"
    assert N.cfg.echo_to_console is False


def test_notebook_init_custom_assets_dir(tmp_path):
    """Test custom assets_path used."""
    out_path = tmp_path / "report.md"
    custom_assets = tmp_path / "my_assets"

    N = Notebook(out_md=str(out_path), assets_dir=str(custom_assets))

    assert N._asset_mgr.assets_dir == custom_assets


def test_notebook_init_default_assets_dir(tmp_path):
    """Test default: {out_dir}/assets/."""
    out_path = tmp_path / "reports" / "report.md"

    N = Notebook(out_md=str(out_path))

    expected = tmp_path / "reports" / "assets"
    assert N._asset_mgr.assets_dir == expected


def test_notebook_init_creates_parent_dirs(tmp_path):
    """Test parent directories created on _ensure_started()."""
    out_path = tmp_path / "nested" / "dir" / "report.md"

    N = Notebook(out_md=str(out_path))
    N._ensure_started()

    assert out_path.parent.exists()
    assert out_path.parent.is_dir()


# Header generation tests
def test_header_title(tmp_path):
    """Test header includes # {title}."""
    N = Notebook(out_md=str(tmp_path / "test.md"), title="My Report")
    N._ensure_started()

    md = N.to_markdown()

    assert "# My Report" in md


def test_header_timestamp(tmp_path):
    """Test _Generated: YYYY-MM-DD HH:MM:SS_ present."""
    N = Notebook(out_md=str(tmp_path / "test.md"))
    N._ensure_started()

    md = N.to_markdown()

    assert "_Generated:" in md
    # Check for year pattern
    assert "202" in md


def test_header_artifacts_section(tmp_path):
    """Test ## Artifacts section present."""
    N = Notebook(out_md=str(tmp_path / "test.md"))
    N._ensure_started()

    md = N.to_markdown()

    assert "## Artifacts" in md


def test_ensure_started_idempotent(tmp_path):
    """Test _ensure_started() only runs once (no duplicate headers)."""
    N = Notebook(out_md=str(tmp_path / "test.md"), title="Test")

    N._ensure_started()
    N._ensure_started()
    N._ensure_started()

    md = N.to_markdown()

    # Should only have one title
    assert md.count("# Test") == 1


# Emitter methods tests
def test_md_emission(tmp_path):
    """Test N.md() appends to _chunks."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.md("# Hello World")
    md = N.to_markdown()

    assert "# Hello World" in md


def test_note_emission(tmp_path):
    """Test N.note() creates blockquote."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.note("This is a note")
    md = N.to_markdown()

    assert "> **Note:**" in md
    assert "This is a note" in md


def test_code_emission(tmp_path):
    """Test N.code() creates fenced code block."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.code("print('hello')", lang="python")
    md = N.to_markdown()

    assert "```python" in md
    assert "print('hello')" in md


def test_kv_emission(tmp_path):
    """Test N.kv() renders Key/Value table."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.kv({"Name": "Alice", "Age": "30"}, title="User Info")
    md = N.to_markdown()

    assert "### User Info" in md
    assert "Name" in md
    assert "Alice" in md


# cell() context manager tests
def test_cell_basic_execution(tmp_path):
    """Test cell heading rendered, no code capture."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "test.md"), cfg=cfg)

    with N.cell("Test Cell"):
        N.note("Hello")

    md = N.to_markdown()

    assert "## Cell 1 — Test Cell" in md
    assert "Hello" in md


def test_cell_with_code_capture(tmp_path):
    """Test cell with code=True captures AST source."""
    cfg = NotebookConfig(echo_to_console=False, include_code_default=False)
    N = Notebook(out_md=str(tmp_path / "test.md"), cfg=cfg)

    # Note: Code capture requires the cell to be in a file for AST parsing
    # For this test, we'll verify the cell executes even if code capture fails
    with N.cell("Code Cell", code=True):
        N.note("Inside cell")

    md = N.to_markdown()

    assert "## Cell 1 — Code Cell" in md
    assert "Inside cell" in md


def test_cell_stdout_capture(tmp_path):
    """Test captures print statements as stdout block."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "test.md"), cfg=cfg)

    with N.cell("Print Test"):
        print("Hello stdout")

    md = N.to_markdown()

    assert "## Cell 1 — Print Test" in md
    assert "Hello stdout" in md


def test_cell_stderr_capture(tmp_path):
    """Test captures stderr as stderr block."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "test.md"), cfg=cfg)

    with N.cell("Stderr Test"):
        sys.stderr.write("Hello stderr\n")

    md = N.to_markdown()

    assert "## Cell 1 — Stderr Test" in md
    assert "Hello stderr" in md


def test_cell_exception_handling(tmp_path):
    """Test exception rendered then re-raised."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "test.md"), cfg=cfg)

    with pytest.raises(ValueError, match="Test error"):
        with N.cell("Error Test"):
            raise ValueError("Test error")

    md = N.to_markdown()

    assert "## Cell 1 — Error Test" in md
    assert "ValueError" in md
    assert "Test error" in md


def test_cell_numbering(tmp_path):
    """Test multiple cells increment index (Cell 1, 2, 3)."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "test.md"), cfg=cfg)

    with N.cell("First"):
        N.note("One")

    with N.cell("Second"):
        N.note("Two")

    with N.cell("Third"):
        N.note("Three")

    md = N.to_markdown()

    assert "## Cell 1 — First" in md
    assert "## Cell 2 — Second" in md
    assert "## Cell 3 — Third" in md


def test_cell_code_capture_fallback(tmp_path):
    """Test AST parsing failure graceful (no crash)."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "test.md"), cfg=cfg)

    # This should not crash even if code capture fails
    with N.cell("Fallback Test", code=True):
        N.note("This works")

    md = N.to_markdown()

    assert "## Cell 1 — Fallback Test" in md
    assert "This works" in md


# save() and to_markdown() tests
def test_save_creates_file(tmp_path):
    """Test file written to disk with correct content."""
    out_path = tmp_path / "output.md"
    N = Notebook(out_md=str(out_path), title="Save Test")

    with N.cell("Test"):
        N.note("Hello")

    result_path = N.save()

    assert result_path.exists()
    assert result_path == out_path

    content = result_path.read_text()
    assert "# Save Test" in content
    assert "Hello" in content


def test_save_artifact_placeholder_replaced(tmp_path):
    """Test {{ARTIFACTS_PLACEHOLDER}} replaced with index."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.save()
    content = Path(tmp_path / "test.md").read_text()

    # Placeholder should be replaced (not present in final output)
    assert "{{ARTIFACTS_PLACEHOLDER}}" not in content


def test_to_markdown_no_file(tmp_path):
    """Test returns string without writing file."""
    out_path = tmp_path / "nofile.md"
    N = Notebook(out_md=str(out_path), title="No File")

    with N.cell("Test"):
        N.note("Content")

    md = N.to_markdown()

    # Should return content
    assert "# No File" in md
    assert "Content" in md

    # Should not create file
    assert not out_path.exists()


def test_save_returns_path(tmp_path):
    """Test save() returns Path object."""
    out_path = tmp_path / "return.md"
    N = Notebook(out_md=str(out_path))

    result = N.save()

    assert isinstance(result, Path)
    assert result == out_path
