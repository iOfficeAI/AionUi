"""Unit tests for notebookmd.core module."""

import pytest
from pathlib import Path
from datetime import datetime
from notebookmd import Notebook, NotebookConfig


# NotebookConfig tests
def test_config_defaults():
    """Test default configuration values."""
    cfg = NotebookConfig()

    assert cfg.max_table_rows == 30
    assert cfg.float_format == "{:.4f}"


def test_config_custom():
    """Test override defaults correctly."""
    cfg = NotebookConfig(
        max_table_rows=50,
        float_format="{:.2f}",
    )

    assert cfg.max_table_rows == 50
    assert cfg.float_format == "{:.2f}"


# Notebook initialization tests
def test_notebook_init_basic(tmp_path):
    """Test out_path, title, cfg set correctly."""
    out_path = tmp_path / "test.md"
    cfg = NotebookConfig()

    N = Notebook(out_md=str(out_path), title="Test Report", cfg=cfg)

    assert N.out_path == out_path
    assert N._title == "Test Report"


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


# section() tests
def test_section_basic(tmp_path):
    """Test section() renders heading."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.section("Key Metrics")
    N.note("Hello")

    md = N.to_markdown()

    assert "## Key Metrics" in md
    assert "Hello" in md


def test_section_with_description(tmp_path):
    """Test section() with description renders caption."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.section("Data Loading", "Fetch and validate input data")

    md = N.to_markdown()

    assert "## Data Loading" in md
    assert "_Fetch and validate input data_" in md


def test_section_context_manager(tmp_path):
    """Test section() works as a context manager."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    with N.section("Analysis"):
        N.note("Inside section")

    md = N.to_markdown()

    assert "## Analysis" in md
    assert "Inside section" in md
    assert "---" in md  # Divider emitted on exit


def test_section_context_manager_with_description(tmp_path):
    """Test section() context manager with description."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    with N.section("Setup", "Initialize environment"):
        N.write("Setting up...")

    md = N.to_markdown()

    assert "## Setup" in md
    assert "_Initialize environment_" in md
    assert "Setting up..." in md


def test_multiple_sections(tmp_path):
    """Test multiple sections render sequentially."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.section("First")
    N.note("One")

    N.section("Second")
    N.note("Two")

    N.section("Third")
    N.note("Three")

    md = N.to_markdown()

    assert "## First" in md
    assert "## Second" in md
    assert "## Third" in md


def test_mixed_section_styles(tmp_path):
    """Test mixing plain calls and context managers."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.section("Plain Section")
    N.note("Plain content")

    with N.section("Context Section"):
        N.note("Context content")

    N.section("Another Plain")
    N.note("More content")

    md = N.to_markdown()

    assert "## Plain Section" in md
    assert "## Context Section" in md
    assert "## Another Plain" in md
    assert "Plain content" in md
    assert "Context content" in md
    assert "More content" in md


# Text element tests (renamed from st_ prefix)
def test_title_method(tmp_path):
    """Test title() renders # heading."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.title("Dashboard Title")
    md = N.to_markdown()

    assert "# Dashboard Title" in md


def test_header_method(tmp_path):
    """Test header() renders ## heading."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.header("Section Header")
    md = N.to_markdown()

    assert "## Section Header" in md


def test_subheader_method(tmp_path):
    """Test subheader() renders ### heading."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.subheader("Subsection")
    md = N.to_markdown()

    assert "### Subsection" in md


def test_caption_method(tmp_path):
    """Test caption() renders italic text."""
    N = Notebook(out_md=str(tmp_path / "test.md"))

    N.caption("Small text")
    md = N.to_markdown()

    assert "_Small text_" in md


# save() and to_markdown() tests
def test_save_creates_file(tmp_path):
    """Test file written to disk with correct content."""
    out_path = tmp_path / "output.md"
    N = Notebook(out_md=str(out_path), title="Save Test")

    N.section("Test")
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

    N.section("Test")
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
