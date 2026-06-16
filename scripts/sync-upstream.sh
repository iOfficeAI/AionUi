#!/usr/bin/env bash
# Sync upstream (iOfficeAI/AionUi) into this fork.
# Usage: ./scripts/sync-upstream.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git remote get-url upstream &>/dev/null; then
  echo "Adding upstream remote..."
  git remote add upstream https://github.com/iOfficeAI/AionUi.git
fi

echo "Fetching upstream..."
git fetch upstream

CURRENT="$(git branch --show-current)"
echo "Current branch: $CURRENT"

echo ""
echo "Step 1: merge upstream/main into local main"
git checkout main
git merge upstream/main --no-edit

echo ""
echo "Step 2: merge main into coworker (your dev branch)"
if git show-ref --verify --quiet refs/heads/coworker; then
  git checkout coworker
  git merge main --no-edit
  echo ""
  echo "Done. You are on branch 'coworker' with upstream changes merged."
  echo "Resolve conflicts if any, then: git push origin coworker"
else
  echo "Branch 'coworker' not found. Create it with: git checkout -b coworker"
  git checkout "$CURRENT"
fi
