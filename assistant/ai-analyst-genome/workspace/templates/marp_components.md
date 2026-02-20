# Marp Component Library

# Vietnamese Stock Market Analyst

# Powered by AI Analyst Lab | aianalystlab.ai

#

# Reusable HTML/Markdown snippets for deck-creator agent.

# Copy and customize these components for slide assembly.

---

## 1. Callout Boxes

### Info Callout

```html
<div class="highlight"><strong>Key Insight:</strong> {{INSIGHT_TEXT}}</div>
```

### Success Callout

```html
<div class="success"><strong>Positive Signal:</strong> {{SUCCESS_TEXT}}</div>
```

### Warning Callout

```html
<div class="warning"><strong>Risk Alert:</strong> {{WARNING_TEXT}}</div>
```

---

## 2. Two-Column Layout

```html
<div class="columns">
  <div>### Left Column Content here...</div>
  <div>### Right Column Content here...</div>
</div>
```

---

## 3. Metric Card

```html
<div
  style="display: inline-block; padding: 1em; margin: 0.5em;
            border: 2px solid var(--color-accent); border-radius: 8px;
            text-align: center; min-width: 150px;"
>
  <div style="font-size: 2em; font-weight: 700; color: var(--color-primary);">{{VALUE}}</div>
  <div style="font-size: 0.8em; color: var(--color-text-secondary);">{{LABEL}}</div>
</div>
```

### Usage Example (3 metric cards in a row)

```markdown
<div style="display: flex; justify-content: space-around;">

<div style="text-align: center; padding: 1em;">
<div style="font-size: 2.5em; font-weight: 700; color: #D97706;">82,500</div>
<div style="color: #4B5563;">VND Price</div>
</div>

<div style="text-align: center; padding: 1em;">
<div style="font-size: 2.5em; font-weight: 700; color: #059669;">+1.85%</div>
<div style="color: #4B5563;">Daily Change</div>
</div>

<div style="text-align: center; padding: 1em;">
<div style="font-size: 2.5em; font-weight: 700; color: #1a1a2e;">15.2x</div>
<div style="color: #4B5563;">P/E Ratio</div>
</div>

</div>
```

---

## 4. Comparison Table

```markdown
| Metric     | VCB        | TCB        | Difference |
| ---------- | ---------- | ---------- | ---------- |
| Price      | 82,500 VND | 45,200 VND | +82.5%     |
| P/E        | 15.2x      | 8.5x       | +78.8%     |
| ROE        | 18.5%      | 22.3%      | -17.0%     |
| Market Cap | 245.3B VND | 156.2B VND | +57.0%     |
```

---

## 5. Confidence Badge

```html
<div
  style="display: inline-block; padding: 0.3em 0.8em;
            background: #059669; color: white; border-radius: 4px;
            font-weight: 600; font-size: 0.9em;"
>
  Confidence: A (95)
</div>
```

### Color variants:

- **A (90-100):** `background: #059669` (green)
- **B (80-89):** `background: #D97706` (amber)
- **C (70-79):** `background: #6B7280` (gray)
- **D (60-69):** `background: #DC2626` (red)
- **F (0-59):** `background: #991B1B` (dark red)

---

## 6. Image with Caption

```markdown
![Chart Title](_working/charts/chart_name.png)

_Source: vnstock (KBS) | Updated: 2026-02-21 14:35 ICT_
```

---

## 7. Quote / Key Finding

```markdown
> "VCB commands a premium P/E of 15.2x vs TCB's 8.5x,
> reflecting its blue-chip status and consistent ROE."
```

---

## 8. Progress Indicator

```html
<div style="background: #E5E7EB; border-radius: 4px; overflow: hidden;">
  <div style="width: 80%; background: #D97706; height: 8px;"></div>
</div>
<div style="font-size: 0.8em; color: #4B5563;">Analysis: 80% complete (Step 9/17)</div>
```

---

## 9. Footer Attribution

```markdown
---

_Powered by AI Analyst Lab | aianalystlab.ai_
_Data provided by vnstock (KBS/VCI/TCBS)_
```

---

## 10. Section Divider

```markdown
---

<!-- _class: lead -->

# Section Title

Subtitle or description

---
```
