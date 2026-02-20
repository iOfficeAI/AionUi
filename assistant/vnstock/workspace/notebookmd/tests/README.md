# notebookmd Test Suite

Comprehensive test suite for the notebookmd package with 122 tests covering all core functionality.

## Test Structure

```
tests/
├── conftest.py                    # Shared fixtures for all tests
├── pytest.ini                     # Pytest configuration
├── unit/                          # Unit tests (90 tests)
│   ├── test_capture.py            # Capture module (15 tests)
│   ├── test_emitters.py           # Emitters module (30 tests)
│   ├── test_assets.py             # Assets module (20 tests)
│   └── test_core.py               # Core module (25 tests)
├── integration/                   # Integration tests (26 tests)
│   ├── test_notebook_workflow.py  # End-to-end workflows (10 tests)
│   ├── test_optional_deps.py      # Graceful degradation (8 tests)
│   └── test_asset_integration.py  # Asset management (8 tests)
├── samples/                       # Sample execution tests (6 tests)
│   └── test_examples.py           # Validate example scripts
└── README.md                      # This file
```

## Running Tests

### Install Dependencies

```bash
cd /path/to/notebookmd
pip install -e ".[dev]"  # Installs pytest + pandas + matplotlib
```

### Run All Tests

```bash
# Basic run
pytest

# Verbose output with test names
pytest -v

# Show print statements
pytest -s

# Stop on first failure
pytest -x
```

### Run Specific Test Suites

```bash
# Unit tests only
pytest tests/unit/

# Integration tests only
pytest tests/integration/

# Sample tests only
pytest tests/samples/

# Specific test file
pytest tests/unit/test_core.py -v

# Specific test function
pytest tests/unit/test_core.py::test_cell_basic_execution -v
```

### Coverage Reports

```bash
# Run with coverage
pytest --cov=notebookmd --cov-report=term-missing

# Generate HTML coverage report
pytest --cov=notebookmd --cov-report=html

# Open HTML report
open htmlcov/index.html
```

### Run Tests by Marker

```bash
# Tests requiring pandas
pytest -m requires_pandas

# Tests requiring matplotlib
pytest -m requires_matplotlib

# Integration tests
pytest -m integration

# Slow tests
pytest -m slow

# Tests without optional dependencies
pytest -m "not requires_pandas and not requires_matplotlib"
```

## Test Markers

Tests are marked with the following markers (configured in `pytest.ini`):

- **`requires_pandas`**: Tests that need pandas to be installed
- **`requires_matplotlib`**: Tests that need matplotlib to be installed
- **`slow`**: Tests that take more than 1 second
- **`integration`**: Integration tests that test multiple components

## Shared Fixtures

Common fixtures are defined in `conftest.py`:

### Basic Fixtures

- **`tmp_notebook_dir`**: Temporary directory for notebook output
- **`mock_notebook`**: Pre-configured Notebook instance for testing

### Pandas Fixtures (skip if pandas unavailable)

- **`sample_df`**: Sample DataFrame with dates, values, categories (10 rows)
- **`long_df`**: DataFrame with 50 rows for truncation testing
- **`df_with_nulls`**: DataFrame with null values for summary testing

### Matplotlib Fixtures (skip if matplotlib unavailable)

- **`sample_figure`**: Sample matplotlib figure with line plot

## Coverage Goals

| Module        | Target Coverage | Critical Paths                            |
| ------------- | --------------- | ----------------------------------------- |
| `core.py`     | 95%             | cell(), save(), \_capture_cell_source()   |
| `emitters.py` | 90%             | All render\_\* functions                  |
| `assets.py`   | 95%             | save_figure(), save_csv(), render_index() |
| `capture.py`  | 95%             | capture_streams(), exception handling     |
| **Overall**   | **93%+**        | All public APIs                           |

## Test Organization

### Unit Tests (90 tests)

Test individual modules in isolation:

- **test_capture.py** (15 tests): Stream capture, exception handling
- **test_emitters.py** (30 tests): All rendering functions, graceful degradation
- **test_assets.py** (20 tests): Asset management, figure/CSV saving
- **test_core.py** (25 tests): Notebook class, config, cell execution

### Integration Tests (26 tests)

Test multiple components working together:

- **test_notebook_workflow.py** (10 tests): Complete workflows from init to save
- **test_optional_deps.py** (8 tests): Behavior when pandas/matplotlib missing
- **test_asset_integration.py** (8 tests): Asset management end-to-end

### Sample Tests (6 tests)

Validate example scripts run correctly:

- **test_examples.py** (6 tests): Run examples/analysis.py with/without dependencies

## Common Test Patterns

### Testing with Temporary Files

```python
def test_save_creates_file(tmp_path):
    from notebookmd import Notebook
    N = Notebook(out_md=str(tmp_path / "test.md"))
    with N.cell("Test"):
        N.note("Hello")
    path = N.save()
    assert path.exists()
    assert "Hello" in path.read_text()
```

### Testing Optional Dependencies

```python
def test_table_without_pandas(monkeypatch):
    import sys
    import importlib
    monkeypatch.setitem(sys.modules, 'pandas', None)

    import notebookmd.emitters
    importlib.reload(notebookmd.emitters)

    from notebookmd.emitters import render_table
    result = render_table({}, name="Test")
    assert "pandas not installed" in result.lower()
```

### Testing Exception Handling

```python
def test_cell_reraises_exception(mock_notebook):
    with pytest.raises(ValueError, match="Test error"):
        with mock_notebook.cell("Test"):
            raise ValueError("Test error")

    md = mock_notebook.to_markdown()
    assert "ValueError" in md
```

## Continuous Integration

To run tests in CI/CD:

```yaml
# Example GitHub Actions workflow
- name: Install dependencies
  run: |
    pip install -e ".[dev]"

- name: Run tests with coverage
  run: |
    pytest --cov=notebookmd --cov-report=xml --cov-report=term-missing

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Troubleshooting

### Tests Fail Due to Missing Dependencies

If pandas or matplotlib are not installed, tests marked with `requires_pandas` or `requires_matplotlib` will be skipped automatically.

To run all tests, install optional dependencies:

```bash
pip install pandas matplotlib
```

### Module Reload Issues

When testing optional dependency fallbacks, module reloading is necessary:

```python
import importlib
import notebookmd.emitters
importlib.reload(notebookmd.emitters)
```

### Matplotlib Backend Issues

Tests use the 'Agg' backend (non-interactive):

```python
import matplotlib
matplotlib.use("Agg")
```

This prevents GUI-related errors in headless environments.

## Development Workflow

1. **Before committing**: Run full test suite

   ```bash
   pytest -v
   ```

2. **Check coverage**: Ensure target met

   ```bash
   pytest --cov=notebookmd --cov-report=term-missing
   ```

3. **Test with minimal dependencies**: Verify graceful degradation

   ```bash
   # In virtualenv without pandas/matplotlib
   pytest -m "not requires_pandas and not requires_matplotlib"
   ```

4. **Run sample tests**: Validate examples still work
   ```bash
   pytest tests/samples/ -v
   ```

## Expected Test Count

**Total: 122 tests**

- Unit: 90 tests
- Integration: 26 tests
- Samples: 6 tests

To verify count:

```bash
pytest --collect-only | grep "test session starts" -A 100
```
