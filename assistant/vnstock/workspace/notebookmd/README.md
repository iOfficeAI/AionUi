# notebookmd

Streamlit-like API for AI agents to generate markdown reports.

## Installation

```bash
pip install notebookmd
```

With optional dependencies:

```bash
pip install "notebookmd[all]"  # pandas + matplotlib
```

## Quick Start

```python
from notebookmd import nb

st = nb("dist/report.md", title="My Analysis")

st.header("Key Metrics")
st.metric("Revenue", "$1.2M", delta="+12%")
st.table(df.head(), name="Preview")

st.header("Trend")
st.line_chart(df, x="date", y="close", title="Price")

st.success("Done!")
st.save()
```

Use `section()` to organize reports into logical parts:

```python
st.section("Data Loading", "Fetch and validate input data")
df = load_data()
st.table(df, name="Raw Data")

st.section("Analysis")
st.kv({"Mean": f"{df['value'].mean():.2f}"}, title="Stats")
st.line_chart(df, x="date", y="value")

st.section("Conclusion")
st.write("The data shows a **clear upward trend**.")
st.save()
```

## Features

- **Streamlit-like API**: Familiar `st.*` calling convention — no cells, no contexts
- **Agent-friendly**: Designed for AI agents doing data analysis and report generation
- **Zero dependencies**: Core functionality works without pandas/matplotlib
- **Graceful degradation**: Optional dependencies enable enhanced features
- **Rich widgets**: Metrics, charts, tables, expanders, tabs, badges, and more

## Documentation

See `examples/` for comprehensive usage examples.

## License

MIT
