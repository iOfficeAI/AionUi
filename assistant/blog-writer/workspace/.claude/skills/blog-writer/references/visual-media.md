# Visual Media Integration -- Images, Charts & Cover Images

## Cover Images & OG Images

Every blog post should have a cover image for social sharing and blog listings.

### Option 1: Photo Cover (Pixabay/Unsplash/Pexels)

Search for a wide, high-quality image relevant to the topic:
1. Pixabay: `site:pixabay.com [topic] wide banner`
2. Unsplash: `site:unsplash.com [topic] wide`
3. Pexels: `site:pexels.com [topic] wide banner`

**Sizing requirements:**
| Use Case | Dimensions | Aspect Ratio |
|----------|-----------|--------------|
| Blog hero/cover | 1200x630 or 1920x1080 | 1.91:1 or 16:9 |
| Open Graph (OG) | 1200x630 | 1.91:1 (required) |
| Twitter card | 1200x628 | ~1.91:1 |

Unsplash resize: `?w=1200&h=630&fit=crop&q=80`
Pixabay/Pexels: use original if wide enough, or crop.

### Option 2: Generated SVG Cover (via blog-chart)

For branded or data-driven covers, generate via `blog-chart`:
- Text-on-gradient with title and key statistic
- Dark-mode compatible (use `currentColor` where possible)
- Include blog name/author subtle branding
- ViewBox: `0 0 1200 630` for OG compatibility

### Frontmatter Fields

```yaml
---
title: "..."
description: "..."
coverImage: "https://cdn.pixabay.com/photo/.../cover.jpg"
coverImageAlt: "Descriptive sentence about the cover image"
ogImage: "https://cdn.pixabay.com/photo/.../cover.jpg"  # Same as cover or custom OG
date: "YYYY-MM-DD"
---
```

- `coverImage`: displayed as hero at the top of the post
- `ogImage`: used for social sharing previews (Open Graph / Twitter Card)
- If only one image, use the same URL for both fields
- Alt text is required for the cover image

### When to Use Each Option

| Scenario | Recommendation |
|----------|---------------|
| General topic | Photo cover from Pixabay/Unsplash/Pexels |
| Data-heavy article | Generated SVG with key stat highlight |
| Brand-focused | Generated SVG with brand colors |
| Tutorial/how-to | Screenshot or relevant photo |

---

## Image Sourcing

### Pixabay (Preferred)
- **License**: Pixabay Content License — free for commercial use, no attribution required
- **URL**: https://pixabay.com
- **Hotlinking**: Allowed via CDN URLs

**Finding images:**
1. WebSearch: `site:pixabay.com [topic keywords]`
2. Visit the image page to get the direct CDN URL
3. Direct URL pattern: `https://cdn.pixabay.com/photo/YYYY/MM/DD/HH/MM/filename.jpg`
4. Verify: `curl -sI "<url>" | head -1` — must return HTTP 200

**Sizing**: Append query params for optimization:
- Blog hero: original size (typically 1920px wide)
- Inline images: use as-is (most are 1280px+)

### Unsplash (Alternative)
- **License**: Unsplash License — free for commercial use, no attribution required
- **URL**: https://unsplash.com
- **Hotlinking**: Required — must use their CDN

**Finding images:**
1. WebSearch: `site:unsplash.com [topic keywords]`
2. Extract photo ID from URL (e.g., `photo-1234567890123-abcdef`)
3. Build direct URL: `https://images.unsplash.com/photo-<id>?w=1200&h=630&fit=crop&q=80`
4. Verify: `curl -sI "<url>" | head -1` — must return HTTP 200

### Pexels (Fallback)
- **License**: Pexels License — free for commercial use, no attribution required
- **URL**: https://pexels.com
- **Finding**: WebSearch `site:pexels.com [topic keywords]`

### Image Usage Rules

| Rule | Requirement |
|------|-------------|
| Alt text | Required on ALL images — full descriptive sentence |
| Placement | After H2 headings, before body text |
| Distribution | Spread evenly — never cluster images |
| Count | 3-5 images per 2,000-word post |
| Relevance | Must relate to adjacent content |
| Format | AVIF preferred, WebP fallback, JPEG last resort |

### Image Density by Content Type

Optimal image frequency varies by post format (THM SEO Agency data):

| Content Type | Image Density | Example (2,000-word post) |
|-------------|---------------|---------------------------|
| Listicles | 1 image per 133 words | ~15 images |
| How-to guides | 1 image per 179 words | ~11 images |
| Long-form analysis | 1 image per 200-250 words | ~8-10 images |
| Case studies | 1 image per 307 words | ~6-7 images |

Articles with an image every 75-100 words get 2x more social shares (BuzzSumo).
Balance density against page weight — use optimized formats (AVIF/WebP) to keep
total image payload under 500KB.

### SVG Impact on Engagement

D.C. Thomson case study results after replacing raster images with contextual SVGs:
- Session duration doubled
- 317% increase in read-to-completion rate
- SVGs are resolution-independent, lightweight, and dark-mode compatible

### Alt Text Guidelines
- Full descriptive sentence including topic keywords naturally
- Describe what the image shows AND its relevance to the content
- 10-125 characters
- No keyword stuffing — natural language only

Good: `Marketing team analyzing AI search traffic data on a dashboard showing citation metrics`
Bad: `SEO AI marketing blog optimization image`

**AI Systems and Images**: AI crawlers read alt text and captions, NOT the images
themselves. Write context-rich alt text that conveys the data or insight the image
represents. For charts, include the key data point in the alt text. For screenshots,
describe what the screenshot demonstrates.

### Embedding Images

**Standard Markdown:**
```markdown
![Descriptive alt text sentence](https://cdn.pixabay.com/photo/.../image.jpg)
```

**MDX (Next.js):**
```mdx
![Descriptive alt text sentence](https://cdn.pixabay.com/photo/.../image.jpg)
```

For Next.js projects, verify `next.config.ts` includes the image domain:
```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'cdn.pixabay.com' },
    { protocol: 'https', hostname: 'images.unsplash.com' },
    { protocol: 'https', hostname: 'images.pexels.com' },
  ],
}
```

**HTML:**
```html
<figure>
  <img src="https://cdn.pixabay.com/photo/.../image.jpg"
       alt="Descriptive alt text sentence"
       width="1200" height="630" loading="lazy">
  <figcaption>Photo via Pixabay</figcaption>
</figure>
```

---

## Image Format Optimization

### AVIF as Primary Format

AVIF is the recommended image format for 2026:
- ~50% smaller than JPEG at equivalent quality
- ~20-30% smaller than WebP
- 93.8% global browser support (caniuse, Jan 2026)
- Supports HDR, wide color gamut, and transparency

### `<picture>` Element with Progressive Fallback

Always use the `<picture>` element for format negotiation:

```html
<picture>
  <source srcset="image.avif" type="image/avif">
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" alt="Descriptive alt text" width="1200" height="630" loading="lazy">
</picture>
```

This pattern serves AVIF to supporting browsers, falls back to WebP, then JPEG.

### LCP Image Rules

**NEVER** use `loading="lazy"` on hero/LCP (Largest Contentful Paint) images.
Lazy loading the LCP image delays the largest element on the page and directly
harms Core Web Vitals scores.

For hero/above-the-fold images:
```html
<img src="hero.avif" alt="..." width="1200" height="630"
     fetchpriority="high" decoding="async">
```

For below-the-fold images:
```html
<img src="image.avif" alt="..." width="800" height="450"
     loading="lazy" decoding="async">
```

### Dark Mode Image Support

Use `<picture>` with `prefers-color-scheme` media query for theme-aware images:

```html
<picture>
  <source srcset="chart-dark.avif" media="(prefers-color-scheme: dark)" type="image/avif">
  <source srcset="chart-dark.webp" media="(prefers-color-scheme: dark)" type="image/webp">
  <source srcset="chart-light.avif" type="image/avif">
  <source srcset="chart-light.webp" type="image/webp">
  <img src="chart-light.jpg" alt="Descriptive alt text" width="800" height="450">
</picture>
```

CSS variable pattern for inline SVG dark mode:
```css
:root {
  --chart-bg: #ffffff;
  --chart-text: #111827;
  --chart-grid: rgba(0, 0, 0, 0.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --chart-bg: transparent;
    --chart-text: #f3f4f6;
    --chart-grid: rgba(255, 255, 255, 0.08);
  }
}
```

---

## SVG Chart Integration (Built-In)

Charts are generated by the `blog-chart` sub-skill. The writer identifies chart-worthy
data during the writing process and delegates chart generation internally.

### Chart Type Selection Guide

| Data Pattern | Best Chart Type |
|-------------|-----------------|
| Before/after comparison | Grouped bar chart |
| Ranked factors / correlations | Lollipop chart |
| Parts of whole / market share | Donut chart |
| Trend over time | Line chart |
| Percentage improvement | Horizontal bar chart |
| Distribution / range | Area chart |
| Multi-dimensional scoring | Radar chart |

**Diversity is mandatory** — never use the same chart type twice in one post.
Target 2-4 charts per 2,000-word post.

### Dark-Mode Compatible Styling

All charts must work on both dark and light backgrounds:

```
Text elements:     fill="currentColor"
Grid lines:        stroke="currentColor" opacity="0.08"
Axis lines:        stroke="currentColor" opacity="0.3"
Background:        transparent (no fill on root SVG)
Subtitle text:     fill="currentColor" opacity="0.45"
Source text:        fill="currentColor" opacity="0.35"
Label text:         fill="currentColor" opacity="0.8"
```

### Color Palette (works on dark and light)

| Color | Hex | Use Case |
|-------|-----|----------|
| Orange | `#f97316` | Primary / highest value |
| Sky Blue | `#38bdf8` | Secondary / comparison |
| Purple | `#a78bfa` | Tertiary / special category |
| Green | `#22c55e` | Quaternary / positive indicator |

For text inside colored elements: `fill="white"` with `fontWeight="800"`.

### Standard SVG Shell

```xml
<svg
  viewBox="0 0 560 380"
  style="max-width: 100%; height: auto; font-family: 'Inter', system-ui, sans-serif"
  role="img"
  aria-label="Chart description with key data point"
>
  <title>Chart Title</title>
  <desc>Description for screen readers with all key data points and source</desc>

  <!-- Chart content -->

  <text x="280" y="372" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.35">
    Source: Source Name (Year)
  </text>
</svg>
```

### JSX/MDX Shell (camelCase attributes)

```jsx
<svg
  viewBox="0 0 560 380"
  style={{maxWidth: '100%', height: 'auto', fontFamily: "'Inter', system-ui, sans-serif"}}
  role="img"
  aria-label="Chart description"
>
  <title>Chart Title</title>
  <desc>Description for screen readers</desc>

  {/* Chart content */}

  <text x="280" y="372" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.35">
    Source: Source Name (Year)
  </text>
</svg>
```

### JSX Attribute Conversion (Required for MDX)

| HTML | JSX |
|------|-----|
| `stroke-width` | `strokeWidth` |
| `stroke-dasharray` | `strokeDasharray` |
| `stroke-linecap` | `strokeLinecap` |
| `text-anchor` | `textAnchor` |
| `font-size` | `fontSize` |
| `font-weight` | `fontWeight` |
| `font-family` | `fontFamily` |
| `class` | `className` |
| `style="..."` | `style={{...}}` |

### Embedding Charts

**Standard HTML:**
```html
<figure>
  <svg viewBox="0 0 560 380" ...>...</svg>
  <figcaption>Source: Source Name, Year</figcaption>
</figure>
```

**MDX:**
```mdx
<figure className="chart-container" style={{margin: '2.5rem 0', textAlign: 'center', padding: '1.5rem', borderRadius: '12px'}}>
  <svg viewBox="0 0 560 380" ...>...</svg>
</figure>
```

### Invoking blog-chart

When generating charts, pass to the `blog-chart` sub-skill:
1. **Chart type** (ensure diversity — never repeat within a post)
2. **Title** for the chart
3. **Exact data values** with sources
4. **Source attribution** (name and year)
5. **Platform format**: html or mdx

The sub-skill returns complete SVG wrapped in a `<figure>`. Verify before embedding:
1. `currentColor` usage (no hardcoded text colors)
2. No white/light backgrounds
3. If MDX: camelCase attributes
4. Source attribution present

### Common Pitfalls

| Mistake | Impact | Fix |
|---------|--------|-----|
| `fill="#111827"` on text | Invisible on dark mode | Use `fill="currentColor"` |
| `rect fill="white"` background | Bright flash on dark mode | Remove or use transparent |
| `stroke-width` in MDX | Compilation error | Use `strokeWidth` |
| `class` in MDX | Compilation error | Use `className` |
| Same chart type twice | Visual monotony | Enforce chart diversity |
| No `role="img"` | Accessibility failure | Always include |
| No source attribution | Trust issue | Always cite data source |
