#!/bin/bash
# Source this file to get the correct Python environment
# Usage: source ./python_env.sh && $PYTHON script.py

if [ -f "$(pwd)/.python_bin" ]; then
  export PYTHON=$(cat "$(pwd)/.python_bin")
else
  # Fallback if .python_bin doesn't exist
  for py in /opt/homebrew/bin/python3.10 /opt/homebrew/bin/python3.11 \
            /opt/homebrew/bin/python3.12 python3.10 python3.11 python3; do
    if command -v "$py" >/dev/null 2>&1; then
      PYTHON="$py"
      break
    fi
  done
  export PYTHON=${PYTHON:-python3}
fi

# Add vnstock-data to Python path for this session
export PYTHONPATH="$(pwd)/.claude/skills/vnstock-data:$PYTHONPATH"
