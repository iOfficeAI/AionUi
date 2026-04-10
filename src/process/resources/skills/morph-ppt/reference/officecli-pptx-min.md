---
name: officecli-commands
description: OfficeCli Command Reference — PPT generation and validation commands
---

# OfficeCLI PPT Command Reference

## 0) BEFORE YOU START (CRITICAL)

**If `officecli` is not installed:**

`macOS / Linux`

```bash
if ! command -v officecli >/dev/null 2>&1; then
    curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
fi
```

`Windows (PowerShell)`

```powershell
if (-not (Get-Command officecli -ErrorAction SilentlyContinue)) {
    irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
}
```

Verify: `officecli --version`

If `officecli` is still not found after first install, open a new terminal and run the verify command again.

---

## 1) Learn Commands from CLI (NOT from this doc)

**DO NOT memorize property lists from this document.** They will become outdated. Instead, query the CLI for real-time syntax:

### Three-Layer Help System

```bash
# Layer 1: See all settable elements
officecli pptx set

# Layer 2: See all properties for ONE element
officecli pptx set shape     # Shows: text, fill, x, y, width, height, font, size, bold...
officecli pptx set slide     # Shows: background, transition, advanceTime...
officecli pptx set chart     # Shows: chartType, categories, data, style...

# Layer 3: See format details for ONE property
officecli pptx set shape.fill       # Color format examples
officecli pptx set shape.animation  # Animation syntax details
officecli pptx set shape.gradient   # Gradient syntax
officecli pptx set shape.shadow     # Shadow format
```

### Workflow Example: Discover → Apply → Validate

```bash
# Step 1: What can I modify on shapes?
$ officecli pptx set shape
# Output: text, fill, x, y, width, height, font, size, bold, italic, gradient, shadow...

# Step 2: How do I use gradient?
$ officecli pptx set shape.gradient
# Output: gradient="linear:90:FF0000,0000FF" or "radial:FF0000,0000FF"

# Step 3: Apply it
officecli set demo.pptx '/slide[1]/shape[1]' --prop gradient="linear:90:FF0000,0000FF"

# Step 4: Validate
officecli validate demo.pptx
```

**For comprehensive reference:** https://github.com/iOfficeAI/OfficeCLI/wiki/agent-guide

---

## 2) Quick Start (10 Most Common Commands)

Only memorize these essentials. For anything else, use `officecli pptx set/add`:

```bash
# 1. Create document
officecli create deck.pptx

# 2. Add slide with background and transition
officecli add deck.pptx '/' --type slide --prop background=1A1A2E --prop transition=morph

# 3. Add shape/textbox
officecli add deck.pptx '/slide[1]' --type shape --prop text="Hello World" \
  --prop x=5cm --prop y=8cm --prop width=10cm --prop height=3cm --prop fill=FF0000

# 4. Modify existing shape
officecli set deck.pptx '/slide[1]/shape[1]' --prop fill=0000FF --prop text="New text"

# 5. Clone slide (with all shapes)
officecli add deck.pptx '/' --from '/slide[1]'

# 6. View structure
officecli view deck.pptx outline

# 7. HTML preview (NEW in 1.0.14) - auto-opens in browser
officecli view deck.pptx html

# 8. Get element details (check indices before modifying)
officecli get deck.pptx '/slide[1]' --depth 1

# 9. Validate document
officecli validate deck.pptx

# 10. Performance mode (for 3+ commands on same file)
officecli open deck.pptx
officecli set deck.pptx '/slide[1]/shape[1]' --prop fill=FF0000
officecli set deck.pptx '/slide[1]/shape[2]' --prop text="Fast"
officecli close deck.pptx
```

### More Element Types (when needed, check syntax with `officecli pptx add`)

```bash
officecli add deck.pptx '/slide[1]' --type picture --prop path=photo.jpg --prop width=12cm
officecli add deck.pptx '/slide[1]' --type chart --prop chartType=column --prop categories="Q1,Q2" --prop data="Sales:100,200"
officecli add deck.pptx '/slide[1]' --type table --prop rows=3 --prop cols=4
officecli add deck.pptx '/slide[1]' --type connector --prop preset=straight --prop line=FF0000
officecli add deck.pptx '/slide[1]' --type video --prop path=demo.mp4 --prop autoplay=true
```

---

## 3) Critical Rules (Read Before Any Command)

### Syntax Pitfalls (Top 4 Mistakes)

| ❌ Wrong                | ✅ Correct                      | Why                                              |
| ----------------------- | ------------------------------- | ------------------------------------------------ |
| `--name "foo"`          | `--prop name="foo"`             | All attributes go through `--prop`               |
| `'/slide[@name="foo"]'` | `'/slide[1]/shape[3]'`          | Numeric indexing only (1-based)                  |
| `x=-3cm`                | `x=0cm` or `x=36cm`             | No negative coordinates. Use 36cm for off-screen |
| Add shapes before slide | Create → add slide → add shapes | Must add slide first or "Slide not found"        |

### Shape Index Management

**Indices change dynamically. Always verify before modifying:**

```bash
# Check current indices
officecli get deck.pptx '/slide[1]' --depth 1
# Output: shape[1] name="title", shape[2] name="subtitle", shape[3] name="logo"...
```

**Index behavior:**

- **After clone:** New slide inherits all shapes with same indices as source
- **After add:** New shape gets next index (if slide has 8 shapes, new = `shape[9]`)
- **After remove:** Indices shift down (remove `shape[3]` → old `shape[4]` becomes `shape[3]`)

### Morph Animation

`transition=morph` creates smooth animations by **matching shapes by name** across adjacent slides.

**How it works:**

1. Adjacent slides must have shapes with **identical names** for morphing
2. PowerPoint matches by name and animates position/size/color changes
3. If names don't match → only fade in/out (no morph effect)

**Morph variants:**

```bash
--prop transition=morph          # Match by object (default)
--prop transition=morph-byWord   # Word-by-word text animation
--prop transition=morph-byChar   # Character-by-character text animation
```

**For complete Morph workflow** (naming conventions, ghosting, helpers), see `SKILL.md` Phase 3.

### Script Best Practices

- **Multi-line text:** Use `\\n` (double-escaped in bash) or split into multiple textboxes
- **Line continuation (bash):** No trailing spaces after backslash `\`
- **Filenames:** Use English names to avoid encoding issues
- **Language choice:** Use bash/python/powershell — whatever executes `officecli` commands clearly

### Batch JSON Mode (NOT RECOMMENDED for Morph)

**Do NOT use** `officecli batch --input commands.json` for Morph presentations.
Reason: Morph requires careful step-by-step control that's hard to debug in JSON.

If you must use batch mode for non-Morph tasks:

- **Booleans as strings:** `{"props":{"bold":"true"}}` not `{"bold":true}`
- **Escape quotes:** `{"props":{"text":"It\\'s working"}}`

---

## 4) Troubleshooting

When a command fails:

1. **Read the error message** — officecli provides descriptive errors
   - "Unrecognized argument" → check `--prop` format
   - "Slide not found" → add slide first
   - "Could not find path" → verify file exists

2. **Inspect current state:**

   ```bash
   officecli get <file> '/slide[N]' --depth 1   # List all shapes + indices
   officecli view <file> outline                # Document structure
   officecli view <file> issues                 # Validation issues
   ```

3. **Check command syntax:**

   ```bash
   officecli pptx set <element>    # See available properties
   officecli pptx add              # See available element types
   ```

4. **Common fixes:**
   | Error | Solution |
   |-------|----------|
   | "Slide not found" | Run `officecli add <file> '/' --type slide` first |
   | "Unrecognized argument" | Use `--prop key=value` format, not `--key value` |
   | Shape not where expected | Run `get` to verify current indices after add/remove |
   | File locked | Close PPT in PowerPoint/WPS before running commands |

5. **Still stuck?** Generate HTML preview to debug visually:
   ```bash
   officecli view deck.pptx html   # Opens in browser with live preview
   ```

---

**Remember:** This doc is a quick reference. For the latest syntax, **always query the CLI first** with `officecli pptx set/add`.
