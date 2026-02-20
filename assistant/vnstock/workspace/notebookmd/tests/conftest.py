"""Shared pytest fixtures for notebookmd test suite."""

import pytest
import sys
from pathlib import Path


@pytest.fixture
def tmp_notebook_dir(tmp_path):
    """Temporary directory for notebook output."""
    notebook_dir = tmp_path / "notebooks"
    notebook_dir.mkdir()
    return notebook_dir


@pytest.fixture
def sample_df():
    """Sample pandas DataFrame (skip if pandas unavailable)."""
    try:
        import pandas as pd
        return pd.DataFrame({
            "date": pd.date_range("2026-01-01", periods=10),
            "value": range(10),
            "category": ["A", "B"] * 5,
        })
    except ImportError:
        pytest.skip("pandas not installed")


@pytest.fixture
def long_df():
    """DataFrame with > 30 rows for truncation testing."""
    try:
        import pandas as pd
        return pd.DataFrame({"x": range(50), "y": range(50, 100)})
    except ImportError:
        pytest.skip("pandas not installed")


@pytest.fixture
def df_with_nulls():
    """DataFrame with null values for summary testing."""
    try:
        import pandas as pd
        import numpy as np
        return pd.DataFrame({
            "a": [1, 2, None, 4, None],
            "b": [None, None, None, 1, 2],
            "c": [10, 20, 30, 40, 50],
        })
    except ImportError:
        pytest.skip("pandas not installed")


@pytest.fixture
def sample_figure():
    """Sample matplotlib figure (skip if matplotlib unavailable)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots()
        ax.plot([1, 2, 3], [1, 4, 9])
        return fig
    except ImportError:
        pytest.skip("matplotlib not installed")


@pytest.fixture
def mock_notebook(tmp_path):
    """Pre-configured Notebook instance for testing."""
    from notebookmd import Notebook, NotebookConfig
    cfg = NotebookConfig(echo_to_console=False)
    return Notebook(
        out_md=str(tmp_path / "test.md"),
        title="Test Notebook",
        cfg=cfg,
    )
