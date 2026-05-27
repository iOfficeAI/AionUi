#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-$HOME/Star-Office-UI}"
PORT_FRONTEND="${PORT_FRONTEND:-19000}"
PORT_BACKEND="${PORT_BACKEND:-18791}"

echo "[star-office-uninstall] target: $TARGET_DIR"
echo

# --- Step 1: Kill processes matching the target directory ---

echo "[step 1/5] Stopping Star-Office-UI processes..."

killed_any=false

kill_matching() {
  local pattern="$1"
  local label="$2"
  local pids
  pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    return
  fi
  for pid in $pids; do
    echo "  stopping $label PID=$pid (SIGTERM)"
    kill "$pid" 2>/dev/null || true
    killed_any=true
  done
}

# Match processes by the actual target directory path
kill_matching "$TARGET_DIR/backend" "backend"
kill_matching "$TARGET_DIR/frontend" "frontend"
# Also match by directory basename in case cwd differs from full path
dir_basename="$(basename "$TARGET_DIR")"
kill_matching "$dir_basename/backend" "backend"
kill_matching "$dir_basename/frontend" "frontend"

if [ "$killed_any" = true ]; then
  echo "  waiting for graceful shutdown..."
  sleep 2
  # Force kill any survivors
  for pattern in "$TARGET_DIR/backend" "$TARGET_DIR/frontend" "$dir_basename/backend" "$dir_basename/frontend"; do
    pids="$(pgrep -f "$pattern" 2>/dev/null || true)"
    for pid in $pids; do
      echo "  force killing PID=$pid (SIGKILL)"
      kill -9 "$pid" 2>/dev/null || true
    done
  done
else
  echo "  no Star-Office-UI processes found"
fi

echo

# --- Step 2: Check and clean ports ---

echo "[step 2/5] Checking ports $PORT_FRONTEND and $PORT_BACKEND..."

for port in "$PORT_FRONTEND" "$PORT_BACKEND"; do
  pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    echo "  OK   port $port is free"
    continue
  fi
  for pid in $pids; do
    # Check if process is related to Star Office before killing
    cmd="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if echo "$cmd" | grep -qi "star.office\|$dir_basename" 2>/dev/null; then
      echo "  killing Star-Office process on port $port, PID=$pid ($cmd)"
      kill -9 "$pid" 2>/dev/null || true
    else
      echo "  WARN port $port occupied by non-Star-Office process PID=$pid ($cmd)"
      echo "       skipping — kill manually if needed"
    fi
  done
done

sleep 1

echo

# --- Step 3: Remove directory ---

echo "[step 3/5] Removing directory $TARGET_DIR..."

if [ -d "$TARGET_DIR" ]; then
  rm -rf "$TARGET_DIR"
  echo "  OK   directory removed"
else
  echo "  SKIP directory does not exist"
fi

echo

# --- Step 4: Clean up temp files left by doctor script ---

echo "[step 4/5] Cleaning temp files..."

cleaned=false
for f in /tmp/star_office_doctor_body.txt /tmp/star_office_port_*.txt; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "  removed $f"
    cleaned=true
  fi
done
if [ "$cleaned" = false ]; then
  echo "  no temp files to clean"
fi

echo

# --- Step 5: Final verification ---

echo "[step 5/5] Final verification..."

errors=0

# Check processes
if pgrep -f "$TARGET_DIR" >/dev/null 2>&1 || pgrep -f "$dir_basename/backend\|$dir_basename/frontend" >/dev/null 2>&1; then
  echo "  FAIL Star-Office-UI processes still running:"
  pgrep -af "$TARGET_DIR" 2>/dev/null || true
  pgrep -af "$dir_basename" 2>/dev/null || true
  errors=$((errors + 1))
else
  echo "  OK   no Star-Office-UI processes"
fi

# Check ports
for port in "$PORT_FRONTEND" "$PORT_BACKEND"; do
  occupant="$(lsof -ti :"$port" 2>/dev/null || true)"
  if [ -n "$occupant" ]; then
    cmd="$(ps -p "$occupant" -o args= 2>/dev/null || true)"
    if echo "$cmd" | grep -qi "star.office\|$dir_basename" 2>/dev/null; then
      echo "  FAIL port $port still occupied by Star-Office process"
      errors=$((errors + 1))
    else
      echo "  OK   port $port occupied by unrelated process (not a Star-Office residual)"
    fi
  else
    echo "  OK   port $port free"
  fi
done

# Check directory
if [ -d "$TARGET_DIR" ]; then
  echo "  FAIL directory still exists: $TARGET_DIR"
  errors=$((errors + 1))
else
  echo "  OK   directory gone"
fi

echo
if [ "$errors" -eq 0 ]; then
  echo "[star-office-uninstall] Done. Star Office has been completely uninstalled."
else
  echo "[star-office-uninstall] Completed with $errors issue(s). Review output above."
fi
