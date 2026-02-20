#!/bin/bash
set -e

MARKER=".initialized"

if [ -f "$MARKER" ]; then
  echo "Environment already initialized."
  exit 0
fi

echo "Setting up Vietnamese Stock Market (vnstock) Research Assistant Python environment..."

# Detect python
PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [ -z "$PYTHON" ]; then
  echo "ERROR: Python 3 not found. Please install Python 3.10+."
  exit 1
fi

echo "Using Python: $($PYTHON --version)"

# Install dependencies
$PYTHON -m pip install -q --upgrade pip
# Original finance dependencies
$PYTHON -m pip install -q pydantic requests pandas numpy python-dotenv httpx plotly kaleido dash
# Add vnstock for Vietnamese stock data
$PYTHON -m pip install -q vnstock>=3.4.2

echo "Dependencies installed (including vnstock for Vietnamese market data)."
touch "$MARKER"
echo "Environment ready. You can now run finance research commands."
echo "To launch the dashboard: python app.py"
