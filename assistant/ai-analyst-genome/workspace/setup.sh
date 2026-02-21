#!/bin/bash
set -e

MARKER=".initialized"

# Support --force flag to re-run even if initialized
FORCE=0
if [ "$1" = "--force" ]; then
  FORCE=1
fi

if [ -f "$MARKER" ] && [ $FORCE -eq 0 ]; then
  echo "Environment already initialized. Use --force to re-run."
  exit 0
fi

echo "Setting up AI Analyst (Genome) Python environment..."

# Detect Python 3.10+ (required for vnstock>=3.4.2)
PYTHON=""
for py in /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3.10 \
          /usr/local/bin/python3.12 /usr/local/bin/python3.11 /usr/local/bin/python3.10 \
          python3.12 python3.11 python3.10 python3; do
  if command -v "$py" >/dev/null 2>&1; then
    # Get version and check if >= 3.10
    VERSION=$("$py" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    MAJOR=$(echo "$VERSION" | cut -d. -f1)
    MINOR=$(echo "$VERSION" | cut -d. -f2)

    if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 10 ]; then
      PYTHON="$py"
      echo "Found compatible Python: $($py --version)"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "ERROR: Python 3.10+ required for vnstock>=3.4.2"
  echo ""
  echo "Please install Python 3.10 or later:"
  echo "  macOS:  brew install python@3.10"
  echo "  Ubuntu: sudo apt install python3.10"
  echo ""
  echo "After installation, re-run this script."
  exit 1
fi

# Store Python path for runtime use
echo "$PYTHON" > .python_bin

# Install dependencies
echo "Installing Python dependencies..."
$PYTHON -m pip install -q --upgrade pip
# Core data dependencies
$PYTHON -m pip install -q pandas>=2.1.0 numpy>=1.24.0
# Vietnamese stock data (requires Python 3.10+)
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
$PYTHON -m pip install -q "pydantic>=2.4.2"
# Configuration
$PYTHON -m pip install -q "pyyaml>=6.0"
# HTTP client
$PYTHON -m pip install -q "httpx>=0.27.0" "requests>=2.32.5"
# Additional dependencies discovered during agent runs
$PYTHON -m pip install -q beautifulsoup4 IPython

echo "Dependencies installed."

# Add vnstock-data skill to Python path
VNSTOCK_SKILL="$(pwd)/.claude/skills/vnstock-data"
if [ -d "$VNSTOCK_SKILL" ]; then
  # Create .pth file in user site-packages
  SITE_PACKAGES=$($PYTHON -m site --user-site)
  mkdir -p "$SITE_PACKAGES" 2>/dev/null || true
  echo "$VNSTOCK_SKILL" > "$SITE_PACKAGES/vnstock_analyst.pth"
  echo "Added vnstock-data to Python path"
fi

# Create working directories
mkdir -p _working outputs data/cache

touch "$MARKER"
echo ""
echo "Environment ready."
echo "Python: $($PYTHON --version) at $PYTHON"
echo "Ask a question to get started, or use /help for available commands."
