#!/bin/bash
set -e

MARKER=".initialized"

if [ -f "$MARKER" ]; then
  echo "Environment already initialized."
  exit 0
fi

echo "Setting up AI Analyst (Genome) Python environment..."

# Detect python
PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null)
if [ -z "$PYTHON" ]; then
  echo "ERROR: Python 3 not found. Please install Python 3.10+."
  exit 1
fi

echo "Using Python: $($PYTHON --version)"

# Install dependencies
$PYTHON -m pip install -q --upgrade pip
# Core data dependencies
$PYTHON -m pip install -q pandas>=2.1.0 numpy>=1.24.0
# Vietnamese stock data
$PYTHON -m pip install -q vnstock>=3.4.2
# Statistical analysis
$PYTHON -m pip install -q scipy>=1.11.0
# Charting and visualization
$PYTHON -m pip install -q matplotlib>=3.7.0
# Technical analysis indicators
$PYTHON -m pip install -q pandas-ta
# Interactive charting and static export
$PYTHON -m pip install -q plotly kaleido
# Data validation
$PYTHON -m pip install -q pydantic>=2.4.2
# Configuration
$PYTHON -m pip install -q pyyaml>=6.0
# HTTP client
$PYTHON -m pip install -q httpx>=0.27.0 requests>=2.32.5

echo "Dependencies installed."

# Create working directories
mkdir -p _working outputs data/cache

touch "$MARKER"
echo "Environment ready."
echo "Ask a question to get started, or use /help for available commands."
