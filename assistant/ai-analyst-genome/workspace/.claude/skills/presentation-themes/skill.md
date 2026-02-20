# Presentation Themes Skill

# Theme Selection and Rules for Marp Slide Decks

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab

## Purpose

Manage theme selection and application for Marp slide presentations. Provides rules for choosing between light and dark themes, and ensures brand token consistency across all presentation outputs.

## When to Use

- **Trigger:** `/theme` command or auto-applied when deck-creator assembles slides
- **Context:** Creating or modifying Marp presentations
- **Command:** `/theme [analytics|analytics-dark]`

## Available Themes

### Theme: analytics (Light)

**File:** `themes/analytics.css`
**Best for:** Printed decks, projector presentations, formal reports

| Property       | Value                    | Token Source               |
| -------------- | ------------------------ | -------------------------- |
| Background     | #F7F6F2 (warm off-white) | brand.bg_light             |
| Text primary   | #1F2937 (dark gray)      | brand.text_light_primary   |
| Text secondary | #4B5563 (medium gray)    | brand.text_light_secondary |
| Headings       | #1a1a2e (dark navy)      | brand.primary              |
| Accent         | #D97706 (amber)          | brand.accent               |
| Positive       | #059669 (green)          | brand.positive             |
| Negative       | #DC2626 (red)            | brand.negative             |
| Table headers  | #1a1a2e bg, white text   | brand.primary              |

### Theme: analytics-dark (Dark)

**File:** `themes/analytics-dark.css`
**Best for:** Screen presentations, dark environments, video calls

| Property       | Value                    | Token Source              |
| -------------- | ------------------------ | ------------------------- |
| Background     | #1A1A17 (near-black)     | brand.bg_dark             |
| Text primary   | #F5F5F0 (off-white)      | brand.text_dark_primary   |
| Text secondary | #A8A090 (warm gray)      | brand.text_dark_secondary |
| Headings       | #D97706 (amber)          | brand.accent              |
| Accent         | #F0A060 (light amber)    | brand.accent_light        |
| Positive       | #059669 (green)          | brand.positive            |
| Negative       | #DC2626 (red)            | brand.negative            |
| Table headers  | #363532 bg, #F5F5F0 text | brand.border_dark         |

## Theme Selection Rules

| Scenario                | Recommended Theme | Reason                           |
| ----------------------- | ----------------- | -------------------------------- |
| Default (no preference) | analytics (light) | Best readability, print-friendly |
| User requests dark      | analytics-dark    | Dark mode preference             |
| PDF export              | analytics (light) | Better for printing              |
| Screen-only             | Either            | User preference                  |
| Formal report           | analytics (light) | Professional, conservative       |
| Internal review         | analytics-dark    | Reduced eye strain               |

## Theme Application

### In Marp Frontmatter

```yaml
---
marp: true
theme: analytics # or analytics-dark
paginate: true
footer: 'Powered by AI Analyst Lab | aianalystlab.ai'
---
```

### In Chart Generation

Charts should match the theme:

```python
# For light theme:
fig.savefig(path, facecolor='#F7F6F2')  # brand.bg_light

# For dark theme:
fig.savefig(path, facecolor='#1A1A17')  # brand.bg_dark
```

### CSS Custom Properties

Both themes expose CSS custom properties:

```css
:root {
  --color-primary: ...;
  --color-secondary: ...;
  --color-accent: ...;
  --color-bg: ...;
  --color-positive: ...;
  --color-negative: ...;
  --color-text-primary: ...;
  --color-text-secondary: ...;
  --color-border: ...;
}
```

## Slide Classes

Both themes support these Marp slide classes:

| Class             | Purpose                  | Usage                           |
| ----------------- | ------------------------ | ------------------------------- |
| `lead`            | Title/section slides     | `<!-- _class: lead -->`         |
| `highlight`       | Callout box (amber)      | `<div class="highlight">`       |
| `success`         | Positive callout (green) | `<div class="success">`         |
| `warning`         | Warning callout (red)    | `<div class="warning">`         |
| `columns`         | Two-column layout        | `<div class="columns">`         |
| `chart-container` | Chart wrapper            | `<div class="chart-container">` |

## Instructions

1. **Check user preference:** Look in `.knowledge/user/profile.yaml` for `theme_preference`
2. **Default to analytics (light)** if no preference set
3. **Apply consistently:** All charts and slides use the same theme in a single deck
4. **Verify brand tokens:** Colors must match genome_config.yaml exactly
5. **Footer always present:** "Powered by AI Analyst Lab | aianalystlab.ai" on every slide

---

**Powered by AI Analyst Lab | aianalystlab.ai**
