---
name: quality-gates
description: Quality Reviewer — Check Content/Layout/Morph and provide fix guidance
---

# Quality Reviewer

Role: Evaluate the quality of the generated PPT, identify issues, and guide fixes.

Goal: Ensure the delivered PPT has clear content, comfortable layout, and smooth animations.

---

## Content Gate

### Check Criteria

- ✅ 1 headline per slide
- ✅ Title <= 2 lines
- ✅ 3–5 bullet points
- ✅ No long paragraphs
- ✅ Conclusion First (title is an argument, not a topic)

### Common Issues & Fixes

| Issue                                   | Fix                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Title exceeds 2 lines                   | Shorten the text or reduce font size (64pt → 56pt)                        |
| Too many bullet points (>5)             | Merge similar points or split into two slides                             |
| Title is a topic instead of an argument | Rewrite as a conclusion: "Cost reduced by 40%" instead of "Cost Analysis" |
| Long paragraph present                  | Break into 3–5 bullet points, 1–2 lines each                              |

---

## Layout Gate

### Check Criteria

- ✅ Text boxes <= 14 per slide
- ✅ No overlapping text boxes
- ✅ x-coordinates aligned to grid lines
- ✅ scene actors opacity <= 0.12 (background decoration transparency)
- ✅ **Text color has sufficient contrast with background (readability)** ← mandatory check

### Text Readability Check (critical)

**Check Flow**:

1. Get the `color` attribute of each text box
2. Get the background color at the text box's position (slide background or scene actor fill)
3. Determine whether the text color and background color provide sufficient contrast

**Criteria** (using brightness formula):

```
Brightness = (R × 299 + G × 587 + B × 114) / 1000

- Brightness < 128 → Dark background → Text must be light (#FFFFFF)
- Brightness >= 128 → Light background → Text must be dark (#000000 or #333333)
```

**Examples**:

- `#2C3E50` (dark blue) = 62 → Dark → Use white text
- `#E74C3C` (red) = 115 → Dark → Use white text
- `#F39C12` (orange) = 160 → Light → Use black text
- `#FFFFFF` (white) = 255 → Light → Use black text

**Prohibited Errors**:

- ❌ Dark blue text on dark blue background (similar or identical color values)
- ❌ White text on light background (insufficient contrast)
- ❌ Any case where text color = background color

### Common Issues & Fixes

| Issue                             | How to Identify                                             | Fix                                                                               |
| --------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Text color = background color** | Text color and background fill are identical                | Dark background → change text to FFFFFF; Light background → change text to 000000 |
| **Insufficient contrast**         | Text color and background color are both dark or both light | Invert one of them: dark background → white text; light background → black text   |
| **Text wrapping overflow**        | Text box too narrow, text forced to wrap and overflows      | Increase text box width, or reduce text content                                   |
| **Previous slide text residue**   | Previous slide's title has no ghost on the current slide    | Move the unneeded headline/content actor to `x=36cm`                              |
| Text box overlap                  | Two text boxes with overlapping y-coordinates               | Adjust with `officecli set '/shape[N]' --prop y=XXcm`                             |
| x-coordinate not aligned          | x is not a grid multiple                                    | Align to grid: 1.2cm, 2.4cm, 3.6cm...                                             |
| scene actors obscuring text       | Opacity too high (>0.12)                                    | Lower transparency: `--prop opacity=0.08`                                         |
| Too many text boxes (>14)         | Count shapes with type=textbox                              | Merge similar content or simplify descriptions                                    |

---

## Morph Gate

### Check Criteria

- ✅ All slides 2+ have `transition=morph` set
- ✅ **All slides have identically named scene actors** (6–8 fixed actors present on every slide)
- ✅ Adjacent slides have noticeably different spatial layouts (shape position, size, and rotation vary)
- ✅ Each slide has enough scene shapes (6+) to create a sense of motion
- ✅ Actors that should not be visible are placed off-screen (ghost position: `x=36cm` or `x=36cm`)

### Check Method

Use `officecli get` to verify that scene actor names are consistent across adjacent slides:

```bash
# Check shape names on slide 1 and slide 2
officecli get <filename>.pptx '/slide[1]' --depth 1 | grep name
officecli get <filename>.pptx '/slide[2]' --depth 1 | grep name

# You should see the same list of actor names (e.g., !!dot-main, !!line-top)
```

### Common Issues & Fixes

| Issue                                        | Fix                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Morph has no transform effect, only fade** | **Critical issue**: Scene actor names differ between adjacent slides. Fix: Use identically named actors across all slides (e.g., `!!dot-main`); place unneeded ones at `x=36cm` off-screen |
| Adjacent slides look too similar             | Adjust scene actor position/size/rotation to create visual difference (displacement >= 5cm or rotation >= 15°)                                                                             |
| Not enough scene shapes                      | Add decorative geometric shapes (ellipses, rectangles, triangles) with consistent names                                                                                                    |
| Transition not smooth                        | Verify `transition=morph` is set; verify actors use identical names                                                                                                                        |
| An actor disappears on a slide               | Do not delete the actor — move it off-screen (`x=36cm` or `x=36cm`) instead                                                                                                                |

---

## Delivery Gate

- ✅ Must pass `officecli validate <filename>.pptx`
- ✅ Must pass `officecli view outline <filename>.pptx` (structure is reasonable)
- ✅ Exactly 3 deliverables: `<topic-name>.pptx` + `build.sh` + `brief.md` (no other files)
- ✅ `build.sh` can be re-run to produce the same result

---

## Check Flow

### Per-Slide Check (during Phase 3 — mandatory)

Self-check immediately after generating each slide. Fix issues before moving on.

1. **Content**: Headline clear? Bullet points <= 5?
2. **Layout**: No overlaps? Text color contrasts with background?
3. **Morph**: Scene actors have same names as previous slide? Scene actors not needed are ghosted to `x=36cm`?
4. **⚠️ TEXT OVERLAP CHECK**: Previous slide's content actors are ALL ghosted (`x=36cm`)? This slide's new content is added fresh?
   - Since content is added per slide (not pre-defined on slide 1), you only need to check the **previous slide's** content — not all slide types
   - **This is the #1 most common defect** — failure causes visible text overlap

**This is the primary quality gate.** If every slide passes, the PPT is already high quality.

### Pre-Delivery Check (Phase 4 — two commands)

After all slides are generated:

```bash
officecli validate <filename>.pptx    # must pass
officecli view outline <filename>.pptx # verify structure
```

If issues found → fix and re-validate (max 2 rounds). If still failing → report to user.

---
