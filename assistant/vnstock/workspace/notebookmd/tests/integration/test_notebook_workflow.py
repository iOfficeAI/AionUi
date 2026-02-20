"""Integration tests for complete report workflows."""

import pytest
from pathlib import Path
from notebookmd import Notebook, NotebookConfig


@pytest.mark.integration
def test_complete_workflow(tmp_path):
    """Test full workflow: init -> sections -> save -> verify file content."""
    cfg = NotebookConfig()
    out_path = tmp_path / "complete.md"

    st = Notebook(out_md=str(out_path), title="Complete Workflow Test", cfg=cfg)

    st.section("Setup")
    st.note("Initializing report")

    st.section("Data Processing")
    st.write("Processing data...")

    st.section("Results")
    st.kv({"Status": "Success", "Items": "42"}, title="Summary")

    result_path = st.save()

    assert result_path.exists()
    content = result_path.read_text()

    # Verify all content present
    assert "# Complete Workflow Test" in content
    assert "## Setup" in content
    assert "## Data Processing" in content
    assert "## Results" in content
    assert "Initializing report" in content


@pytest.mark.integration
def test_multiple_sections(tmp_path):
    """Test multiple sections rendered correctly."""
    st = Notebook(out_md=str(tmp_path / "multi.md"))

    for i in range(5):
        st.section(f"Section {i+1}")
        st.note(f"Content {i+1}")

    md = st.to_markdown()

    # Check all sections present
    for i in range(1, 6):
        assert f"## Section {i}" in md


@pytest.mark.integration
@pytest.mark.requires_matplotlib
def test_artifact_index_integration(tmp_path, sample_figure, sample_df):
    """Test figures + CSVs appear in artifact index with correct links."""
    st = Notebook(out_md=str(tmp_path / "artifacts.md"))

    st.section("Create Assets")
    st.figure(sample_figure, "chart.png")
    st.export_csv(sample_df, "data.csv")

    result_path = st.save()
    content = result_path.read_text()

    # Verify artifact index has both items
    assert "## Artifacts" in content
    assert "[chart.png]" in content
    assert "[data.csv]" in content


@pytest.mark.integration
def test_mixed_emitters(tmp_path):
    """Test md + note + code + table in one section all rendered correctly."""
    st = Notebook(out_md=str(tmp_path / "mixed.md"))

    st.section("Mixed Content")
    st.md("# Markdown heading")
    st.note("Important note")
    st.code("x = 42", lang="python")
    st.kv({"Key": "Value"}, title="Data")

    md = st.to_markdown()

    assert "# Markdown heading" in md
    assert "> **Note:** Important note" in md
    assert "```python" in md
    assert "x = 42" in md
    assert "### Data" in md
    assert "Key" in md


@pytest.mark.integration
def test_empty_report(tmp_path):
    """Test report with no sections: header + empty artifacts only."""
    st = Notebook(out_md=str(tmp_path / "empty.md"), title="Empty Report")

    result_path = st.save()
    content = result_path.read_text()

    assert "# Empty Report" in content
    assert "## Artifacts" in content


@pytest.mark.integration
def test_to_markdown_vs_save(tmp_path):
    """Test to_markdown() content matches save() output."""
    out_path = tmp_path / "compare.md"
    st = Notebook(out_md=str(out_path), title="Comparison")

    st.section("Test")
    st.note("Content")

    # Get markdown without saving
    md_string = st.to_markdown()

    # Save to file
    st.save()
    file_content = out_path.read_text()

    # Should be identical
    assert md_string == file_content


@pytest.mark.integration
@pytest.mark.requires_matplotlib
def test_figure_and_csv_workflow(tmp_path, sample_figure, sample_df):
    """Test create figure, export CSV, verify both in artifact index."""
    st = Notebook(out_md=str(tmp_path / "assets.md"))

    st.section("Generate Assets")
    fig_path = st.figure(sample_figure, "plot.png")
    csv_path = st.export_csv(sample_df, "data.csv")

    result_path = st.save()

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
    """Test custom NotebookConfig (max_table_rows) respected."""
    cfg = NotebookConfig(
        max_table_rows=5,
        float_format="{:.2f}",
    )

    st = Notebook(out_md=str(tmp_path / "config.md"), cfg=cfg)

    assert st.cfg.max_table_rows == 5
    assert st.cfg.float_format == "{:.2f}"


@pytest.mark.integration
@pytest.mark.requires_pandas
def test_long_table_truncation(tmp_path, long_df):
    """Test DataFrame with > max_rows shows ellipsis row."""
    cfg = NotebookConfig(max_table_rows=10)
    st = Notebook(out_md=str(tmp_path / "truncate.md"), cfg=cfg)

    st.section("Long Table")
    st.table(long_df, name="Large Dataset")

    md = st.to_markdown()

    assert "#### Large Dataset" in md
    assert "\u2026" in md or "..." in md  # Ellipsis for truncation (Unicode or ASCII)
    assert "_shape: 50 rows \u00d7 2 cols_" in md


@pytest.mark.integration
def test_streamlit_like_workflow(tmp_path):
    """Test the recommended Streamlit-like usage pattern."""
    st = Notebook(out_md=str(tmp_path / "streamlit.md"), title="Analysis Report")

    # Streamlit-like: just call functions, no cells
    st.header("Overview")
    st.metric("Revenue", "$1.2M", delta="+12%")

    st.header("Details")
    st.write("Some analysis text")
    st.kv({"Key": "Value"}, title="Metrics")

    st.success("Complete!")

    md = st.to_markdown()

    assert "# Analysis Report" in md
    assert "## Overview" in md
    assert "Revenue" in md
    assert "$1.2M" in md
    assert "## Details" in md
    assert "Complete!" in md


@pytest.mark.integration
def test_section_workflow(tmp_path):
    """Test the section()-based organizational pattern."""
    st = Notebook(out_md=str(tmp_path / "sections.md"), title="Report")

    st.section("Setup", "Initialize data sources")
    st.kv({"Status": "OK"}, title="Environment")

    st.section("Analysis")
    st.write("Running analysis...")
    st.metric("Score", "92%", delta="+5%")

    st.section("Conclusion")
    st.success("All checks passed!")

    md = st.to_markdown()

    assert "## Setup" in md
    assert "_Initialize data sources_" in md
    assert "## Analysis" in md
    assert "## Conclusion" in md
    assert "92%" in md


@pytest.mark.integration
def test_section_context_manager_workflow(tmp_path):
    """Test section() as context manager in a full workflow."""
    st = Notebook(out_md=str(tmp_path / "ctx_sections.md"), title="Report")

    with st.section("Setup", "Initialize data sources"):
        st.kv({"Status": "OK"}, title="Environment")

    with st.section("Analysis"):
        st.write("Running analysis...")
        st.metric("Score", "92%", delta="+5%")

    with st.section("Conclusion"):
        st.success("All checks passed!")

    md = st.to_markdown()

    assert "## Setup" in md
    assert "_Initialize data sources_" in md
    assert "## Analysis" in md
    assert "## Conclusion" in md
    assert "92%" in md
    # Context manager adds dividers between sections
    assert "---" in md


@pytest.mark.integration
def test_expander_layout(tmp_path):
    """Test expander context manager works correctly."""
    st = Notebook(out_md=str(tmp_path / "expander.md"))

    st.section("Details")
    with st.expander("Show more"):
        st.write("Hidden content")

    md = st.to_markdown()

    assert "<details>" in md
    assert "Show more" in md
    assert "Hidden content" in md
    assert "</details>" in md
