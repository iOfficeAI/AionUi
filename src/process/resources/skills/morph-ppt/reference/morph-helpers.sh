#!/bin/bash

# Morph PPT Helper Functions
# Purpose: Simplify morph workflow by bundling common operations with built-in verification

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# morph_clone_slide: Clone slide and set transition
# ============================================
# Usage: morph_clone_slide <deck.pptx> <from_slide_num> <to_slide_num>
# Example: morph_clone_slide deck.pptx 1 2
#
# What it does:
# 1. Clone the source slide
# 2. Automatically set transition=morph
# 3. List all shapes for ghosting reference
# 4. Verify transition was set correctly
morph_clone_slide() {
    local deck=$1
    local from_slide=$2
    local to_slide=$3

    echo -e "${BLUE}📋 Cloning slide $from_slide → $to_slide...${NC}"
    officecli add "$deck" '/' --from "/slide[$from_slide]"

    echo -e "${BLUE}⚡ Setting morph transition...${NC}"
    officecli set "$deck" "/slide[$to_slide]" --prop transition=morph

    echo -e "${BLUE}📊 Listing shapes for ghosting reference:${NC}"
    officecli get "$deck" "/slide[$to_slide]" --depth 1

    # Verify transition was set
    echo -e "${BLUE}🔍 Verifying transition...${NC}"
    local trans=$(officecli get "$deck" "/slide[$to_slide]" --json 2>/dev/null | grep '"transition": "morph"')
    if [ -z "$trans" ]; then
        echo -e "${RED}❌ ERROR: Transition not set on slide $to_slide!${NC}"
        echo -e "${RED}   This slide will not have morph animation.${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ Transition verified on slide $to_slide${NC}"
    fi

    echo ""
}

# ============================================
# morph_ghost_content: Ghost multiple shapes at once
# ============================================
# Usage: morph_ghost_content <deck.pptx> <slide_num> <shape_idx1> [shape_idx2] [shape_idx3] ...
# Example: morph_ghost_content deck.pptx 2 7 8 9
#
# What it does:
# 1. Move specified shapes to x=36cm (off-screen)
# 2. Show progress for each shape
# 3. Verify all shapes were ghosted
morph_ghost_content() {
    local deck=$1
    local slide=$2
    shift 2
    local shapes=("$@")

    if [ ${#shapes[@]} -eq 0 ]; then
        echo -e "${YELLOW}⚠️  No shapes to ghost${NC}"
        return 0
    fi

    echo -e "${BLUE}👻 Ghosting ${#shapes[@]} content shape(s) on slide $slide...${NC}"

    for shape_idx in "${shapes[@]}"; do
        officecli set "$deck" "/slide[$slide]/shape[$shape_idx]" --prop x=36cm 2>/dev/null
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}  ✓ Ghosted shape[$shape_idx]${NC}"
        else
            echo -e "${RED}  ✗ Failed to ghost shape[$shape_idx]${NC}"
        fi
    done

    echo -e "${GREEN}✅ Ghosting complete${NC}"
    echo ""
}

# ============================================
# morph_verify_slide: Verify slide has correct setup
# ============================================
# Usage: morph_verify_slide <deck.pptx> <slide_num>
# Example: morph_verify_slide deck.pptx 2
#
# What it does:
# 1. Check if transition=morph is set
# 2. Check for unghosted content from previous slide (by '#sN-' prefix)
# 3. Check for duplicate content (same text at same position) - BACKUP DETECTION
# 4. Report any issues found
#
# TWO DETECTION METHODS:
#
# Method 1: Name-based detection (Primary)
#   - Checks if shapes with '#sN-' prefix are ghosted
#   - REQUIRES correct naming: '#s1-title', '#s2-card', etc.
#   - Fast and accurate when naming is correct
#
# Method 2: Duplicate detection (Backup insurance)
#   - Checks if adjacent slides have identical text at identical positions
#   - Works even if naming is wrong (e.g., 's1-title' instead of '#s1-title')
#   - Catches cases where content wasn't ghosted OR naming is incorrect
#   - Ignores ghost zone (x=36cm) duplicates (those are expected)
#
# WHY TWO METHODS?
# If agents forget '#' prefix, Method 1 fails but Method 2 still catches the problem!
morph_verify_slide() {
    local deck=$1
    local slide=$2

    echo -e "${BLUE}🔍 Verifying slide $slide...${NC}"

    local has_error=0

    # Check transition
    local trans=$(officecli get "$deck" "/slide[$slide]" --json 2>/dev/null | grep '"transition": "morph"')
    if [ -z "$trans" ]; then
        echo -e "${RED}  ❌ Missing transition=morph${NC}"
        echo -e "${RED}     Without this, slide will not animate!${NC}"
        has_error=1
    else
        echo -e "${GREEN}  ✅ Transition OK${NC}"
    fi

    # Check for unghosted content from previous slide
    local prev_slide=$((slide - 1))
    if [ $prev_slide -ge 1 ]; then
        # Use JSON output for reliable parsing
        local shapes_json=$(officecli get "$deck" "/slide[$slide]" --json 2>/dev/null)

        # Use python to parse JSON and find unghosted content
        local unghosted_check
        unghosted_check=$(printf '%s' "$shapes_json" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)

    def check_children(children, prev_slide):
        unghosted = []
        for child in children:
            name = child.get('format', {}).get('name', '')
            x = child.get('format', {}).get('x', '')
            path = child.get('path', '')

            # Check if this shape has previous slide's content prefix
            if f'#s{prev_slide}-' in name:
                # Check if it's NOT ghosted (x != 36cm)
                if x != '36cm':
                    unghosted.append(f\"{path}: name={name}, x={x}\")

            # Recursively check children
            if 'children' in child:
                unghosted.extend(check_children(child['children'], prev_slide))

        return unghosted

    if 'children' in data.get('data', {}):
        unghosted = check_children(data['data']['children'], $prev_slide)

        if unghosted:
            for item in unghosted:
                print(item)
            sys.exit(1)

    sys.exit(0)
except Exception as e:
    print(f'[helper] parse error: {e}', file=sys.stderr)
    sys.exit(2)
")
        local python_exit=$?

        if [ $python_exit -eq 1 ] && [ -n "$unghosted_check" ]; then
            echo -e "${YELLOW}  ⚠️  Warning: Found unghosted content from slide $prev_slide:${NC}"
            echo "$unghosted_check" | sed 's/^/     /'
            echo -e "${YELLOW}     These shapes should be ghosted to x=36cm${NC}"
            has_error=1
        else
            echo -e "${GREEN}  ✅ No unghosted content detected${NC}"
        fi
    fi

    # Additional check: Detect duplicate content between adjacent slides
    # (Catches cases where content shapes are missing #sN- prefix)
    if [ $prev_slide -ge 1 ]; then
        local prev_json=$(officecli get "$deck" "/slide[$prev_slide]" --json 2>/dev/null)
        local curr_json="$shapes_json"

        local duplicates
        duplicates=$(python3 -c "
import sys, json

try:
    prev_data = json.loads('''$prev_json''')
    curr_data = json.loads('''$curr_json''')

    def extract_textboxes(data, slide_num):
        boxes = []
        def walk(children):
            for child in children:
                if child.get('type') == 'textbox':
                    name = child.get('format', {}).get('name', '')
                    text = child.get('text', '').strip()
                    x = child.get('format', {}).get('x', '')
                    y = child.get('format', {}).get('y', '')
                    path = child.get('path', '')

                    # Skip empty text and very short text
                    if not text or len(text) < 6:
                        continue

                    # Clean name (remove !! prefix if present)
                    clean_name = name.replace('!!', '') if name else ''

                    # Skip pure scene actors (common keywords)
                    scene_keywords = ['ring', 'dot', 'line', 'circle', 'rect', 'slash',
                                     'accent', 'actor', 'star', 'triangle', 'diamond']
                    is_scene = any(kw in clean_name.lower() for kw in scene_keywords)

                    # Include if:
                    # 1. Name contains 'sN-' pattern (likely content even if missing #)
                    # 2. Not a pure scene actor
                    has_slide_pattern = any(f's{i}-' in clean_name for i in range(1, 20))

                    if has_slide_pattern or not is_scene:
                        boxes.append({
                            'path': path,
                            'name': name,
                            'text': text[:50],  # First 50 chars
                            'x': x,
                            'y': y
                        })

                if 'children' in child:
                    walk(child['children'])

        if 'children' in data.get('data', {}):
            walk(data['data']['children'])
        return boxes

    prev_boxes = extract_textboxes(prev_data, $prev_slide)
    curr_boxes = extract_textboxes(curr_data, $slide)

    duplicates = []
    for curr in curr_boxes:
        for prev in prev_boxes:
            # Check if text and position are identical
            if (curr['text'] == prev['text'] and
                curr['x'] == prev['x'] and
                curr['y'] == prev['y']):
                # Skip if both are already in ghost position (x=36cm)
                # (It's normal for ghosted content to be at same position)
                if curr['x'] != '36cm':
                    duplicates.append(f\"{curr['path']}: text='{curr['text']}...', pos=({curr['x']},{curr['y']})\")
                break

    if duplicates:
        for dup in duplicates:
            print(dup)
        sys.exit(1)

    sys.exit(0)
except Exception as e:
    print(f'[helper] parse error: {e}', file=sys.stderr)
    sys.exit(2)
")

        local dup_exit=$?

        if [ $dup_exit -eq 1 ] && [ -n "$duplicates" ]; then
            echo -e "${YELLOW}  ⚠️  Warning: Found duplicate content from slide $prev_slide (same text at same position):${NC}"
            echo "$duplicates" | sed 's/^/     /'
            echo -e "${YELLOW}     This might indicate:${NC}"
            echo -e "${YELLOW}     1. Content shapes missing '#sN-' prefix (can't detect for ghosting)${NC}"
            echo -e "${YELLOW}     2. Forgot to ghost previous slide's content${NC}"
            echo -e "${YELLOW}     3. Forgot to add new content for this slide${NC}"
            has_error=1
        fi
    fi

    if [ $has_error -eq 0 ]; then
        echo -e "${GREEN}✅ Slide $slide verification passed${NC}"
    else
        echo -e "${RED}❌ Slide $slide has issues - see above${NC}"
        return 1
    fi

    echo ""
}

# ============================================
# morph_final_check: Verify entire deck
# ============================================
# Usage: morph_final_check <deck.pptx>
# Example: morph_final_check deck.pptx
#
# What it does:
# 1. Check all slides (2+) have transition=morph
# 2. Summary report of any issues
morph_final_check() {
    local deck=$1

    echo -e "${BLUE}🎯 Final deck verification...${NC}"
    echo ""

    # Get total slides
    local total_slides=$(officecli view "$deck" outline 2>/dev/null | head -1 | grep -oE '[0-9]+' | head -1 || echo "0")

    if [ "$total_slides" -eq 0 ]; then
        echo -e "${RED}❌ No slides found in deck${NC}"
        return 1
    fi

    echo "Total slides: $total_slides"
    echo ""

    local error_count=0

    # Check each slide starting from slide 2
    for ((i=2; i<=total_slides; i++)); do
        if ! morph_verify_slide "$deck" "$i"; then
            ((error_count++))
        fi
    done

    echo ""
    echo "========================================="
    if [ $error_count -eq 0 ]; then
        echo -e "${GREEN}✅ All slides verified successfully!${NC}"
        echo -e "${GREEN}   Your morph animations should work correctly.${NC}"
        return 0
    else
        echo -e "${RED}❌ Found issues in $error_count slide(s)${NC}"
        echo -e "${RED}   Please fix the issues above before delivering.${NC}"
        return 1
    fi
}

# Show usage if called directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    echo "Morph PPT Helper Functions"
    echo ""
    echo "Usage: source morph-helpers.sh"
    echo ""
    echo "Available functions:"
    echo "  morph_clone_slide <deck> <from> <to>      - Clone slide and set transition"
    echo "  morph_ghost_content <deck> <slide> <idx...> - Ghost multiple shapes"
    echo "  morph_verify_slide <deck> <slide>         - Verify slide setup"
    echo "  morph_final_check <deck>                  - Verify entire deck"
    echo ""
    echo "Example:"
    echo "  source morph-helpers.sh"
    echo "  morph_clone_slide deck.pptx 1 2"
    echo "  morph_ghost_content deck.pptx 2 7 8"
    echo "  morph_verify_slide deck.pptx 2"
fi
