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

    def save_plotly(self, fig: Any, filename: str) -> str:
        """Save a Plotly figure to the assets directory.

        Tries to save as a static image (PNG). Falls back to HTML if kaleido
        is not installed.

        Args:
            fig: A plotly Figure object.
            filename: Output filename (e.g. "chart.png" or "chart.html").

        Returns:
            Relative path to the saved figure.
        """
        self.ensure_dir()
        out_file = self.assets_dir / filename

        try:
            # Try static image export (requires kaleido)
            if filename.endswith(".html"):
                fig.write_html(str(out_file))
            else:
                fig.write_image(str(out_file), scale=2)
        except Exception:
            # Fallback to HTML
            html_name = Path(filename).stem + ".html"
            out_file = self.assets_dir / html_name
            fig.write_html(str(out_file))

        rel = self.rel_path(out_file)
        self.register(rel)
        return rel

    def save_altair(self, chart: Any, filename: str) -> str:
        """Save an Altair chart to the assets directory.

        Tries to save as a static image (PNG). Falls back to HTML if
        altair_saver / vl-convert is not installed.

        Args:
            chart: An altair Chart object.
            filename: Output filename (e.g. "chart.png" or "chart.html").

        Returns:
            Relative path to the saved chart.
        """
        self.ensure_dir()
        out_file = self.assets_dir / filename

        try:
            if filename.endswith(".html"):
                chart.save(str(out_file), format="html")
            else:
                chart.save(str(out_file))
        except Exception:
            # Fallback: save as HTML
            html_name = Path(filename).stem + ".html"
            out_file = self.assets_dir / html_name
            try:
                chart.save(str(out_file), format="html")
            except Exception:
                # Last resort: save the Vega-Lite JSON spec
                import json
                json_name = Path(filename).stem + ".json"
                out_file = self.assets_dir / json_name
                spec = chart.to_dict()
                out_file.write_text(json.dumps(spec, indent=2))

        rel = self.rel_path(out_file)
        self.register(rel)
        return rel

    def save_image(self, source: Any, filename: str) -> str:
        """Save a PIL Image or numpy array to the assets directory.

        Args:
            source: A PIL Image object or numpy array.
            filename: Output filename (e.g. "image.png").

        Returns:
            Relative path to the saved image.
        """
        self.ensure_dir()
        out_file = self.assets_dir / filename

        try:
            # Try PIL Image
            source.save(str(out_file))
        except AttributeError:
            # Try numpy array via PIL
            try:
                from PIL import Image
                img = Image.fromarray(source)
                img.save(str(out_file))
            except ImportError:
                # Fallback via matplotlib
                import matplotlib.pyplot as plt
                fig, ax = plt.subplots()
                ax.imshow(source)
                ax.axis("off")
                fig.savefig(str(out_file), bbox_inches="tight", pad_inches=0)
                plt.close(fig)

        rel = self.rel_path(out_file)
        self.register(rel)
        return rel

    def save_json(self, data: Any, filename: str) -> str:
        """Save data as a JSON file to the assets directory.

        Args:
            data: Any JSON-serializable object.
            filename: Output filename (e.g. "data.json").

        Returns:
            Relative path to the saved JSON file.
        """
        import json

        self.ensure_dir()
        out_file = self.assets_dir / filename
        out_file.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str))

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
