"""notebookmd — Python-first notebook-like report generator for agent-readable Markdown.

Provides a Streamlit-compatible API that renders to markdown, making it easy
to create rich data reports with metrics, charts, tables, status messages,
collapsible sections, and more.

Usage::

    from notebookmd import nb

    N = nb("dist/notebook.md", title="My Analysis")

    with N.cell("Load data", code=True):
        df = pd.read_csv("data.csv")
        N.note(f"Rows: {len(df):,}")
        N.table(df.head(), name="Preview")

    # Streamlit-style widgets
    N.metric("Revenue", "$1.2M", delta="+12%")
    N.metric_row([
        {"label": "Users", "value": "3,400", "delta": "+200"},
        {"label": "Churn", "value": "2.1%", "delta": "-0.3%"},
    ])
    N.line_chart(df, x="date", y="close", title="Price Trend")
    N.success("Analysis complete!")

    with N.expander("Raw Data"):
        N.dataframe(df)

    N.save()
"""

from .core import Notebook, NotebookConfig

__version__ = "0.2.0"
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
