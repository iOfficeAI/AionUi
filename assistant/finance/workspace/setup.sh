#!/bin/bash
set -e

MARKER=".initialized"

if [ -f "$MARKER" ]; then
  echo "Environment already initialized."
  exit 0
fi

echo "Setting up Finance Research Assistant Python environment..."

# Detect python
PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [ -z "$PYTHON" ]; then
  echo "ERROR: Python 3 not found. Please install Python 3.11+."
  exit 1
fi

echo "Using Python: $($PYTHON --version)"

# Install dependencies
$PYTHON -m pip install -q --upgrade pip
$PYTHON -m pip install -q pydantic requests pandas numpy python-dotenv httpx plotly kaleido

echo "Dependencies installed."
touch "$MARKER"
echo "Environment ready. You can now run finance research commands."
