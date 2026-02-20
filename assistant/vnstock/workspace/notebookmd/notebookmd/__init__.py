"""notebookmd — Python-first notebook-like report generator for agent-readable Markdown.

Usage::

    from notebookmd import nb

    N = nb("dist/notebook.md", title="My Analysis")

    with N.cell("Load data", code=True):
        df = pd.read_csv("data.csv")
        N.note(f"Rows: {len(df):,}")
        N.table(df.head(), name="Preview")

    N.save()
"""

from .core import Notebook, NotebookConfig

__version__ = "0.1.0"
__all__ = ["nb", "Notebook", "NotebookConfig"]


def nb(
    out_md: str,
    title: str = "Notebook",
    assets_dir: str | None = None,
    cfg: NotebookConfig | None = None,
) -> Notebook:
    """Create a new Notebook instance (convenience factory).

    Args:
        out_md: Path to the output markdown file (e.g. "dist/notebook.md").
        title: Title for the notebook report.
        assets_dir: Directory for saving figures/assets. Defaults to ``<out_md_dir>/assets/``.
        cfg: Optional NotebookConfig for customizing rendering behavior.

    Returns:
        A configured Notebook instance.
    """
    return Notebook(out_md=out_md, title=title, assets_dir=assets_dir, cfg=cfg)
