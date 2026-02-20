"""Integration tests for complete notebook workflows."""

import sys
import pytest
from pathlib import Path
from notebookmd import Notebook, NotebookConfig


@pytest.mark.integration
def test_complete_notebook_workflow(tmp_path):
    """Test full workflow: init → multiple cells → save → verify file content."""
    cfg = NotebookConfig(echo_to_console=False)
    out_path = tmp_path / "complete.md"

    N = Notebook(out_md=str(out_path), title="Complete Workflow Test", cfg=cfg)

    with N.cell("Setup"):
        N.note("Initializing notebook")

    with N.cell("Data Processing"):
        N.md("Processing data...")
        print("Data loaded")

    with N.cell("Results"):
        N.kv({"Status": "Success", "Items": "42"}, title="Summary")

    result_path = N.save()

    assert result_path.exists()
    content = result_path.read_text()

    # Verify all content present
    assert "# Complete Workflow Test" in content
    assert "## Cell 1 — Setup" in content
    assert "## Cell 2 — Data Processing" in content
    assert "## Cell 3 — Results" in content
    assert "Initializing notebook" in content
    assert "Data loaded" in content


@pytest.mark.integration
def test_multiple_cells(tmp_path):
    """Test cell numbering and separators correct."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "multi.md"), cfg=cfg)

    for i in range(5):
        with N.cell(f"Cell {i+1}"):
            N.note(f"Content {i+1}")

    md = N.to_markdown()

    # Check all cells numbered correctly
    for i in range(1, 6):
        assert f"## Cell {i} —" in md

    # Check separators present
    assert md.count("---") >= 4  # Separators between cells


@pytest.mark.integration
@pytest.mark.requires_matplotlib
def test_artifact_index_integration(tmp_path, sample_figure, sample_df):
    """Test figures + CSVs appear in artifact index with correct links."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "artifacts.md"), cfg=cfg)

    with N.cell("Create Assets"):
        N.figure(sample_figure, "chart.png")
        N.export_csv(sample_df, "data.csv")

    result_path = N.save()
    content = result_path.read_text()

    # Verify artifact index has both items
    assert "## Artifacts" in content
    assert "[chart.png]" in content
    assert "[data.csv]" in content


@pytest.mark.integration
def test_cell_with_exception(tmp_path):
    """Test exception rendered, re-raised, but subsequent cells still run."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "error.md"), cfg=cfg)

    with N.cell("Before Error"):
        N.note("This runs")

    # This should capture exception and re-raise
    with pytest.raises(ValueError):
        with N.cell("Error Cell"):
            raise ValueError("Test error")

    # This should still be callable after the error
    with N.cell("After Error"):
        N.note("This also runs")

    md = N.to_markdown()

    assert "## Cell 1 — Before Error" in md
    assert "## Cell 2 — Error Cell" in md
    assert "## Cell 3 — After Error" in md
    assert "ValueError" in md


@pytest.mark.integration
def test_mixed_emitters(tmp_path):
    """Test md + note + code + table in one cell all rendered correctly."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "mixed.md"), cfg=cfg)

    with N.cell("Mixed Content"):
        N.md("# Markdown heading")
        N.note("Important note")
        N.code("x = 42", lang="python")
        N.kv({"Key": "Value"}, title="Data")

    md = N.to_markdown()

    assert "# Markdown heading" in md
    assert "> **Note:** Important note" in md
    assert "```python" in md
    assert "x = 42" in md
    assert "### Data" in md
    assert "Key" in md


@pytest.mark.integration
def test_empty_notebook(tmp_path):
    """Test notebook with no cells: header + empty artifacts only."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "empty.md"), title="Empty Notebook", cfg=cfg)

    result_path = N.save()
    content = result_path.read_text()

    assert "# Empty Notebook" in content
    assert "## Artifacts" in content
    # Should have minimal content (no cells)
    assert "## Cell" not in content


@pytest.mark.integration
def test_to_markdown_vs_save(tmp_path):
    """Test to_markdown() content matches save() output."""
    cfg = NotebookConfig(echo_to_console=False)
    out_path = tmp_path / "compare.md"
    N = Notebook(out_md=str(out_path), title="Comparison", cfg=cfg)

    with N.cell("Test"):
        N.note("Content")

    # Get markdown without saving
    md_string = N.to_markdown()

    # Save to file
    N.save()
    file_content = out_path.read_text()

    # Should be identical
    assert md_string == file_content


@pytest.mark.integration
@pytest.mark.requires_matplotlib
def test_figure_and_csv_workflow(tmp_path, sample_figure, sample_df):
    """Test create figure, export CSV, verify both in artifact index."""
    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "assets.md"), cfg=cfg)

    with N.cell("Generate Assets"):
        fig_path = N.figure(sample_figure, "plot.png")
        csv_path = N.export_csv(sample_df, "data.csv")

    result_path = N.save()

    # Verify files created
    assets_dir = tmp_path / "assets"
    assert (assets_dir / "plot.png").exists()
    assert (assets_dir / "data.csv").exists()

    # Verify in artifact index
    content = result_path.read_text()
    assert "[plot.png]" in content
    assert "[data.csv]" in content


@pytest.mark.integration
def test_custom_config(tmp_path):
    """Test custom NotebookConfig (max_table_rows, echo) respected."""
    cfg = NotebookConfig(
        max_table_rows=5,
        echo_to_console=False,
        float_format="{:.2f}",
    )

    N = Notebook(out_md=str(tmp_path / "config.md"), cfg=cfg)

    assert N.cfg.max_table_rows == 5
    assert N.cfg.echo_to_console is False
    assert N.cfg.float_format == "{:.2f}"


@pytest.mark.integration
@pytest.mark.requires_pandas
def test_long_table_truncation(tmp_path, long_df):
    """Test DataFrame with > max_rows shows ellipsis row."""
    cfg = NotebookConfig(echo_to_console=False, max_table_rows=10)
    N = Notebook(out_md=str(tmp_path / "truncate.md"), cfg=cfg)

    with N.cell("Long Table"):
        N.table(long_df, name="Large Dataset")

    md = N.to_markdown()

    assert "#### Large Dataset" in md
    assert "…" in md or "..." in md  # Ellipsis for truncation (Unicode or ASCII)
    assert "_shape: 50 rows × 2 cols_" in md
