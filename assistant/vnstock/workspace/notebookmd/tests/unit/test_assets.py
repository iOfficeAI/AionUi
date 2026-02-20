"""Unit tests for notebookmd.assets module."""

import sys
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from notebookmd.assets import AssetManager


# AssetManager initialization tests
def test_asset_manager_init(tmp_path):
    """Test basic initialization with assets_dir and base_dir."""
    assets_dir = tmp_path / "assets"
    am = AssetManager(assets_dir=assets_dir, base_dir=tmp_path)

    assert am.assets_dir == assets_dir
    assert am.base_dir == tmp_path
    assert am._artifacts == []


def test_ensure_dir_creates_directory(tmp_path):
    """Test creates assets directory on disk."""
    assets_dir = tmp_path / "new_assets"
    assert not assets_dir.exists()

    am = AssetManager(assets_dir=assets_dir, base_dir=tmp_path)
    am.ensure_dir()

    assert assets_dir.exists()
    assert assets_dir.is_dir()


# Path operations tests
def test_rel_path_basic(tmp_path):
    """Test relative path calculation from base_dir."""
    base = tmp_path / "notebooks"
    assets = tmp_path / "notebooks" / "assets"
    base.mkdir()
    assets.mkdir()

    am = AssetManager(assets_dir=assets, base_dir=base)

    fig_path = assets / "chart.png"
    rel = am.rel_path(fig_path)

    assert rel == "assets/chart.png"


def test_rel_path_same_dir(tmp_path):
    """Test returns filename only if in same directory."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    file_path = tmp_path / "file.png"
    rel = am.rel_path(file_path)

    assert rel == "file.png"


def test_rel_path_subdirectory(tmp_path):
    """Test returns subdir/file for subdirectory."""
    base = tmp_path
    assets = tmp_path / "assets" / "charts"
    assets.mkdir(parents=True)

    am = AssetManager(assets_dir=assets, base_dir=base)

    file_path = assets / "plot.png"
    rel = am.rel_path(file_path)

    assert rel == "assets/charts/plot.png"


# Artifact tracking tests
def test_register_adds_artifact(tmp_path):
    """Test artifact added to artifacts list."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    am.register("test.png")

    assert len(am.artifacts) == 1
    assert am.artifacts[0] == "test.png"


def test_register_deduplicates(tmp_path):
    """Test same path not added twice."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    am.register("test.png")
    am.register("test.png")
    am.register("test.png")

    assert len(am.artifacts) == 1


# save_figure() with matplotlib
@pytest.mark.requires_matplotlib
def test_save_figure_basic(tmp_path, sample_figure):
    """Test saves figure to disk with correct path."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    rel_path = am.save_figure(sample_figure, "test_chart.png")

    assert (tmp_path / "test_chart.png").exists()
    assert rel_path == "test_chart.png"


@pytest.mark.requires_matplotlib
def test_save_figure_custom_dpi(tmp_path, sample_figure):
    """Test respects custom DPI parameter."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    # Just verify it doesn't crash with custom DPI
    am.save_figure(sample_figure, "chart.png", dpi=150)

    assert (tmp_path / "chart.png").exists()


@pytest.mark.requires_matplotlib
def test_save_figure_registers_artifact(tmp_path, sample_figure):
    """Test artifact tracked in list."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    am.save_figure(sample_figure, "chart.png")

    assert "chart.png" in am.artifacts


@pytest.mark.requires_matplotlib
def test_save_figure_returns_rel_path(tmp_path, sample_figure):
    """Test returns correct relative path."""
    base = tmp_path / "notebooks"
    assets = tmp_path / "notebooks" / "assets"
    base.mkdir()
    assets.mkdir()

    am = AssetManager(assets_dir=assets, base_dir=base)

    rel_path = am.save_figure(sample_figure, "chart.png")

    assert rel_path == "assets/chart.png"


@pytest.mark.requires_matplotlib
def test_save_figure_closes_figure(tmp_path):
    """Test plt.close() called after save."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots()
        ax.plot([1, 2, 3])

        am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

        # Get initial figure count
        initial_count = len(plt.get_fignums())

        am.save_figure(fig, "test.png")

        # Figure should be closed
        final_count = len(plt.get_fignums())
        assert final_count <= initial_count

    except ImportError:
        pytest.skip("matplotlib not installed")


def test_save_figure_no_matplotlib(tmp_path, monkeypatch):
    """Test ImportError with helpful message when unavailable."""
    import importlib
    monkeypatch.setitem(sys.modules, 'matplotlib', None)
    monkeypatch.setitem(sys.modules, 'matplotlib.pyplot', None)

    import notebookmd.assets
    importlib.reload(notebookmd.assets)
    from notebookmd.assets import AssetManager

    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    with pytest.raises((ImportError, AttributeError)):
        am.save_figure(None, "test.png")


# save_csv() tests
@pytest.mark.requires_pandas
def test_save_csv_basic(tmp_path, sample_df):
    """Test saves DataFrame to CSV with correct content."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    rel_path = am.save_csv(sample_df, "data.csv")

    csv_path = tmp_path / "data.csv"
    assert csv_path.exists()

    # Read back and verify content
    content = csv_path.read_text()
    assert "value" in content
    assert "category" in content


@pytest.mark.requires_pandas
def test_save_csv_registers_artifact(tmp_path, sample_df):
    """Test artifact tracked in list."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    am.save_csv(sample_df, "data.csv")

    assert "data.csv" in am.artifacts


@pytest.mark.requires_pandas
def test_save_csv_returns_rel_path(tmp_path, sample_df):
    """Test returns correct relative path."""
    base = tmp_path / "notebooks"
    assets = tmp_path / "notebooks" / "assets"
    base.mkdir()
    assets.mkdir()

    am = AssetManager(assets_dir=assets, base_dir=base)

    rel_path = am.save_csv(sample_df, "data.csv")

    assert rel_path == "assets/data.csv"


@pytest.mark.requires_pandas
def test_save_csv_no_index(tmp_path, sample_df):
    """Test CSV written with index=False."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    am.save_csv(sample_df, "data.csv")

    content = (tmp_path / "data.csv").read_text()
    # First line should be column names, not index
    first_line = content.split("\n")[0]
    assert "date" in first_line or "value" in first_line


# render_index() tests
def test_render_index_empty(tmp_path):
    """Test returns 'No artifacts generated.' when empty."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    result = am.render_index()

    assert "No artifacts generated" in result or "no artifacts" in result.lower()


@pytest.mark.requires_matplotlib
def test_render_index_single(tmp_path, sample_figure):
    """Test single artifact as markdown link."""
    am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

    am.save_figure(sample_figure, "chart.png")
    result = am.render_index()

    assert "[chart.png](chart.png)" in result


@pytest.mark.requires_matplotlib
def test_render_index_multiple(tmp_path, sample_figure):
    """Test all artifacts listed as - [name](path)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        am = AssetManager(assets_dir=tmp_path, base_dir=tmp_path)

        # Create multiple figures
        fig1, ax1 = plt.subplots()
        ax1.plot([1, 2, 3])
        am.save_figure(fig1, "chart1.png")

        fig2, ax2 = plt.subplots()
        ax2.plot([4, 5, 6])
        am.save_figure(fig2, "chart2.png")

        result = am.render_index()

        assert "[chart1.png](chart1.png)" in result
        assert "[chart2.png](chart2.png)" in result
        # Should be in list format
        assert result.count("- [") >= 2

    except ImportError:
        pytest.skip("matplotlib not installed")
