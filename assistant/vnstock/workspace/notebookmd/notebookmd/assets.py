"""Asset management: saving figures, tracking artifacts, and generating the artifact index."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


class AssetManager:
    """Manages saved artifacts (images, CSVs) and generates the artifact index section."""

    def __init__(self, assets_dir: Path, base_dir: Path):
        """
        Args:
            assets_dir: Directory where assets are saved.
            base_dir: The parent directory of the output markdown (for relative paths).
        """
        self.assets_dir = assets_dir
        self.base_dir = base_dir
        self._artifacts: list[str] = []  # relative paths

    def ensure_dir(self) -> None:
        """Create the assets directory if it doesn't exist."""
        self.assets_dir.mkdir(parents=True, exist_ok=True)

    def rel_path(self, absolute: Path) -> str:
        """Get the path of an asset relative to the markdown output directory."""
        return os.path.relpath(absolute, start=self.base_dir)

    def register(self, rel: str) -> None:
        """Register an artifact by its relative path (deduplicates)."""
        if rel not in self._artifacts:
            self._artifacts.append(rel)

    @property
    def artifacts(self) -> list[str]:
        return list(self._artifacts)

    def save_figure(self, fig: Any, filename: str, dpi: int = 160) -> str:
        """Save a matplotlib figure to the assets directory.

        Args:
            fig: A matplotlib Figure object.
            filename: Output filename (e.g. "daily_volume.png").
            dpi: Resolution for the saved image.

        Returns:
            Relative path to the saved figure.
        """
        try:
            import matplotlib.pyplot as plt
        except ImportError:
            raise ImportError("matplotlib is required for saving figures. Install with: pip install notebookmd[plotting]")

        self.ensure_dir()
        out_file = self.assets_dir / filename
        fig.savefig(out_file, dpi=dpi, bbox_inches="tight")
        plt.close(fig)

        rel = self.rel_path(out_file)
        self.register(rel)
        return rel

    def save_csv(self, df: Any, filename: str) -> str:
        """Save a DataFrame as CSV to the assets directory.

        Args:
            df: A pandas DataFrame.
            filename: Output filename (e.g. "aggregated.csv").

        Returns:
            Relative path to the saved CSV.
        """
        self.ensure_dir()
        out_file = self.assets_dir / filename
        df.to_csv(out_file, index=False)

        rel = self.rel_path(out_file)
        self.register(rel)
        return rel

    def render_index(self) -> str:
        """Render the artifacts index as a markdown section."""
        if not self._artifacts:
            return "_No artifacts generated._\n"

        lines = []
        for art in self._artifacts:
            name = Path(art).name
            lines.append(f"- [{name}]({art})")
        return "\n".join(lines) + "\n"
