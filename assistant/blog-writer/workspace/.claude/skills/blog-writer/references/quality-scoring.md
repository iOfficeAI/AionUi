# Blog Quality Scoring Checklist

Score each blog post against this checklist. Used by `/blog analyze`.

## Content Quality (30 points)

| Check | Points | Pass Criteria |
|-------|--------|---------------|
| Depth/comprehensiveness | 7 | Covers topic thoroughly, no major gaps |
| Readability (Flesch 60-70) | 7 | Flesch 60-70 ideal, 55-75 acceptable; Grade 7-8; Gunning Fog 7-8 |
| Originality/unique value markers | 5 | Original data, case studies, first-hand experience |
| Sentence & paragraph structure | 4 | Avg sentence 15-20 words, ≤25% over 20; paragraphs 40-80 words; H2 every 200-300 words |
| Engagement elements | 4 | TL;DR box, callouts, varied content blocks |
| Grammar/anti-pattern | 3 | Passive voice ≤10%, AI trigger words ≤5/1K, transition words 20-30%, clean prose |

## SEO Optimization (25 points)

| Check | Points | Pass Criteria |
|-------|--------|---------------|
| Heading hierarchy with keywords | 5 | H1 → H2 → H3, no skips, keyword in 2-3 headings, H2 every 200-300 words |
| Title tag (40-60 chars, keyword, power word) | 4 | Front-loaded keyword, positive sentiment, brackets if applicable |
| Keyword placement/density | 4 | Natural integration (0.5-2%), no stuffing, present in first 100 words |
| Internal linking (3-10 contextual) | 4 | Descriptive anchor text, bidirectional, related content |
| URL structure | 3 | Short, keyword-rich, no stop words, lowercase |
| Meta description (150-160 chars, stat) | 3 | Fact-dense, includes one statistic, ends with value prop |
| External linking (tier 1-3) | 2 | 3-8 outbound links to authoritative sources |

## E-E-A-T Signals (15 points)

| Check | Points | Pass Criteria |
|-------|--------|---------------|
| Author attribution (named, with bio) | 4 | Real name, credentials, E-E-A-T bio — not a sales pitch |
| Source citations (tier 1-3, inline format) | 4 | `([Source](url), year)` format, 8+ unique stats, zero fabricated |
| Trust indicators (contact, about, transparency) | 4 | Site has contact page, about page, editorial policy |
| Experience signals (first-person markers) | 3 | "When we tested...", "In our experience...", original photos/data |

## Technical Elements (15 points)

| Check | Points | Pass Criteria |
|-------|--------|---------------|
| Schema markup (3+ types = bonus) | 4 | BlogPosting + FAQ + Person minimum; dateModified current |
| Image optimization (alt text, format, lazy load) | 3 | AVIF/WebP, descriptive alt text, lazy except LCP |
| Structured data elements | 2 | Tables, lists, comparison blocks for AI extraction |
| Page speed signals (no render-blocking) | 2 | LCP < 2.5s, no render-blocking JS, fetchpriority on hero |
| Mobile-friendliness | 2 | Responsive, tap targets 48px+, no horizontal scroll, paragraphs ≤100 words |
| OG/social meta tags | 2 | og:title, og:description, og:image (1200x630), twitter:card |

## AI Citation Readiness (15 points)

| Check | Points | Pass Criteria |
|-------|--------|---------------|
| Passage-level citability (120-180 word blocks) | 4 | Self-contained sections between headings with stat + source |
| Q&A formatted sections | 3 | 60-70% of H2s as questions, FAQ section present |
| Entity clarity | 3 | Unambiguous topic entity, consistent terminology |
| Content structure for extraction | 3 | Answer-first, tables with `<thead>`, comparison formats |
| AI crawler accessibility | 2 | SSR/SSG, no JS-gated content, robots.txt allows AI bots |

## Total: 100 points

### Scoring Bands

| Score | Rating | Action |
|-------|--------|--------|
| 90-100 | Exceptional | Publish as-is, flagship content |
| 80-89 | Strong | Minor polish, ready for publication |
| 70-79 | Acceptable | Targeted improvements needed before publish |
| 60-69 | Below Standard | Significant rework required |
| < 60 | Rewrite | Fundamental issues, start from outline |

## Priority Classification

When reporting issues, classify by priority:

### Critical (Must Fix Before Publishing)
- Fabricated statistics (zero tolerance)
- Broken heading hierarchy (H1 → H3 skip)
- Paragraphs > 200 words (Yoast red)
- No source attribution on claims
- Missing author attribution
- Content behind JavaScript (invisible to AI crawlers)
- Missing TL;DR box

### High Priority
- Missing answer-first formatting on H2 sections
- No FAQ section/schema
- Fewer than 8 sourced statistics
- Missing meta description or lastUpdated
- Title tag outside 40-60 character range
- No internal links
- Flesch score outside 55-75 range
- No OG/social meta tags
- Paragraphs > 150 words
- Passive voice > 15%
- AI trigger words > 8 per 1,000

### Medium Priority
- Fewer than 2 charts
- Fewer than 3 images
- Tier 4-5 sources present
- Self-promotion > 1 mention
- Sections exceeding 300 words between headings
- Missing experience signals (no first-person markers)
- Images not in AVIF/WebP format
- `loading="lazy"` on LCP image
- Average sentence length > 22 words
- Transition words < 15% or > 35%

### Low Priority
- Paragraph length slightly above 80 words (but under 150)
- Non-question H2 headings above 40%
- Missing chart type diversity
- Images without alt text
- Missing external links to tier 1-3 sources
- Entity terminology inconsistency

## Quick Automated Checks

These can be detected programmatically:

### Content Quality
1. Word count per paragraph (split on double newlines, flag > 150, critical > 200)
2. Sentence count per paragraph (flag > 3 sentences)
3. Flesch-Kincaid score (target 60-70, acceptable 55-75)
4. Heading frequency (flag gaps > 300 words between H2s)
5. TL;DR box presence (search for "TL;DR" in first 500 characters)
6. Average sentence length (target 15-20, flag > 22)
7. Sentences over 20 words (flag if > 25% of total)
8. Passive voice percentage (flag > 10%, high priority > 15%)
9. AI trigger word density (flag > 5 per 1,000 words)
10. Transition word percentage (target 20-30%, flag < 15% or > 35%)

### SEO Optimization
11. Title tag length (frontmatter, target 40-60 chars)
12. Heading hierarchy (regex for `^#{1,6} `, no skipped levels)
13. Meta description length (frontmatter, target 150-160 chars)
14. Internal link count (regex for relative URLs or same-domain links)
15. External link count and tier classification
16. URL structure check (lowercase, no stop words)

### E-E-A-T Signals
17. Author attribution presence (frontmatter `author` field)
18. Citation format (regex for `\([^)]+\(http`)
19. Unsourced statistics (numbers without attribution nearby)
20. Self-promotion patterns (brand name frequency, max 1)
21. First-person markers ("we tested", "in our experience")

### Technical Elements
22. Image count (regex for `!\[` or `<img`)
23. Image alt text presence (images without alt attribute)
24. Chart count (regex for `<svg` or `<figure`)
25. Schema presence (search for structured data markers)
26. OG meta tags (frontmatter `ogImage`, `coverImage`)
27. `loading="lazy"` on first image (flag as LCP issue)
28. lastUpdated presence (frontmatter check)

### AI Citation Readiness
29. Section word count between headings (target 120-180)
30. Question-format heading ratio (target 60-70% of H2s)
31. FAQ presence (search for "FAQ" or "Frequently Asked")
32. Table presence with `<thead>` (for AI extraction)
33. robots.txt AI bot allowance (site-level check)
