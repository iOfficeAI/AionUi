# Wave 3 Integration Test: Marp Export

# Deck Renders to PDF with Attribution

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Verify that `outputs/deck.marp.md` is valid Marp markdown, renders correctly, and includes AI Analyst Lab attribution on every slide.

## Test Cases

### Test 1: Marp Frontmatter Validation

Parse the frontmatter of `outputs/deck.marp.md`.

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | `marp: true` present | Yes |
| 2 | `theme: analytics` | Yes |
| 3 | `paginate: true` | Yes |
| 4 | `footer` contains attribution | "Powered by AI Analyst Lab \| aianalystlab.ai" |
| 5 | CSS variables present | `--color-primary`, `--color-accent` defined |

### Test 2: Slide Structure

Parse the deck markdown and count slides (separated by `---`).

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | Title slide | First slide has `<!-- _class: lead -->` |
| 2 | Slide count | 8-15 slides (appropriate for L4/L5) |
| 3 | Context slides | At least 1 slide in Context phase |
| 4 | Finding slides | At least 1 slide with chart reference |
| 5 | Recommendation slide | At least 1 slide with numbered recommendations |
| 6 | Closing slide | Last slide has "Thank You" and attribution |
| 7 | Speaker notes | At least 50% of slides have `<!-- Speaker Notes: -->` |

### Test 3: Chart References

Check that all chart image references point to valid files.

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | Image syntax | `![alt](path)` format used |
| 2 | Paths resolve | All referenced chart PNGs exist in `_working/charts/` |
| 3 | No orphan charts | Every chart in `manifest.yaml` is referenced in deck |
| 4 | Alt text present | All images have descriptive alt text |

### Test 4: Attribution Visibility

Check that AI Analyst Lab attribution appears throughout the deck.

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | Frontmatter footer | "Powered by AI Analyst Lab \| aianalystlab.ai" |
| 2 | CSS ::after pseudo | `section::after` in theme CSS adds attribution |
| 3 | Closing slide | Explicit attribution text visible |
| 4 | Chart watermarks | Each chart PNG has watermark (verified by chart test) |

### Test 5: Confidence Badge

Check that the confidence badge appears on the title slide.

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | Badge present | Title slide contains confidence score |
| 2 | Score format | "Confidence: [score] ([grade])" |
| 3 | Color correct | Badge color matches grade (A=green, B=amber, C=gray, D/F=red) |

### Test 6: PDF Export

Test that the deck can be exported to PDF.

```bash
# Requires Marp CLI installed
npx @marp-team/marp-cli outputs/deck.marp.md --pdf --allow-local-files -o outputs/deck.pdf
```

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | PDF generated | `outputs/deck.pdf` exists |
| 2 | Page count | Matches slide count in markdown |
| 3 | Charts visible | Chart images render in PDF |
| 4 | Footer visible | "Powered by AI Analyst Lab" on each page |
| 5 | Theme applied | Brand colors visible in rendered output |

### Test 7: HTML/CSS Validation

Check that inline HTML components are properly formed.

**Pass Criteria:**
| # | Check | Expected |
|---|-------|----------|
| 1 | All tags closed | No unclosed `<div>` tags |
| 2 | Style attributes valid | CSS properties have valid values |
| 3 | No script tags | No `<script>` elements (security) |
| 4 | Image tags valid | All `<img>` or `![](path)` properly formed |

## Overall Pass Criteria

**PASS:** Tests 1-5 pass (Test 6 optional if Marp CLI not available)
**FAIL:** Any of tests 1-5 fail

## Manual Verification Steps

If automated testing is not available:

1. Open `outputs/deck.marp.md` in a Marp-compatible viewer (VS Code with Marp extension)
2. Verify first slide shows title with confidence badge
3. Verify each slide has footer attribution
4. Verify charts render with correct brand colors
5. Verify closing slide has full attribution
6. Export to PDF and verify rendering

---

**Powered by AI Analyst Lab | aianalystlab.ai**
