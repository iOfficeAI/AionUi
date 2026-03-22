#!/bin/bash
# validate-morph.sh — Per-slide Morph validation script
# Run after creating/modifying each slide to catch ghost failures early

set -e

usage() {
  cat <<EOF
Usage: ./validate-morph.sh <file.pptx> <slide-number> [scene-actor-names]

Arguments:
  file.pptx          Path to the PPT file
  slide-number       Slide number to validate (e.g., 2, 3, 4...)
  scene-actor-names  Comma-separated list of scene actor names (optional)
                     Example: "dot-main,line-top,slash-accent,bg-circle"
                     If omitted, script will try to detect from slide 1

Examples:
  ./validate-morph.sh demo.pptx 2
  ./validate-morph.sh demo.pptx 3 "dot-main,line-top,circle-bg"

Checks:
  1. transition=morph is set (slides 2+)
  2. Scene actors exist with same names as slide 1
  3. No non-scene shapes with x < 36cm that appear to be old content
  4. At least 6 shapes have changed position/size vs previous slide

Exit codes:
  0 = All checks passed
  1 = Validation failed (fix required before next slide)
EOF
  exit 1
}

# Parse arguments
if [ $# -lt 2 ]; then
  usage
fi

FILE="$1"
SLIDE_NUM="$2"
SCENE_ACTORS="${3:-}"

if [ ! -f "$FILE" ]; then
  echo "❌ ERROR: File not found: $FILE"
  exit 1
fi

if ! command -v officecli &> /dev/null; then
  echo "❌ ERROR: officecli not installed. Run:"
  echo "   curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCli/main/install.sh | bash"
  exit 1
fi

echo "🔍 Validating slide $SLIDE_NUM in $FILE..."
echo ""

# Get slide data
SLIDE_DATA=$(officecli get "$FILE" "/slide[$SLIDE_NUM]" --depth 1 2>&1)

if echo "$SLIDE_DATA" | grep -q "Slide not found"; then
  echo "❌ ERROR: Slide $SLIDE_NUM does not exist"
  exit 1
fi

# Parse scene actor names
if [ -z "$SCENE_ACTORS" ]; then
  echo "📌 Scene actors not provided — attempting to detect from slide 1..."
  SLIDE1_DATA=$(officecli get "$FILE" "/slide[1]" --depth 1 2>&1)
  # Extract names that start with !! (scene actors)
  SCENE_ACTORS=$(echo "$SLIDE1_DATA" | grep -oP 'name="!!\K[^"]+' | tr '\n' ',' | sed 's/,$//')
  if [ -z "$SCENE_ACTORS" ]; then
    echo "⚠️  WARNING: Could not detect scene actors from slide 1"
    echo "   Consider providing them explicitly: ./validate-morph.sh $FILE $SLIDE_NUM \"dot-main,line-top\""
  else
    echo "   Detected scene actors: $SCENE_ACTORS"
  fi
fi

echo ""

# Check 1: transition=morph (for slides 2+)
if [ "$SLIDE_NUM" -gt 1 ]; then
  if echo "$SLIDE_DATA" | grep -q 'transition="morph'; then
    echo "✅ Check 1/4: transition=morph is set"
  else
    echo "❌ Check 1/4: transition=morph NOT set"
    echo "   Fix: officecli set \"$FILE\" \"/slide[$SLIDE_NUM]\" --prop transition=morph"
    exit 1
  fi
else
  echo "⏭️  Check 1/4: Skipped (slide 1 doesn't need transition=morph)"
fi

# Check 2: Scene actors exist
if [ -n "$SCENE_ACTORS" ]; then
  IFS=',' read -ra ACTORS <<< "$SCENE_ACTORS"
  MISSING=()
  for actor in "${ACTORS[@]}"; do
    if ! echo "$SLIDE_DATA" | grep -q "name=\"!!$actor\""; then
      MISSING+=("$actor")
    fi
  done

  if [ ${#MISSING[@]} -eq 0 ]; then
    echo "✅ Check 2/4: All ${#ACTORS[@]} scene actors exist"
  else
    echo "❌ Check 2/4: Missing scene actors: ${MISSING[*]}"
    echo "   Scene actors must persist across all slides for Morph to work"
    exit 1
  fi
else
  echo "⏭️  Check 2/4: Skipped (no scene actors provided)"
fi

# Check 3: Detect shapes with x < 36cm that might be unghosted content
# This is a heuristic: shapes with x < 35cm and text content are likely content actors
VISIBLE_SHAPES=$(echo "$SLIDE_DATA" | grep -E 'shape\[[0-9]+\]' | grep -v 'name="!!' | grep 'text=' | while read -r line; do
  # Extract x coordinate
  X_VAL=$(echo "$line" | grep -oP 'x="\K[^"]+' || echo "")
  if [ -n "$X_VAL" ]; then
    # Convert to numeric (remove 'cm' suffix)
    X_NUM=$(echo "$X_VAL" | sed 's/cm$//')
    # Check if x < 35cm (allowing some margin)
    if awk "BEGIN {exit !($X_NUM < 35)}"; then
      # Extract shape index
      SHAPE_IDX=$(echo "$line" | grep -oP 'shape\[\K[0-9]+')
      # Extract text preview
      TEXT_PREVIEW=$(echo "$line" | grep -oP 'text="\K[^"]{0,40}')
      echo "shape[$SHAPE_IDX]: x=${X_VAL}, text=\"${TEXT_PREVIEW}...\""
    fi
  fi
done)

if [ -n "$VISIBLE_SHAPES" ]; then
  SHAPE_COUNT=$(echo "$VISIBLE_SHAPES" | wc -l | tr -d ' ')
  echo "⚠️  Check 3/4: Found $SHAPE_COUNT non-scene shape(s) with x < 35cm and text content:"
  echo "$VISIBLE_SHAPES" | sed 's/^/   /'
  echo ""
  echo "   If these are from the previous slide, ghost them:"
  while IFS= read -r shape_line; do
    SHAPE_IDX=$(echo "$shape_line" | grep -oP 'shape\[\K[0-9]+')
    echo "   officecli set \"$FILE\" \"/slide[$SLIDE_NUM]/shape[$SHAPE_IDX]\" --prop x=36cm"
  done <<< "$VISIBLE_SHAPES"
  exit 1
else
  echo "✅ Check 3/4: No unghosted content detected (all text shapes are either scene actors or x >= 35cm)"
fi

# Check 4: Scene actor changes (heuristic — just verify some actors are not at default positions)
# This is a basic check; a full diff would require comparing with previous slide
ACTOR_CHANGES=0
if [ -n "$SCENE_ACTORS" ] && [ "$SLIDE_NUM" -gt 1 ]; then
  # Get previous slide data
  PREV_SLIDE_DATA=$(officecli get "$FILE" "/slide[$((SLIDE_NUM-1))]" --depth 1 2>&1)

  IFS=',' read -ra ACTORS <<< "$SCENE_ACTORS"
  for actor in "${ACTORS[@]}"; do
    # Get current position
    CURR_X=$(echo "$SLIDE_DATA" | grep "name=\"!!$actor\"" | grep -oP 'x="\K[^"]+' | head -1 || echo "")
    PREV_X=$(echo "$PREV_SLIDE_DATA" | grep "name=\"!!$actor\"" | grep -oP 'x="\K[^"]+' | head -1 || echo "")

    if [ -n "$CURR_X" ] && [ -n "$PREV_X" ] && [ "$CURR_X" != "$PREV_X" ]; then
      ACTOR_CHANGES=$((ACTOR_CHANGES + 1))
    fi
  done

  if [ $ACTOR_CHANGES -ge 3 ]; then
    echo "✅ Check 4/4: At least $ACTOR_CHANGES scene actors changed position"
  else
    echo "⚠️  Check 4/4: Only $ACTOR_CHANGES scene actors changed position (recommend >= 3 for noticeable morph)"
    echo "   Suggestion: Adjust more scene actors to create spatial differentiation"
  fi
else
  echo "⏭️  Check 4/4: Skipped (slide 1 or no scene actors)"
fi

echo ""
echo "✅ Validation passed for slide $SLIDE_NUM"
echo ""
