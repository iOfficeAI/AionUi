# Internal Link Architecture

## Why Internal Links Matter

Internal links are the primary mechanism for distributing page authority across
a site. They tell search engines and AI systems which pages are important, how
content relates, and what the site's topical structure looks like.

John Mueller (Google): Internal linking is "supercritical for SEO" -- it helps
Google understand site structure and page importance.

seoClarity case study: 23% organic traffic increase from internal link
optimization alone, with no new content published.

---

## Link Density Targets

The number of internal links per post should scale with content length.

| Post Length | Internal Links | Notes |
|-------------|---------------|-------|
| < 1,000 words | 3-5 | Short posts, fewer natural insertion points |
| 1,000-2,000 words | 5-7 | Standard blog posts |
| 2,000-3,000 words | 7-10 | Detailed guides |
| 3,000+ words (pillar) | 8-12 | Comprehensive pillar pages |

### Hard Rules

- **Minimum**: 3 contextual internal links per post (no exceptions)
- **Maximum**: 10 links per post for standard content, 12 for pillar pages
- **No orphan posts**: Every published post must be linked from at least one
  other page on the site
- **No dead ends**: Every post must link out to at least 3 other pages

---

## Anchor Text Distribution

Anchor text is the visible, clickable text of a hyperlink. Its optimization is
critical but overuse of exact-match anchors triggers spam signals.

### Recommended Distribution

| Anchor Type | Target Share | Example for "technical SEO" |
|-------------|-------------|----------------------------|
| Exact match | 5-10% | "technical SEO" |
| Partial match | 20-30% | "technical SEO best practices", "guide to technical SEO" |
| Semantic/related | 30-40% | "site architecture optimization", "crawlability improvements" |
| Branded | 10-15% | "our SEO guide", "[Brand] technical audit" |
| Natural/contextual | 15-25% | "the framework we outlined earlier", "as we discussed" |

### Anchor Text Rules

- **Descriptive**: The anchor text should tell the reader what they will find
  at the destination
- **Natural**: Must read naturally in the sentence -- if removing the link
  leaves awkward phrasing, rewrite
- **Varied**: Never use the same anchor text for the same destination across
  multiple pages
- **Relevant**: Anchor text must relate to the destination page's topic
- **Reasonable length**: 2-6 words is ideal, never an entire sentence

### Anchor Text Anti-Patterns -- NEVER Use

| Pattern | Problem | Fix |
|---------|---------|-----|
| "click here" | Zero topical signal | "Read our [technical SEO checklist]" |
| "this article" | No descriptive value | "Our [guide to crawl budget optimization]" |
| "read more" | Generic, no context | "[How structured data improves AI visibility]" |
| "learn more" | Generic, no context | "Learn [how to audit your internal links]" |
| Naked URLs | Unreadable, no context | Replace with descriptive text |
| Full sentence as anchor | Looks spammy, dilutes signal | Reduce to 2-6 key words |
| Same exact anchor everywhere | Over-optimization signal | Vary anchor text across pages |

---

## Link Placement Strategy

Where a link appears on the page affects how much weight it carries. Links
higher on the page and within body content carry significantly more authority
than links in footers or sidebars.

### Placement Priority

| Location | Weight | Notes |
|----------|--------|-------|
| First 2-3 paragraphs | Highest | Most crawled, most clicked |
| Within body content (contextual) | High | Natural editorial links |
| After key sections (H2s) | Medium-High | Contextually relevant transitions |
| Table of contents | Medium | Navigation aid, passes some authority |
| Related posts section | Medium-Low | Algorithmic, less editorial signal |
| Sidebar | Low | Often templated, discounted |
| Footer | Lowest | Heavily discounted by search engines |

### Best Practices

1. Place the most important internal link in the first 2-3 paragraphs
2. Link to the pillar page early in every supporting article
3. Distribute links naturally throughout the body -- not clustered
4. End sections with transitional links to related content
5. Avoid placing all links in a "Related Articles" block at the bottom

---

## Bidirectional Linking

When page A links to page B, page B should also link back to page A (where
contextually relevant). This creates a strong topical relationship signal.

### Implementation Process

1. When publishing a new post that links to existing content:
   - Open each linked page
   - Find a natural place to add a link back to the new post
   - Use appropriate anchor text (not identical to the forward link)

2. When updating an existing post:
   - Check if the linked pages reciprocate
   - Add reciprocal links where missing

### Example

**Post A**: "Complete Guide to Technical SEO"
- Contains: "...proper [schema markup implementation](/blog/schema-guide)
  is essential for AI visibility."

**Post B**: "Schema Markup Implementation Guide" (should link back)
- Add: "...schema is a critical component of [technical SEO
  optimization](/blog/technical-seo-guide), affecting how search engines
  interpret your content."

---

## Hub-and-Spoke Model

The hub-and-spoke (or pillar-cluster) model is the most effective internal
linking architecture for topical authority.

### Structure

```
                    ┌──────────────────┐
                    │   Pillar Page    │
                    │   (Hub)          │
                    │   /topic-guide   │
                    └────────┬─────────┘
                             │
           ┌─────────────────┼──────────────────┐
           │                 │                   │
    ┌──────▼──────┐   ┌─────▼──────┐   ┌───────▼──────┐
    │  Spoke #1   │   │  Spoke #2  │   │   Spoke #3   │
    │  Subtopic   │   │  Subtopic  │   │   Subtopic   │
    └──────┬──────┘   └─────┬──────┘   └───────┬──────┘
           │                │                   │
           └────────────────┼───────────────────┘
                    (cross-links between spokes)
```

### Requirements

| Element | Specification |
|---------|--------------|
| Pillar page | 3,000-4,000 words, covers topic broadly |
| Supporting articles (spokes) | 8-12 articles, each covers a subtopic in depth |
| Pillar → Spoke links | Pillar links to ALL supporting articles |
| Spoke → Pillar links | Every supporting article links back to pillar |
| Spoke ↔ Spoke links | Cross-link between related subtopics (where natural) |
| Anchor text to pillar | Varied -- use different anchor text from each spoke |

### Example Topic Cluster: "Technical SEO"

**Pillar**: "The Complete Guide to Technical SEO in 2026"

**Spokes**:
1. Schema Markup Implementation Guide
2. Core Web Vitals Optimization
3. Crawl Budget Management
4. XML Sitemap Best Practices
5. robots.txt Configuration Guide
6. International SEO with hreflang
7. Mobile-First Indexing Checklist
8. Site Speed Optimization Techniques
9. Structured Data Testing and Validation
10. JavaScript SEO for Single-Page Applications

Each spoke links to the pillar and to 2-3 related spokes.

---

## Orphan Page Detection

Orphan pages have zero internal links pointing to them. They are invisible to
search crawlers navigating via internal links and will only be discovered
through sitemap.xml (which carries less authority signal).

### How to Find Orphan Pages

1. **Site crawl**: Use a crawler (Screaming Frog, Sitebulb) to map all internal
   links and identify pages with zero inbound internal links.

2. **Manual check**: For each published blog post URL, search the rest of the
   site for links pointing to it:
   ```bash
   # Check if any page links to a specific URL
   grep -r "/blog/your-post-slug" ./content/ --include="*.md"
   ```

3. **CMS/database query**: Query your content database for pages not referenced
   in any other page's body content.

### Fixing Orphan Pages

For each orphan page:
1. Identify 2-3 topically related existing pages
2. Add a contextual link from each related page to the orphan
3. Ensure the orphan page links back to at least one of those pages
4. If no related content exists, consider whether the orphan should be
   consolidated into another page or removed

---

## Topic Cannibalization Detection

Topic cannibalization occurs when multiple pages target the same primary keyword,
causing them to compete against each other in search results. This splits
authority and often results in neither page ranking well.

### Symptoms

| Indicator | What It Means |
|-----------|---------------|
| Two pages ranking for same keyword, both fluctuating | Google is unsure which to show |
| One page dropped after publishing a similar new post | New post cannibalized the old one |
| Neither page ranks in top 10 despite strong content | Split authority |
| Search Console shows impressions split across URLs for same query | Confirmed cannibalization |

### Detection Method

1. In Google Search Console, filter by query and check which pages receive
   impressions
2. If 2+ pages appear for the same query, cannibalization exists
3. Review both pages' title tags, H1s, and meta descriptions for overlap

### Resolution Strategies

| Strategy | When to Use |
|----------|-------------|
| **Merge** | Both pages cover the same topic; combine the best content from both into one, redirect the weaker URL |
| **Differentiate** | Pages cover overlapping but distinct angles; sharpen each page's unique focus and keyword targeting |
| **Canonical** | One page is clearly the primary; add `rel="canonical"` from secondary to primary |
| **301 Redirect** | Weaker page adds no unique value; redirect to stronger page |
| **Noindex secondary** | Keep both pages for users but exclude weaker from search |

---

## Internal Link Audit Checklist

Run this audit quarterly or when publishing new content.

### Per-Post Checks

| Check | Pass Criteria | Fail Action |
|-------|---------------|-------------|
| Internal link count | 3-10 links (length-dependent) | Add links to related content |
| No orphan status | At least 1 internal link points to this page | Add links from 2-3 related pages |
| Anchor text variety | No single anchor used more than twice for same destination | Vary anchor text |
| No generic anchors | Zero instances of "click here", "read more", "this article" | Replace with descriptive text |
| Bidirectional links | Linked pages reciprocate where relevant | Add reciprocal links |
| Pillar link present | If part of a topic cluster, links to/from pillar | Add pillar connection |
| Links functional | All internal links return 200 | Fix broken links (301 or remove) |
| Link placement | At least 1 link in first 3 paragraphs | Move important link higher |
| No over-linking | No paragraph has more than 2 internal links | Remove least relevant link |
| Anchor describes destination | Reader can predict what they'll find | Rewrite anchor text |

### Site-Wide Checks

| Check | Pass Criteria | Fail Action |
|-------|---------------|-------------|
| Orphan page count | 0 orphan pages | Link to all orphans from related content |
| Cannibalization | No two pages target same primary keyword | Merge or differentiate |
| Pillar coverage | Every topic cluster has a pillar page | Create missing pillar pages |
| Spoke count per pillar | 8-12 supporting articles | Create more supporting content |
| Average internal links per page | 5-8 | Bulk-add links to under-linked pages |
| Max clicks from homepage | Any page reachable in 3-4 clicks | Restructure navigation |
| Broken internal links | 0 broken links (404s) | Fix or remove all broken links |

---

## Link Velocity Guidelines

When adding internal links to existing content, do not bulk-update every page
at once. This can trigger algorithmic review.

| Action | Recommended Pace |
|--------|-----------------|
| New post with links | Normal -- add all links at publish time |
| Updating existing posts | 3-5 posts per week maximum |
| New pillar page launch | Update all spokes within 1-2 weeks |
| Site-wide link audit fix | Spread changes over 2-4 weeks |
| Fixing orphan pages | 2-3 per day |

---

## Internal Link Tracking

Maintain a simple tracking mechanism to ensure link health over time.

### Recommended Fields

| Field | Purpose |
|-------|---------|
| Source URL | Page containing the link |
| Destination URL | Page being linked to |
| Anchor text | Clickable text used |
| Date added | When the link was created |
| Context | Why this link exists (editorial, navigation, pillar-spoke) |
| Status | Active, broken, or removed |

This tracking helps identify:
- Over-linked pages (too many pages linking to one destination)
- Under-linked pages (valuable content with few inbound links)
- Stale anchor text that needs updating after content refreshes
- Broken links after URL changes or content deletion
