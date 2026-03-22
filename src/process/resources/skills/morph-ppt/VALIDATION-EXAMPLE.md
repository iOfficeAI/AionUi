---
name: validation-example
description: Example workflow showing how to use validate-morph.sh during PPT generation
---

# Validation Script Usage Example

## Scenario: Creating a 3-slide PPT with Morph animation

### Step 1: Create slide 1 with scene actors

```bash
# Create file and slide 1
officecli create demo.pptx
officecli add demo.pptx '/' --type slide --prop layout=blank --prop background=1A1A2E

# Add 6 scene actors
officecli add demo.pptx '/slide[1]' --type shape --prop name="dot-main" --prop preset=ellipse \
  --prop fill=00D9FF --prop opacity=0.12 --prop x=5cm --prop y=5cm --prop width=8cm --prop height=8cm

officecli add demo.pptx '/slide[1]' --type shape --prop name="line-top" --prop preset=rect \
  --prop fill=FFFFFF --prop opacity=0.1 --prop x=2cm --prop y=2cm --prop width=15cm --prop height=0.2cm

officecli add demo.pptx '/slide[1]' --type shape --prop name="slash-accent" --prop preset=triangle \
  --prop fill=FF6B6B --prop opacity=0.08 --prop x=22cm --prop y=10cm --prop width=6cm --prop height=6cm --prop rotation=30

# ... (add 3 more scene actors)

# Add slide 1 content
officecli add demo.pptx '/slide[1]' --type shape --prop text="Demo Presentation" \
  --prop font="Montserrat" --prop size=64 --prop color=FFFFFF \
  --prop x=4cm --prop y=8cm --prop width=20cm --prop height=3cm --prop fill=none
```

**Validation for slide 1** (optional, mainly checks transition is NOT set):

```bash
bash src/process/resources/skills/morph-ppt/validate-morph.sh demo.pptx 1 "dot-main,line-top,slash-accent"
```

---

### Step 2: Create slide 2 (clone from slide 1)

```bash
# Clone slide 1 → slide 2
officecli add demo.pptx '/' --from '/slide[1]'

# Get current shape indices
officecli get demo.pptx '/slide[2]' --depth 1
# Output shows: shape[1]=dot-main, shape[2]=line-top, ..., shape[7]=slide1-title

# Set transition
officecli set demo.pptx '/slide[2]' --prop transition=morph

# Ghost slide 1's content (shape[7] in this case)
officecli set demo.pptx '/slide[2]/shape[7]' --prop x=36cm

# Add slide 2's new content
officecli add demo.pptx '/slide[2]' --type shape --prop text="Key Benefits" \
  --prop font="Montserrat" --prop size=56 --prop color=FFFFFF \
  --prop x=6cm --prop y=7cm --prop width=18cm --prop height=2.5cm --prop fill=none

# Adjust scene actors (spatial differentiation)
officecli set demo.pptx '/slide[2]/shape[1]' --prop x=18cm --prop y=3cm --prop width=10cm
officecli set demo.pptx '/slide[2]/shape[3]' --prop x=8cm --prop rotation=60
```

**🔒 MANDATORY VALIDATION** (catches unghosted content):

```bash
bash src/process/resources/skills/morph-ppt/validate-morph.sh demo.pptx 2 "dot-main,line-top,slash-accent"
```

**Expected output**:

```
🔍 Validating slide 2 in demo.pptx...

✅ Check 1/4: transition=morph is set
✅ Check 2/4: All 3 scene actors exist
✅ Check 3/4: No unghosted content from previous slide detected
✅ Check 4/4: 3 scene actors changed (x/y/width/height/rotation)

✅ Validation passed for slide 2
```

**If validation FAILS** (example):

```
🔍 Validating slide 2 in demo.pptx...

✅ Check 1/4: transition=morph is set
✅ Check 2/4: All 3 scene actors exist
⚠️  Check 3/4: Found 1 non-scene shape(s) with x < 35cm and text content:
   shape[7]: x=4cm, text="Demo Presentation..."

   If these are from the previous slide, ghost them:
   officecli set "demo.pptx" "/slide[2]/shape[7]" --prop x=36cm
```

**→ Apply the fix**, then **re-run validation** until it passes.

---

### Step 3: Create slide 3 (clone from slide 2)

```bash
# Clone slide 2 → slide 3
officecli add demo.pptx '/' --from '/slide[2]'

# Get indices
officecli get demo.pptx '/slide[3]' --depth 1

# Set transition
officecli set demo.pptx '/slide[3]' --prop transition=morph

# Ghost slide 2's content (shape[8] = "Key Benefits")
officecli set demo.pptx '/slide[3]/shape[8]' --prop x=36cm

# Add slide 3 content
officecli add demo.pptx '/slide[3]' --type shape --prop text="Conclusion" \
  --prop font="Montserrat" --prop size=56 --prop color=FFFFFF \
  --prop x=10cm --prop y=9cm --prop width=15cm --prop height=2cm --prop fill=none

# Adjust scene actors
officecli set demo.pptx '/slide[3]/shape[1]' --prop x=2cm --prop y=12cm --prop width=6cm
officecli set demo.pptx '/slide[3]/shape[2]' --prop x=20cm --prop width=8cm
```

**🔒 MANDATORY VALIDATION**:

```bash
bash src/process/resources/skills/morph-ppt/validate-morph.sh demo.pptx 3 "dot-main,line-top,slash-accent"
```

---

## Key Principles

1. **Run validation after EVERY slide** (slides 2+)
2. **If validation fails → fix immediately** — do NOT proceed to next slide
3. **Ghosted shapes persist** — when you clone slide N to create slide N+1, all ghosted shapes (x=36cm) carry forward
4. **Scene actors defined in validation command** — provide comma-separated list: `"actor1,actor2,actor3"`
5. **Validation is for development only** — do NOT add validation steps to `build.sh` (build.sh is a clean, re-runnable build script)

---

## Why This Prevents Text Overlap

**Without validation script**:
- Agent forgets to ghost slide 1's content on slide 2
- Slide 2 now has TWO titles: old + new (overlapping text)
- Agent clones slide 2 → slide 3 (carries the overlap forward)
- By slide 6, you have 5 layers of overlapping text

**With validation script (smart detection)**:
- Agent creates slide 2, adds new content "Key Benefits"
- Validation compares text with slide 1, finds "Demo Presentation" (old title) still at x=4cm
- Script detects: "shape[7] has same text as previous slide and x < 35cm → unghosted"
- Script does NOT flag shape[8] ("Key Benefits") because it's new text not from previous slide
- Agent fixes only the real issue: `officecli set demo.pptx '/slide[2]/shape[7]' --prop x=36cm`
- Validation passes → proceed to slide 3
- Problem caught early, no compounding across slides, no false positives

**Detection Logic**:
The script compares text content between adjacent slides. A shape is flagged as unghosted ONLY if:
1. It has the same text as a shape from the previous slide (non-scene actor)
2. AND x < 35cm (not ghosted)

This prevents false positives — newly added content is never flagged.

---

## Troubleshooting

**Q: Validation says scene actor is missing, but I added it on slide 1?**

A: Check the name. officecli auto-adds `!!` prefix for Morph pairing. If you used `--prop name="dot-main"`, officecli stores it as `name="!!dot-main"`. In validation, just use the plain name: `"dot-main"` (script adds `!!` automatically).

**Q: Can I skip validation on slide 1?**

A: Yes, slide 1 doesn't need `transition=morph`, so validation is optional. But it's harmless to run it — the script will just skip most checks and report "⏭️ Skipped".

**Q: What if I don't know the scene actor names?**

A: Run validation WITHOUT the third argument:

```bash
bash src/process/resources/skills/morph-ppt/validate-morph.sh demo.pptx 2
```

The script will attempt to auto-detect scene actors from slide 1 (by finding shapes with names starting with `!!`).

**Q: Will the script flag my newly added content as "unghosted"?**

A: No. The script uses smart detection — it compares text content with the previous slide. Only shapes that have **the same text as the previous slide** AND x < 35cm are flagged. Newly added content with different text is never flagged as unghosted.

**Q: What counts as a "scene actor change" in Check 4?**

A: The script checks if any of these properties changed: **x, y, width, height, rotation**. Even if you only change one property (e.g., just rotation), the actor counts as changed. The goal is to ensure spatial differentiation between slides — at least 3 actors should visibly move/resize/rotate.

**Q: What if I intentionally want to keep text from the previous slide visible (e.g., footer/header)?**

A: The script will flag it as unghosted (since same text + x < 35cm). This is a known limitation. Options:

1. **Convert to scene actor (recommended)**: Add footer as a scene actor with `!!` prefix on slide 1, so it persists via Morph pairing
   ```bash
   officecli add demo.pptx '/slide[1]' --type shape --prop name="footer" \
     --prop text="© Company 2024" --prop x=2cm --prop y=18cm
   ```

2. **Change text slightly per slide**: "© Company 2024 • Slide 1" → "© Company 2024 • Slide 2"

3. **Accept the warning**: Proceed manually despite the validation error (not recommended for text-heavy content that actually overlaps)

**Q: Validation passed, but the PPT still has issues?**

A: The validation script checks Morph-specific issues (ghosting, transition, scene actors). For layout issues (text overlap within the same slide, color contrast, spacing), you still need to:
1. Run `officecli view demo.pptx html` to preview
2. Check against `reference/quality-gates.md` criteria
3. Run `officecli validate demo.pptx` for file integrity

---

## Known Limitations

1. **Persistent text (footer/header) triggers false positives**: If you have the same text on multiple slides by design (e.g., "© Company 2024" footer), Check 3 will flag it. Workaround: convert to scene actor with `!!` prefix.

2. **Partial text changes not detected**: If you only slightly modify text ("Introduction to AI" → "Introduction to ML"), the script won't detect unghosted content. This is acceptable since the new text is different enough.

3. **Only checks text-based content**: Images, charts, and other non-text shapes are not checked for ghosting. Visual inspection via `officecli view <file> html` is recommended.

4. **Requires scene actor list**: For best results, provide scene actor names explicitly. Auto-detection from slide 1 may fail if actors aren't properly named with `!!` prefix.
