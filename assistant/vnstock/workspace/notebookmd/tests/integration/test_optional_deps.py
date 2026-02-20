"""Integration tests for graceful degradation when pandas/matplotlib missing."""

import sys
import pytest
import importlib
from unittest.mock import patch


@pytest.mark.integration
def test_table_without_pandas(tmp_path, monkeypatch):
    """Test render_table() returns fallback message."""
    # Simulate pandas not installed
    monkeypatch.setitem(sys.modules, 'pandas', None)

    # Reload module to pick up the mock
    import notebookmd.emitters
    importlib.reload(notebookmd.emitters)
    from notebookmd.emitters import render_table

    result = render_table({}, name="Test Table")

    assert "pandas" in result.lower()
    assert "install" in result.lower() or "not available" in result.lower()


@pytest.mark.integration
def test_summary_without_pandas(tmp_path, monkeypatch):
    """Test render_summary() returns fallback message."""
    monkeypatch.setitem(sys.modules, 'pandas', None)

    import notebookmd.emitters
    importlib.reload(notebookmd.emitters)
    from notebookmd.emitters import render_summary

    result = render_summary({}, title="Test Summary")

    assert "pandas" in result.lower()


@pytest.mark.integration
def test_figure_without_matplotlib(tmp_path, monkeypatch):
    """Test save_figure() raises ImportError with helpful message."""
    monkeypatch.setitem(sys.modules, 'matplotlib', None)
    monkeypatch.setitem(sys.modules, 'matplotlib.pyplot', None)

    import notebookmd.assets
    importlib.reload(notebookmd.assets)
    from notebookmd.assets import AssetManager

    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    # Should fail gracefully
    with pytest.raises((ImportError, AttributeError)):
        am.save_figure(None, "test.png")


@pytest.mark.integration
def test_csv_without_pandas(tmp_path, monkeypatch):
    """Test save_csv() fails gracefully (no .to_csv() method)."""
    monkeypatch.setitem(sys.modules, 'pandas', None)

    import notebookmd.assets
    importlib.reload(notebookmd.assets)
    from notebookmd.assets import AssetManager

    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    # Should fail when trying to call .to_csv() on non-DataFrame
    with pytest.raises(AttributeError):
        am.save_csv({}, "test.csv")


@pytest.mark.integration
def test_notebook_without_any_deps(tmp_path, monkeypatch):
    """Test full notebook with md/note/code only works."""
    # Simulate both pandas and matplotlib unavailable
    monkeypatch.setitem(sys.modules, 'pandas', None)
    monkeypatch.setitem(sys.modules, 'matplotlib', None)
    monkeypatch.setitem(sys.modules, 'matplotlib.pyplot', None)

    # Reload to ensure imports use mocked modules
    import notebookmd
    import notebookmd.core
    import notebookmd.emitters
    importlib.reload(notebookmd.emitters)
    importlib.reload(notebookmd.core)
    importlib.reload(notebookmd)

    from notebookmd import Notebook, NotebookConfig

    cfg = NotebookConfig(echo_to_console=False)
    N = Notebook(out_md=str(tmp_path / "nodeps.md"), title="No Dependencies", cfg=cfg)

    with N.cell("Basic Operations"):
        N.md("# Markdown works")
        N.note("Notes work")
        N.code("print('hello')", lang="python")
        N.kv({"Key": "Value"}, title="KV works")

    result_path = N.save()

    assert result_path.exists()
    content = result_path.read_text()

    assert "# Markdown works" in content
    assert "> **Note:** Notes work" in content
    assert "```python" in content
    assert "### KV works" in content


@pytest.mark.integration
@pytest.mark.requires_pandas
def test_table_with_pandas(tmp_path, sample_df):
    """Test same test WITH pandas renders correctly."""
    from notebookmd.emitters import render_table

    result = render_table(sample_df, name="Test Table")

    assert "#### Test Table" in result
    assert "date" in result
    assert "value" in result
    assert "|" in result  # Table format


@pytest.mark.integration
@pytest.mark.requires_pandas
def test_summary_with_pandas(tmp_path, sample_df):
    """Test same test WITH pandas renders correctly."""
    from notebookmd.emitters import render_summary

    result = render_summary(sample_df, title="Test Summary")

    assert "#### Test Summary" in result
    assert "10 rows" in result
    assert "Columns" in result


@pytest.mark.integration
@pytest.mark.requires_matplotlib
def test_figure_with_matplotlib(tmp_path, sample_figure):
    """Test same test WITH matplotlib works correctly."""
    from notebookmd.assets import AssetManager

    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    rel_path = am.save_figure(sample_figure, "test.png")

    assert (tmp_path / "test.png").exists()
    assert rel_path == "test.png"
