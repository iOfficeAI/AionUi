"""notebookmd — Streamlit-like API for AI agents to generate markdown reports.

Provides a familiar ``st.*``-style API that renders to clean, agent-readable
Markdown.  Designed for AI agents doing data analysis — just call functions
sequentially, no cells or execution contexts needed.

Usage::

    from notebookmd import nb

    st = nb("dist/report.md", title="VCB Investment Analysis")

    st.header("Key Metrics")
    st.metric("ROE", "22.5%", delta="+4.5%")
    st.metric_row([
        {"label": "P/E", "value": "15.2x"},
        {"label": "P/B", "value": "2.3x"},
        {"label": "Dividend", "value": "1.2%"},
    ])

    st.header("Price Trend")
    st.line_chart(df, x="date", y="close", title="VCB Close Price")
    st.dataframe(df.head(), name="Recent Prices")

    st.header("Analysis")
    st.write("VCB shows **strong fundamentals** with best-in-class ROE.")
    st.success("Analysis complete!")

    with st.expander("Raw Data"):
        st.dataframe(df)

    st.save()
"""

from .core import Notebook, NotebookConfig

__version__ = "0.3.0"
__all__ = ["nb", "Notebook", "NotebookConfig"]


def nb(
    out_md: str,
    title: str = "Report",
    assets_dir: str | None = None,
    cfg: NotebookConfig | None = None,
) -> Notebook:
    """Create a new report builder (convenience factory).

    Args:
        out_md: Path to the output markdown file (e.g. "dist/report.md").
        title: Title for the report.
        assets_dir: Directory for saving figures/assets. Defaults to ``<out_md_dir>/assets/``.
        cfg: Optional NotebookConfig for customizing rendering behavior.

    Returns:
        A configured Notebook instance with Streamlit-like API.

    Example::

        st = nb("dist/report.md", title="My Analysis")
        st.header("Overview")
        st.metric("Revenue", "$1.2M", delta="+12%")
        st.save()
    """
    return Notebook(out_md=out_md, title=title, assets_dir=assets_dir, cfg=cfg)
