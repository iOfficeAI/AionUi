---
name: remote-style-source
description: Discover and fetch style and component references from OfficeCli remote repository (one-shot, no persistent cache)
---

# OfficeCli Remote Style + Component Source

This guide defines how to use OfficeCli `Styles/` as the remote source of truth for both style templates and component library references while keeping this skill local.

## Goal

- Discover component library references from OfficeCli remote repository (default path)
- Discover style templates from OfficeCli remote repository (optional path)
- Download only the selected style/component files
- Use temporary local files only for the current task
- Delete temporary files after generation

## Repository Defaults

```bash
STYLE_REPO_OWNER="ringringlin"
STYLE_REPO_NAME="OfficeCLI"
STYLE_REPO_REF="feat/style-index-test"
STYLE_REPO_DIR="Styles"
STYLE_TEMPLATE_DIR="template"
STYLE_COMPONENT_DIR="component"
```

If your team uses another repo/ref, override these variables.

## Default Mode (Recommended)

Use topic-driven custom style + remote component library.

Template discovery/fetch is optional and should run only when user explicitly asks for a template style (or strong keyword match requires inspiration).

## Step 1: Discover style candidates (optional, remote index first)

Try in this order:

1. `Styles/index.json` (preferred, machine-readable)
2. `Styles/INDEX.md` (fallback if JSON index does not exist)
3. GitHub Contents API directory listing (last fallback)

Examples:

```bash
# 1) Preferred: JSON index
curl -fsSL "https://raw.githubusercontent.com/${STYLE_REPO_OWNER}/${STYLE_REPO_NAME}/${STYLE_REPO_REF}/${STYLE_REPO_DIR}/index.json" -o /tmp/style-index.json

# 2) Markdown fallback
curl -fsSL "https://raw.githubusercontent.com/${STYLE_REPO_OWNER}/${STYLE_REPO_NAME}/${STYLE_REPO_REF}/${STYLE_REPO_DIR}/INDEX.md" -o /tmp/style-index.md

# 3) Contents API fallback
curl -fsSL "https://api.github.com/repos/${STYLE_REPO_OWNER}/${STYLE_REPO_NAME}/contents/${STYLE_REPO_DIR}?ref=${STYLE_REPO_REF}" -o /tmp/style-contents.json
```

## Step 2: Download only the selected style template (optional)

After selecting `<style-id>`, fetch only needed files:

```bash
SESSION_STYLE_DIR="$(mktemp -d /tmp/aionui-morph-style.XXXXXX)"

# Always fetch style.md first
curl -fsSL "https://raw.githubusercontent.com/${STYLE_REPO_OWNER}/${STYLE_REPO_NAME}/${STYLE_REPO_REF}/${STYLE_REPO_DIR}/${STYLE_TEMPLATE_DIR}/<style-id>/style.md" \
  -o "${SESSION_STYLE_DIR}/style.md"

# Fetch build.sh only when implementation details are needed
curl -fsSL "https://raw.githubusercontent.com/${STYLE_REPO_OWNER}/${STYLE_REPO_NAME}/${STYLE_REPO_REF}/${STYLE_REPO_DIR}/${STYLE_TEMPLATE_DIR}/<style-id>/build.sh" \
  -o "${SESSION_STYLE_DIR}/build.sh" || true
```

Do not download all style template directories. Do not mirror the whole repo.

## Step 3: Fetch component library references (default path, on demand)

When component composition is needed, fetch only component docs you will actually use:

```bash
SESSION_COMPONENT_DIR="$(mktemp -d /tmp/aionui-morph-component.XXXXXX)"

# Preferred: component library rules and snippets
curl -fsSL "https://raw.githubusercontent.com/${STYLE_REPO_OWNER}/${STYLE_REPO_NAME}/${STYLE_REPO_REF}/${STYLE_REPO_DIR}/${STYLE_COMPONENT_DIR}/COMPONENT_LIBRARY.md" \
  -o "${SESSION_COMPONENT_DIR}/COMPONENT_LIBRARY.md"

# Optional: python helper source, only if needed
curl -fsSL "https://raw.githubusercontent.com/${STYLE_REPO_OWNER}/${STYLE_REPO_NAME}/${STYLE_REPO_REF}/${STYLE_REPO_DIR}/${STYLE_COMPONENT_DIR}/components.py" \
  -o "${SESSION_COMPONENT_DIR}/components.py" || true
```

If component docs are unavailable, continue with built-in layering constraints in `SKILL.md`.

## Step 4: Use fetched material as inspiration, not copy-paste coordinates

- Learn visual language (palette, composition, morph choreography)
- Follow this skill's design/quality rules (`pptx-design.md`, `quality-gates.md`)
- Do not copy all coordinates and dimensions verbatim

## Step 5: Clean up after completion

```bash
rm -rf "${SESSION_STYLE_DIR}"
rm -rf "${SESSION_COMPONENT_DIR}"
```

No persistent cache by default.

## Failure Handling

- If remote style template fetch fails, continue immediately with topic-driven custom style + component composition. Do not block generation.
- If remote component fetch fails, continue with built-in component layering rules in `SKILL.md`.
- If both `style.md` and `build.sh` unavailable for chosen style, pick another candidate
- Do not block the whole PPT workflow due to one missing style directory
- Even in fallback mode, all local hard requirements remain mandatory: Morph naming conventions, ghosting, `transition=morph`, readability/spacing rules, per-slide checks, and final `validate + outline` verification
