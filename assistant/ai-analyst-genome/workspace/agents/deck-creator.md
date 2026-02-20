# Deck Creator Agent

# Pipeline Step 16: Marp Slide Deck Assembly

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

<!--
CONTRACT:
  agent_id: "deck-creator"
  version: "1.0.0"
  pipeline_step: 16

  INPUT_REQUIREMENTS:
    - "_working/narrative.md (prose narrative with slide content)"
    - "_working/charts/*.png (approved charts)"
    - "_working/charts/manifest.yaml (chart inventory)"
    - "_working/storyboard.md (structural blueprint)"
    - "_working/confidence_scores.yaml (quality scores)"
    - "templates/deck_skeleton.marp.md (slide template)"
    - "templates/marp_components.md (HTML snippets)"
    - "themes/analytics.css or themes/analytics-dark.css"
    - "genome_config.yaml (brand tokens)"

  OUTPUT_GUARANTEES:
    - "Valid Marp markdown file at outputs/deck.marp.md"
    - "All slides from storyboard present"
    - "All chart PNGs referenced with correct paths"
    - "Marp frontmatter with theme and footer"
    - "AI Analyst Lab footer on every slide"
    - "Confidence badge on title slide"
    - "Marp-compatible HTML components"
    - "Export-ready for PDF conversion"

  HANDOFF_ARTIFACTS:
    - "outputs/deck.marp.md"

  STATISTICAL_CEILING:
    allowed: []
    forbidden: ["regression", "ANOVA", "ML"]
    note: "Deck creator assembles content, does not compute statistics"

  DATA_PLATFORM_AGNOSTIC: true

  LOCALE_SUPPORT: true

  FAILURE_MODE:
    - "Returns SKIP if narrative.md not found"
    - "Returns PARTIAL_DECK if some charts missing"
    - "Logs warning for each missing component"

  DEPENDENCIES:
    - "storytelling (narrative content)"
    - "chart-maker (chart files)"

  REVIEW_ELIGIBLE: true
  MAX_REVISIONS: 2
-->

## Purpose

The Deck Creator Agent assembles the final Marp presentation from the narrative, charts, and storyboard. It produces a valid Marp markdown file that can be exported to PDF, HTML, or PPTX. The deck follows the CTR (Context-Tension-Resolution) structure and applies the analytics theme with AI Analyst Lab branding.

## Assembly Workflow

```
1. Read _working/narrative.md (slide content)
2. Read _working/storyboard.md (structure)
3. Read _working/charts/manifest.yaml (chart paths)
4. Read templates/deck_skeleton.marp.md (template)
5. Read templates/marp_components.md (HTML snippets)
6. For each slide in storyboard:
   a. Select appropriate template component
   b. Fill in content from narrative
   c. Insert chart references
   d. Add speaker notes
7. Write assembled deck to outputs/deck.marp.md
8. Validate Marp syntax
```

## Marp Frontmatter

Every deck starts with this frontmatter block:

```yaml
---
marp: true
theme: analytics
paginate: true
header: '{{TITLE}}'
footer: 'Powered by AI Analyst Lab | aianalystlab.ai'
style: |
  :root {
    --color-primary: #1a1a2e;
    --color-secondary: #D97706;
    --color-accent: #D97706;
    --color-bg: #F7F6F2;
    --color-positive: #059669;
    --color-negative: #DC2626;
  }
---
```

**Footer is non-negotiable** when `genome_config.yaml > attribution.show_attribution` is true.

## Slide Templates

### Title Slide

```markdown
<!-- _class: lead -->

# {{TITLE}}

**{{SUBTITLE}}**

{{DATE}} | Confidence: {{CONFIDENCE_SCORE}} ({{CONFIDENCE_GRADE}})

Built with AI Analyst Lab
```

### Context Slide

```markdown
## {{HEADING}}

{{BODY_TEXT}}

<div style="display: flex; justify-content: space-around; margin-top: 1em;">

<div style="text-align: center; padding: 1em;">
<div style="font-size: 2.5em; font-weight: 700; color: var(--color-primary);">{{METRIC_1_VALUE}}</div>
<div style="color: var(--color-text-secondary);">{{METRIC_1_LABEL}}</div>
</div>

<div style="text-align: center; padding: 1em;">
<div style="font-size: 2.5em; font-weight: 700; color: {{METRIC_2_COLOR}};">{{METRIC_2_VALUE}}</div>
<div style="color: var(--color-text-secondary);">{{METRIC_2_LABEL}}</div>
</div>

</div>

<!--
Speaker Notes:
{{SPEAKER_NOTES}}
-->
```

### Finding Slide (with Chart)

```markdown
## {{HEADING}}

{{BODY_TEXT}}

![{{CHART_TITLE}}]({{CHART_PATH}})

<div class="highlight">
<strong>So What:</strong> {{SO_WHAT}}
</div>

<!--
Speaker Notes:
{{SPEAKER_NOTES}}
-->
```

### Comparison Slide (Two Column)

```markdown
## {{HEADING}}

<div class="columns">
<div>

### {{LEFT_HEADING}}

{{LEFT_CONTENT}}

</div>
<div>

### {{RIGHT_HEADING}}

{{RIGHT_CONTENT}}

</div>
</div>

<!--
Speaker Notes:
{{SPEAKER_NOTES}}
-->
```

### Data Overview Slide

```markdown
## {{HEADING}}

{{BODY_TEXT}}

| Metric           | Value                                           |
| ---------------- | ----------------------------------------------- |
| Symbols Analyzed | {{SYMBOL_COUNT}}                                |
| Date Range       | {{DATE_RANGE}}                                  |
| Data Source      | {{DATA_SOURCE}}                                 |
| Data Quality     | {{DATA_QUALITY_SCORE}} ({{DATA_QUALITY_GRADE}}) |

<!--
Speaker Notes:
{{SPEAKER_NOTES}}
-->
```

### Quality Assurance Slide

```markdown
## Quality Assurance

| Layer                 | Score                 | Grade                 |
| --------------------- | --------------------- | --------------------- |
| Data Quality          | {{L1_SCORE}}          | {{L1_GRADE}}          |
| Statistical Rigor     | {{L2_SCORE}}          | {{L2_GRADE}}          |
| Logical Coherence     | {{L3_SCORE}}          | {{L3_GRADE}}          |
| Presentation Accuracy | {{L4_SCORE}}          | {{L4_GRADE}}          |
| **Overall**           | **{{OVERALL_SCORE}}** | **{{OVERALL_GRADE}}** |

<div style="display: inline-block; padding: 0.3em 0.8em;
            background: {{GRADE_COLOR}}; color: white; border-radius: 4px;
            font-weight: 600; font-size: 0.9em;">
Confidence: {{OVERALL_GRADE}} ({{OVERALL_SCORE}})
</div>

<!--
Speaker Notes:
Quality is a first-class citizen in this analysis. Our overall confidence
score of {{OVERALL_SCORE}} (grade {{OVERALL_GRADE}}) means {{GRADE_INTERPRETATION}}.
-->
```

### Recommendation Slide

```markdown
## Recommendations

{{RECOMMENDATION_INTRO}}

1. **{{REC_1_TITLE}}** - {{REC_1_DETAIL}}
2. **{{REC_2_TITLE}}** - {{REC_2_DETAIL}}
3. **{{REC_3_TITLE}}** - {{REC_3_DETAIL}}

<div class="highlight">
<strong>Key Monitoring Metric:</strong> {{MONITORING_METRIC}} at {{THRESHOLD}}
</div>

<!--
Speaker Notes:
{{SPEAKER_NOTES}}
-->
```

### Next Steps Slide

```markdown
## Next Steps

- [ ] {{NEXT_STEP_1}}
- [ ] {{NEXT_STEP_2}}
- [ ] {{NEXT_STEP_3}}

**Owner:** {{OWNER}}
**Timeline:** {{TIMELINE}}
**Review Date:** {{REVIEW_DATE}}

<!--
Speaker Notes:
{{SPEAKER_NOTES}}
-->
```

### Appendix Slide

```markdown
---
<!-- _class: lead -->

# Appendix
---

## {{APPENDIX_TITLE}}

{{APPENDIX_CONTENT}}
```

### Closing Slide

```markdown
---

<!-- _class: lead -->

# Thank You

**{{TITLE}}**

{{DATE}}

Powered by AI Analyst Lab | aianalystlab.ai
Data provided by vnstock (KBS/VCI/TCBS)
```

## Chart Path Resolution

Charts are referenced relative to the outputs/ directory:

```python
def resolve_chart_path(chart_manifest_entry, deck_location):
    """
    Resolve chart path relative to deck.marp.md location.
    deck.marp.md is in outputs/, charts are in _working/charts/
    """
    chart_path = chart_manifest_entry['path']
    # Marp resolves paths relative to the .md file
    # From outputs/ to _working/charts/ = ../_working/charts/
    return f'../{chart_path}'
```

## Confidence Badge Colors

| Grade      | Color    | Hex     |
| ---------- | -------- | ------- |
| A (90-100) | Green    | #059669 |
| B (80-89)  | Amber    | #D97706 |
| C (70-79)  | Gray     | #6B7280 |
| D (60-69)  | Red      | #DC2626 |
| F (0-59)   | Dark Red | #991B1B |

## Deck Validation Checks

Before writing the final file, verify:

1. **Marp frontmatter valid** - `marp: true` present, theme specified
2. **Slide separators** - `---` between every slide
3. **No orphan charts** - Every chart in manifest is referenced
4. **No broken paths** - Every chart path resolves to existing file
5. **Footer present** - AI Analyst Lab footer in frontmatter
6. **Slide count matches** - Number of slides matches storyboard
7. **Speaker notes present** - Every content slide has `<!-- Speaker Notes: -->`
8. **HTML valid** - All HTML components properly closed
9. **Image syntax** - `![alt](path)` format for all charts
10. **Title slide first** - Deck starts with `<!-- _class: lead -->`

## Output Format

Write to `outputs/deck.marp.md`:

```markdown
---
marp: true
theme: analytics
paginate: true
header: 'Banking Sector Deep Value Analysis'
footer: 'Powered by AI Analyst Lab | aianalystlab.ai'
style: |
  :root {
    --color-primary: #1a1a2e;
    --color-secondary: #D97706;
    --color-accent: #D97706;
    --color-bg: #F7F6F2;
    --color-positive: #059669;
    --color-negative: #DC2626;
  }
---

<!-- _class: lead -->

# Banking Sector: Undervalued Opportunity or Value Trap?

**Deep Value Analysis | February 2026**

2026-02-21 | Confidence: 84 (B)

Built with AI Analyst Lab

---

## Market Context

Vietnamese banking stocks have underperformed VN-Index by 12% over
the past 6 months...

<!-- ... additional slides ... -->

---

<!-- _class: lead -->

# Thank You

**Banking Sector Deep Value Analysis**

2026-02-21

Powered by AI Analyst Lab | aianalystlab.ai
Data provided by vnstock (KBS/VCI/TCBS)
```

## PDF Export Support

The deck is designed for Marp CLI export:

```bash
# Export to PDF
npx @marp-team/marp-cli outputs/deck.marp.md --pdf --allow-local-files

# Export to HTML
npx @marp-team/marp-cli outputs/deck.marp.md --html --allow-local-files

# Export to PPTX
npx @marp-team/marp-cli outputs/deck.marp.md --pptx --allow-local-files
```

The `--allow-local-files` flag is required for chart images.

## Error Handling

| Scenario              | Action                                                             |
| --------------------- | ------------------------------------------------------------------ |
| Narrative not found   | SKIP - cannot assemble deck                                        |
| Some charts missing   | PARTIAL_DECK - use placeholder text: "[Chart pending: {chart_id}]" |
| Theme CSS not found   | Use default Marp theme, log warning                                |
| Invalid Marp syntax   | Attempt auto-fix (escape special chars), log issues                |
| Too many slides (>20) | Move excess to appendix section                                    |

---

**Powered by AI Analyst Lab | aianalystlab.ai**
