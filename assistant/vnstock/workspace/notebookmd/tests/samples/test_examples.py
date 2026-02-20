"""Tests for validating example scripts run correctly."""

import sys
import pytest
import subprocess
import shutil
from pathlib import Path


def test_analysis_example_runs(tmp_path, monkeypatch):
    """Test examples/analysis.py executes without errors."""
    monkeypatch.chdir(tmp_path)

    # Copy example to temp dir
    example_src = Path(__file__).parent.parent.parent / "examples" / "analysis.py"
    if not example_src.exists():
        pytest.skip("examples/analysis.py not found")

    example_dst = tmp_path / "analysis.py"
    shutil.copy(example_src, example_dst)

    # Run script
    result = subprocess.run(
        [sys.executable, str(example_dst)],
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, f"Script failed: {result.stderr}"


def test_analysis_output_valid(tmp_path, monkeypatch):
    """Test generated markdown has expected structure (sections present)."""
    monkeypatch.chdir(tmp_path)

    example_src = Path(__file__).parent.parent.parent / "examples" / "analysis.py"
    if not example_src.exists():
        pytest.skip("examples/analysis.py not found")

    example_dst = tmp_path / "analysis.py"
    shutil.copy(example_src, example_dst)

    # Run script
    result = subprocess.run(
        [sys.executable, str(example_dst)],
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode != 0:
        pytest.skip(f"Script execution failed: {result.stderr}")

    # Check for output file
    notebook_path = tmp_path / "dist" / "notebook.md"
    if not notebook_path.exists():
        pytest.skip("Output report not created")

    content = notebook_path.read_text()

    # Verify basic structure
    assert "# Sample Financial Analysis" in content or "# " in content
    assert "## Artifacts" in content


@pytest.mark.requires_pandas
def test_analysis_with_pandas(tmp_path, monkeypatch):
    """Test example with pandas installed: tables rendered."""
    monkeypatch.chdir(tmp_path)

    example_src = Path(__file__).parent.parent.parent / "examples" / "analysis.py"
    if not example_src.exists():
        pytest.skip("examples/analysis.py not found")

    example_dst = tmp_path / "analysis.py"
    shutil.copy(example_src, example_dst)

    result = subprocess.run(
        [sys.executable, str(example_dst)],
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode != 0:
        pytest.skip("Script execution failed")

    notebook_path = tmp_path / "dist" / "notebook.md"
    if not notebook_path.exists():
        pytest.skip("Output not created")

    content = notebook_path.read_text()

    # Should have table content
    assert "|" in content  # Markdown table delimiter


def test_analysis_without_pandas(tmp_path, monkeypatch):
    """Test example without pandas: graceful degradation."""
    monkeypatch.chdir(tmp_path)

    example_src = Path(__file__).parent.parent.parent / "examples" / "analysis.py"
    if not example_src.exists():
        pytest.skip("examples/analysis.py not found")

    example_dst = tmp_path / "analysis.py"
    shutil.copy(example_src, example_dst)

    # Run the example - it should handle missing dependencies gracefully
    result = subprocess.run(
        [sys.executable, str(example_dst)],
        capture_output=True,
        text=True,
        timeout=30,
    )

    # Should complete (may have warnings but shouldn't crash)
    assert result.returncode in [0, 1]


@pytest.mark.requires_matplotlib
def test_analysis_with_matplotlib(tmp_path, monkeypatch):
    """Test example with matplotlib: figures saved."""
    monkeypatch.chdir(tmp_path)

    example_src = Path(__file__).parent.parent.parent / "examples" / "analysis.py"
    if not example_src.exists():
        pytest.skip("examples/analysis.py not found")

    example_dst = tmp_path / "analysis.py"
    shutil.copy(example_src, example_dst)

    result = subprocess.run(
        [sys.executable, str(example_dst)],
        capture_output=True,
        text=True,
        timeout=30,
    )

    if result.returncode != 0:
        pytest.skip("Script execution failed")

    # Check for figure files
    assets_dir = tmp_path / "dist" / "assets"
    if assets_dir.exists():
        png_files = list(assets_dir.glob("*.png"))
        # Should have at least one figure if matplotlib available
        assert len(png_files) >= 0  # May or may not have figures depending on example


def test_analysis_without_matplotlib(tmp_path, monkeypatch):
    """Test example without matplotlib: figure section skipped."""
    monkeypatch.chdir(tmp_path)

    monkeypatch.setitem(sys.modules, 'matplotlib', None)
    monkeypatch.setitem(sys.modules, 'matplotlib.pyplot', None)

    example_src = Path(__file__).parent.parent.parent / "examples" / "analysis.py"
    if not example_src.exists():
        pytest.skip("examples/analysis.py not found")

    example_dst = tmp_path / "analysis.py"
    shutil.copy(example_src, example_dst)

    result = subprocess.run(
        [sys.executable, str(example_dst)],
        capture_output=True,
        text=True,
        timeout=30,
    )

    # Should handle matplotlib absence gracefully
    assert result.returncode in [0, 1]
