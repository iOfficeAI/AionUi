# notebookmd

Python-first notebook-like report generator that outputs agent-readable Markdown.

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
from notebookmd import Notebook

N = Notebook("dist/notebook.md", title="My Analysis")

with N.cell("Load data"):
    df = pd.read_csv("data.csv")
    N.note(f"Rows: {len(df):,}")
    N.table(df.head(), name="Preview")

N.save()
```

## Features

- **Agent-readable**: Clean markdown format optimized for AI agents
- **Python-first**: Write analysis code with integrated report generation
- **Zero dependencies**: Core functionality works without pandas/matplotlib
- **Graceful degradation**: Optional dependencies enable enhanced features

## Documentation

See `tests/README.md` for comprehensive test documentation.

## License

MIT
