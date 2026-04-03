#!/usr/bin/env python3
"""
Morph PPT Helper Functions
Cross-platform replacement for morph-helpers.sh (Mac / Windows / Linux)

Usage (CLI):
  python morph-helpers.py clone <deck> <from_slide> <to_slide>
  python morph-helpers.py ghost <deck> <slide> <idx> [idx ...]
  python morph-helpers.py verify <deck> <slide>
  python morph-helpers.py final-check <deck>

Usage (import):
  from morph_helpers import morph_clone_slide, morph_ghost_content, morph_verify_slide, morph_final_check
"""

import sys
import json
import subprocess
import argparse
import re

# Cross-platform color support (colorama optional)
try:
    from colorama import init, Fore, Style
    init(autoreset=True)
    GREEN  = Fore.GREEN
    RED    = Fore.RED
    YELLOW = Fore.YELLOW
    BLUE   = Fore.CYAN
    NC     = Style.RESET_ALL
except ImportError:
    GREEN = RED = YELLOW = BLUE = NC = ""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _run(*args):
    """Run a command, return (returncode, stdout, stderr)."""
    result = subprocess.run(list(args), capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def _find_nested(data, key):
    """Recursively search a nested dict for a key, return its value or None."""
    if isinstance(data, dict):
        if key in data:
            return data[key]
        for v in data.values():
            found = _find_nested(v, key)
            if found is not None:
                return found
    return None


def _has_morph_transition(json_str):
    """Check whether JSON output from officecli contains transition=morph."""
    if '"transition": "morph"' in json_str:
        return True
    try:
        data = json.loads(json_str)
        return _find_nested(data, "transition") == "morph"
    except Exception:
        return False


def _collect_shapes(children, callback):
    """Walk a shape tree depth-first, calling callback(child) for each node."""
    for child in children:
        callback(child)
        if "Children" in child:
            _collect_shapes(child["Children"], callback)


# ---------------------------------------------------------------------------
# morph_clone_slide
# ---------------------------------------------------------------------------

def morph_clone_slide(deck, from_slide, to_slide):
    """Clone slide and automatically set transition=morph, then verify.

    Args:
        deck:       path to .pptx file
        from_slide: source slide number (1-based)
        to_slide:   destination slide number (1-based)
    """
    from_slide, to_slide = int(from_slide), int(to_slide)

    print(f"{BLUE}Cloning slide {from_slide} -> {to_slide}...{NC}")
    _run("officecli", "add", deck, "/", "--from", f"/slide[{from_slide}]")

    print(f"{BLUE}Setting morph transition...{NC}")
    _run("officecli", "set", deck, f"/slide[{to_slide}]", "--prop", "transition=morph")

    print(f"{BLUE}Listing shapes for ghosting reference:{NC}")
    rc, out, _ = _run("officecli", "get", deck, f"/slide[{to_slide}]", "--depth", "1")
    print(out)

    # Verify
    print(f"{BLUE}Verifying transition...{NC}")
    rc, out, _ = _run("officecli", "get", deck, f"/slide[{to_slide}]", "--json")
    if not _has_morph_transition(out):
        print(f"{RED}ERROR: Transition not set on slide {to_slide}!{NC}")
        print(f"{RED}   This slide will not have morph animation.{NC}")
        sys.exit(1)

    print(f"{GREEN}Transition verified on slide {to_slide}{NC}")
    print()


# ---------------------------------------------------------------------------
# morph_ghost_content
# ---------------------------------------------------------------------------

def morph_ghost_content(deck, slide, *shapes):
    """Move shapes off-screen (x=36cm) to ghost them for morph animation.

    Args:
        deck:     path to .pptx file
        slide:    slide number (1-based)
        *shapes:  one or more shape indices to ghost
    """
    slide = int(slide)
    shapes = [int(s) for s in shapes]

    if not shapes:
        print(f"{YELLOW}No shapes to ghost{NC}")
        return

    print(f"{BLUE}Ghosting {len(shapes)} content shape(s) on slide {slide}...{NC}")
    for idx in shapes:
        rc, _, _ = _run("officecli", "set", deck, f"/slide[{slide}]/shape[{idx}]", "--prop", "x=36cm")
        if rc == 0:
            print(f"{GREEN}  Ghosted shape[{idx}]{NC}")
        else:
            print(f"{RED}  Failed to ghost shape[{idx}]{NC}")

    print(f"{GREEN}Ghosting complete{NC}")
    print()


# ---------------------------------------------------------------------------
# morph_verify_slide
# ---------------------------------------------------------------------------

def _check_unghosted(data, prev_slide):
    """Return list of shapes with #s{prev_slide}- prefix not yet ghosted."""
    unghosted = []

    def visit(child):
        name = child.get("Format", {}).get("name", "")
        x    = child.get("Format", {}).get("x", "")
        path = child.get("Path", "")
        if f"#s{prev_slide}-" in name and x != "36cm":
            unghosted.append(f"{path}: name={name}, x={x}")

    if "Children" in data:
        _collect_shapes(data["Children"], visit)
    return unghosted


def _check_duplicates(prev_data, curr_data):
    """Return list of shapes with identical text+position on adjacent slides (excluding ghost zone)."""
    SCENE_KEYWORDS = ["ring", "dot", "line", "circle", "rect", "slash",
                      "accent", "actor", "star", "triangle", "diamond"]

    def extract(data):
        boxes = []

        def visit(child):
            if child.get("Type") != "textbox":
                return
            name = child.get("Format", {}).get("name", "")
            text = child.get("Text", "").strip()
            x    = child.get("Format", {}).get("x", "")
            y    = child.get("Format", {}).get("y", "")
            path = child.get("Path", "")

            if not text or len(text) < 6:
                return

            clean = name.replace("!!", "")
            is_scene = any(kw in clean.lower() for kw in SCENE_KEYWORDS)
            has_slide_pattern = any(f"s{i}-" in clean for i in range(1, 20))

            if has_slide_pattern or not is_scene:
                boxes.append({"path": path, "text": text[:50], "x": x, "y": y})

        if "Children" in data:
            _collect_shapes(data["Children"], visit)
        return boxes

    prev_boxes = extract(prev_data)
    curr_boxes = extract(curr_data)

    duplicates = []
    for curr in curr_boxes:
        for prev in prev_boxes:
            if (curr["text"] == prev["text"]
                    and curr["x"] == prev["x"]
                    and curr["y"] == prev["y"]
                    and curr["x"] != "36cm"):
                duplicates.append(
                    f"{curr['path']}: text='{curr['text']}...', pos=({curr['x']},{curr['y']})"
                )
                break
    return duplicates


def morph_verify_slide(deck, slide):
    """Verify a slide has correct morph setup (transition + ghosting).

    Uses two detection methods:
      1. Name-based: shapes with #s{prev}- prefix must be at x=36cm
      2. Duplicate text: same text+position on adjacent slides (catches missing # prefix)

    Args:
        deck:  path to .pptx file
        slide: slide number (1-based)

    Returns:
        True if all checks pass, False otherwise.
    """
    slide = int(slide)
    print(f"{BLUE}Verifying slide {slide}...{NC}")
    has_error = False

    # --- Check transition ---
    rc, out, _ = _run("officecli", "get", deck, f"/slide[{slide}]", "--json")
    curr_json_str = out

    if not _has_morph_transition(curr_json_str):
        print(f"{RED}  Missing transition=morph{NC}")
        print(f"{RED}     Without this, slide will not animate!{NC}")
        has_error = True
    else:
        print(f"{GREEN}  Transition OK{NC}")

    # --- Checks against previous slide ---
    prev_slide = slide - 1
    if prev_slide >= 1:
        try:
            curr_data = json.loads(curr_json_str).get("data", {})

            # Method 1: name-based unghosted detection
            unghosted = _check_unghosted(curr_data, prev_slide)
            if unghosted:
                print(f"{YELLOW}  Warning: Found unghosted content from slide {prev_slide}:{NC}")
                for item in unghosted:
                    print(f"     {item}")
                print(f"{YELLOW}     These shapes should be ghosted to x=36cm{NC}")
                has_error = True
            else:
                print(f"{GREEN}  No unghosted content detected{NC}")
        except Exception:
            print(f"{GREEN}  No unghosted content detected{NC}")

        # Method 2: duplicate text/position detection (backup for missing # prefix)
        try:
            rc2, out2, _ = _run("officecli", "get", deck, f"/slide[{prev_slide}]", "--json")
            prev_data = json.loads(out2).get("data", {})
            curr_data = json.loads(curr_json_str).get("data", {})

            duplicates = _check_duplicates(prev_data, curr_data)
            if duplicates:
                print(f"{YELLOW}  Warning: Found duplicate content from slide {prev_slide} (same text at same position):{NC}")
                for dup in duplicates:
                    print(f"     {dup}")
                print(f"{YELLOW}     This might indicate:{NC}")
                print(f"{YELLOW}     1. Content shapes missing '#sN-' prefix (can't detect for ghosting){NC}")
                print(f"{YELLOW}     2. Forgot to ghost previous slide's content{NC}")
                print(f"{YELLOW}     3. Forgot to add new content for this slide{NC}")
                has_error = True
        except Exception:
            pass

    if not has_error:
        print(f"{GREEN}Slide {slide} verification passed{NC}")
    else:
        print(f"{RED}Slide {slide} has issues - see above{NC}")

    print()
    return not has_error


# ---------------------------------------------------------------------------
# morph_final_check
# ---------------------------------------------------------------------------

def morph_final_check(deck):
    """Verify the entire deck: all slides (2+) must pass morph_verify_slide.

    Args:
        deck: path to .pptx file

    Returns:
        True if all slides pass, False otherwise.
    """
    print(f"{BLUE}Final deck verification...{NC}")
    print()

    rc, out, _ = _run("officecli", "view", deck, "outline")
    total_slides = 0
    first_line = out.split("\n")[0] if out else ""
    match = re.search(r"(\d+)\s+slides", first_line)
    if match:
        total_slides = int(match.group(1))

    if total_slides == 0:
        print(f"{RED}No slides found in deck{NC}")
        return False

    print(f"Total slides: {total_slides}")
    print()

    error_count = 0
    for i in range(2, total_slides + 1):
        if not morph_verify_slide(deck, i):
            error_count += 1

    print("=========================================")
    if error_count == 0:
        print(f"{GREEN}All slides verified successfully!{NC}")
        print(f"{GREEN}   Your morph animations should work correctly.{NC}")
        return True
    else:
        print(f"{RED}Found issues in {error_count} slide(s){NC}")
        print(f"{RED}   Please fix the issues above before delivering.{NC}")
        return False


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="morph-helpers.py",
        description="Morph PPT Helper Functions — cross-platform (Mac / Windows / Linux)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
commands:
  clone <deck> <from_slide> <to_slide>        Clone slide and set morph transition
  ghost <deck> <slide> <idx> [idx ...]        Ghost multiple shapes off-screen (x=36cm)
  verify <deck> <slide>                       Verify slide setup (transition + ghosting)
  final-check <deck>                          Verify entire deck

example:
  python morph-helpers.py clone  deck.pptx 1 2
  python morph-helpers.py ghost  deck.pptx 2 7 8 9
  python morph-helpers.py verify deck.pptx 2
  python morph-helpers.py final-check deck.pptx
""",
    )
    sub = parser.add_subparsers(dest="command")

    p = sub.add_parser("clone")
    p.add_argument("deck")
    p.add_argument("from_slide", type=int)
    p.add_argument("to_slide",   type=int)

    p = sub.add_parser("ghost")
    p.add_argument("deck")
    p.add_argument("slide",  type=int)
    p.add_argument("shapes", nargs="+", type=int)

    p = sub.add_parser("verify")
    p.add_argument("deck")
    p.add_argument("slide", type=int)

    p = sub.add_parser("final-check")
    p.add_argument("deck")

    args = parser.parse_args()

    if args.command == "clone":
        morph_clone_slide(args.deck, args.from_slide, args.to_slide)
    elif args.command == "ghost":
        morph_ghost_content(args.deck, args.slide, *args.shapes)
    elif args.command == "verify":
        if not morph_verify_slide(args.deck, args.slide):
            sys.exit(1)
    elif args.command == "final-check":
        if not morph_final_check(args.deck):
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
