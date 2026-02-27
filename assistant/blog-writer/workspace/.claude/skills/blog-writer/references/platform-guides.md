# Platform-Specific Output Formatting

Adapt blog output to each platform's requirements. Detect the platform
from project structure (see `SKILL.md` Platform Detection table) and apply
the corresponding format rules below.

---

## Next.js / MDX

### Frontmatter Format
```yaml
---
title: "How Does AI Search Impact Organic Traffic in 2026?"
description: "Organic CTR declined 61% with AI Overviews. Here's how to optimize for both Google rankings and AI citations in 2026."
date: "2026-02-18"
lastUpdated: "2026-02-18"
author: "Author Name"
tags: ["ai-search", "seo", "traffic"]
coverImage: "https://cdn.pixabay.com/photo/2024/01/15/12/00/ai-search.jpg"
coverImageAlt: "Marketing dashboard showing AI search traffic metrics and citation rates"
ogImage: "https://cdn.pixabay.com/photo/2024/01/15/12/00/ai-search.jpg"
---
```

**Supported frontmatter fields**: title, description, date, lastUpdated, author,
tags, coverImage, coverImageAlt, ogImage. Adapt field names to match the
project's existing convention (some use `image` instead of `coverImage`).

### Image Embedding
```mdx
![Marketing team analyzing search traffic on a dashboard](https://cdn.pixabay.com/photo/.../image.jpg)
```

For projects using `next/image` component:
```tsx
import Image from 'next/image'

<Image
  src="https://cdn.pixabay.com/photo/.../image.jpg"
  alt="Marketing team analyzing search traffic on a dashboard"
  width={1200}
  height={630}
  priority={false}
/>
```

### next.config.ts Image Domains (Required)
```typescript
// next.config.ts
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.pixabay.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
    ],
  },
}
```

Without these entries, `next/image` will reject external image URLs at build time.

### Chart / SVG Embedding (JSX-Compatible)

All SVG attributes must use camelCase in MDX files. HTML-style attributes
cause compilation errors.

```mdx
<figure className="chart-container" style={{margin: '2.5rem 0', textAlign: 'center', padding: '1.5rem', borderRadius: '12px'}}>
  <svg
    viewBox="0 0 560 380"
    style={{maxWidth: '100%', height: 'auto', fontFamily: "'Inter', system-ui, sans-serif"}}
    role="img"
    aria-label="Chart showing 61% CTR decline with AI Overviews"
  >
    <title>Organic CTR Impact</title>
    <desc>Bar chart comparing organic CTR before and after AI Overviews</desc>
    <text x="280" y="30" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor">
      Organic CTR Decline
    </text>
    <rect x="100" y="60" width="160" height="200" rx="6" fill="#f97316" />
    <text x="180" y="170" textAnchor="middle" fontSize="14" fontWeight="800" fill="white">
      1.76%
    </text>
    <rect x="300" y="180" width="160" height="80" rx="6" fill="#38bdf8" />
    <text x="380" y="225" textAnchor="middle" fontSize="14" fontWeight="800" fill="white">
      0.61%
    </text>
    <text x="280" y="372" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.35">
      Source: Seer Interactive (2025)
    </text>
  </svg>
</figure>
```

**JSX attribute conversion reference:**

| HTML Attribute | JSX Attribute |
|----------------|---------------|
| `stroke-width` | `strokeWidth` |
| `stroke-dasharray` | `strokeDasharray` |
| `stroke-linecap` | `strokeLinecap` |
| `text-anchor` | `textAnchor` |
| `font-size` | `fontSize` |
| `font-weight` | `fontWeight` |
| `font-family` | `fontFamily` |
| `class` | `className` |
| `style="..."` | `style={{...}}` |
| `fill-opacity` | `fillOpacity` |
| `stop-color` | `stopColor` |
| `clip-path` | `clipPath` |

### MDX Component Imports for Custom Charts
```mdx
import { BarChart } from '@/components/charts/BarChart'
import { FAQSchema } from '@/components/FAQSchema'

<BarChart data={chartData} title="Organic CTR Decline" />
<FAQSchema faqs={[{ question: "...", answer: "..." }]} />
```

Check the project's `components/` directory for available chart components
before inlining SVG. Use project components when they exist.

### generateStaticParams for SSG (Critical for AI Crawlers)

AI crawlers (GPTBot, ClaudeBot, PerplexityBot) cannot execute JavaScript.
Pages must be statically generated or server-rendered. Never use client-only
rendering for blog content.

```typescript
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = getAllPosts()
  return posts.map((post) => ({
    slug: post.slug,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPostBySlug(params.slug)
  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      images: [post.ogImage],
      type: 'article',
      publishedTime: post.date,
      modifiedTime: post.lastUpdated,
    },
  }
}
```

### Key Configuration Notes
- MDX files require `@next/mdx` or `next-mdx-remote` package
- Verify `mdx-components.tsx` exists at project root for custom element mapping
- Use `export const metadata` or `generateMetadata` for per-page SEO
- JSON-LD schema should be rendered in the page component, not injected client-side
- Sitemap: use `app/sitemap.ts` with `MetadataRoute.Sitemap` type

---

## Astro

### Frontmatter Format
```yaml
---
title: "How Does AI Search Impact Organic Traffic in 2026?"
description: "Organic CTR declined 61% with AI Overviews. Here's how to optimize."
pubDate: 2026-02-18
updatedDate: 2026-02-18
author: "Author Name"
tags: ["ai-search", "seo", "traffic"]
heroImage: "/images/ai-search-cover.jpg"
heroImageAlt: "Marketing dashboard showing AI search metrics"
---
```

Astro uses `pubDate` and `updatedDate` (Date objects) instead of `date`
and `lastUpdated` (strings). Adapt to match the project's content schema.

### Content Collections (src/content/blog/)

Astro 4+ uses type-safe content collections with Zod schema validation:

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content'

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
  }),
})

export const collections = { blog }
```

Place blog posts in `src/content/blog/` as `.md` or `.mdx` files.

### Image Embedding
```markdown
![Marketing team analyzing search data](./images/search-dashboard.jpg)
```

Using `astro:assets` for optimization:
```astro
---
import { Image } from 'astro:assets'
import searchDashboard from '../assets/search-dashboard.jpg'
---
<Image src={searchDashboard} alt="Marketing team analyzing search data" />
```

For remote images, configure `astro.config.mjs`:
```javascript
export default defineConfig({
  image: {
    domains: ['cdn.pixabay.com', 'images.unsplash.com', 'images.pexels.com'],
  },
})
```

### Chart / SVG Embedding

Standard SVG works directly in `.md` files. For `.astro` component wrappers:

```astro
---
// src/components/Chart.astro
const { title, ariaLabel } = Astro.props
---
<figure class="chart-container">
  <slot />
  <figcaption>{title}</figcaption>
</figure>
```

Use standard HTML attributes (not camelCase) in `.astro` and `.md` files:
```html
<svg viewBox="0 0 560 380" role="img" aria-label="CTR decline chart">
  <text x="280" y="30" text-anchor="middle" font-size="16" fill="currentColor">
    Chart Title
  </text>
</svg>
```

### Key Configuration Notes
- Static output by default (SSG) -- ideal for AI crawlers without JS execution
- Markdown files support raw HTML/SVG natively (no unsafe config needed)
- For MDX support: add `@astrojs/mdx` integration
- Sitemap: add `@astrojs/sitemap` integration with `site` config
- RSS: add `@astrojs/rss` for feed generation
- View Transitions: built-in via `<ViewTransitions />` component

---

## Hugo

### Frontmatter Format (YAML)
```yaml
---
title: "How Does AI Search Impact Organic Traffic in 2026?"
description: "Organic CTR declined 61% with AI Overviews. Here's how to optimize."
date: 2026-02-18
lastmod: 2026-02-18
author: "Author Name"
tags: ["ai-search", "seo", "traffic"]
categories: ["SEO Strategy"]
series: ["AI Search Optimization"]
images:
  - "/images/ai-search-cover.jpg"
draft: false
---
```

### Frontmatter Format (TOML)
```toml
+++
title = "How Does AI Search Impact Organic Traffic in 2026?"
description = "Organic CTR declined 61% with AI Overviews."
date = 2026-02-18
lastmod = 2026-02-18
author = "Author Name"
tags = ["ai-search", "seo", "traffic"]
categories = ["SEO Strategy"]
series = ["AI Search Optimization"]
images = ["/images/ai-search-cover.jpg"]
draft = false
+++
```

Hugo uses `lastmod` instead of `lastUpdated`. Supports both YAML (`---`)
and TOML (`+++`) frontmatter delimiters.

### Taxonomy Structure
Hugo supports three built-in taxonomies:
- **categories**: Broad topic groupings (content pillars)
- **tags**: Specific topic labels (keywords)
- **series**: Multi-part content sequences

Configure in `hugo.toml`:
```toml
[taxonomies]
  category = "categories"
  tag = "tags"
  series = "series"
```

### Image Embedding
```markdown
![Marketing team analyzing search data](/images/search-dashboard.jpg)
```

Hugo processes images from `static/images/` or page bundles (`content/blog/post-name/images/`).

### Chart / SVG Embedding via Shortcodes

Create a custom shortcode for inline SVG:

```html
<!-- layouts/shortcodes/chart.html -->
<figure class="chart-container" style="margin: 2.5rem 0; text-align: center;">
  {{ .Inner | safeHTML }}
  {{ with .Get "caption" }}<figcaption>{{ . }}</figcaption>{{ end }}
</figure>
```

Usage in markdown:
```markdown
{{< chart caption="Source: Seer Interactive (2025)" >}}
<svg viewBox="0 0 560 380" role="img" aria-label="CTR decline chart">
  <!-- SVG content -->
</svg>
{{< /chart >}}
```

### Goldmark Renderer Config (Required for SVG)

Hugo's default Goldmark renderer escapes raw HTML. Enable unsafe rendering
for inline SVG:

```toml
# hugo.toml
[markup.goldmark.renderer]
  unsafe = true
```

Without this setting, all `<svg>`, `<figure>`, and other HTML tags in
markdown files will be stripped from the output.

### Custom Archetypes
```markdown
<!-- archetypes/blog.md -->
---
title: "{{ replace .Name "-" " " | title }}"
description: ""
date: {{ .Date }}
lastmod: {{ .Date }}
author: ""
tags: []
categories: []
images: []
draft: true
---

## Introduction

[Hook with statistic]
```

Create new posts with: `hugo new blog/my-post-title.md`

### Key Configuration Notes
- Posts go in `content/blog/` or `content/posts/` (check project convention)
- Page bundles (`content/blog/post-name/index.md`) co-locate images with content
- Use `{{ .Params.lastmod }}` in templates for freshness display
- JSON-LD schema: add in `layouts/partials/schema.html` partial
- Sitemap auto-generated at `/sitemap.xml`
- RSS auto-generated at `/index.xml`

---

## Jekyll

### Frontmatter Format (YAML Required)
```yaml
---
layout: post
title: "How Does AI Search Impact Organic Traffic in 2026?"
description: "Organic CTR declined 61% with AI Overviews. Here's how to optimize."
date: 2026-02-18
last_modified_at: 2026-02-18
author: "Author Name"
categories: [seo-strategy]
tags: [ai-search, seo, traffic]
image: /assets/images/ai-search-cover.jpg
---
```

### Naming Convention (Required)
Posts must follow: `_posts/YYYY-MM-DD-title-slug.md`
Example: `_posts/2026-02-18-ai-search-organic-traffic.md`

Jekyll will not process files that do not follow this naming pattern.

### Image Embedding
```markdown
![Marketing team analyzing search data](/assets/images/search-dashboard.jpg)
```

Images live in `assets/images/` or `images/` depending on project convention.

### Chart / SVG Embedding

Jekyll uses the kramdown renderer, which passes through raw HTML:

```markdown
<figure>
  <svg viewBox="0 0 560 380" role="img" aria-label="CTR decline chart">
    <!-- SVG content with standard HTML attributes -->
  </svg>
  <figcaption>Source: Seer Interactive (2025)</figcaption>
</figure>
```

No special configuration needed -- kramdown does not strip HTML by default.

### Liquid Templates

Access page variables in layouts:
```liquid
<h1>{{ page.title }}</h1>
<time datetime="{{ page.date | date_to_xmlschema }}">
  {{ page.date | date: "%B %d, %Y" }}
</time>

{% if page.last_modified_at %}
  <meta property="article:modified_time"
        content="{{ page.last_modified_at | date_to_xmlschema }}">
{% endif %}
```

Loop through posts:
```liquid
{% for post in site.posts limit:10 %}
  <article>
    <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
    <p>{{ post.description }}</p>
  </article>
{% endfor %}
```

### Layout Hierarchy
```
_layouts/
  default.html    <-- Base layout (HTML shell, head, nav, footer)
  post.html       <-- Blog post layout (extends default)
  page.html       <-- Static page layout (extends default)
```

### Math Support via MathJax
```yaml
# _config.yml
markdown: kramdown
kramdown:
  math_engine: mathjax
```

Usage in posts:
```markdown
The formula is $$ E = mc^2 $$
```

### Key Configuration Notes
- `_config.yml` is the central configuration file
- Collections: define custom collections beyond posts in `_config.yml`
- Plugins: `jekyll-seo-tag` for automatic OG/Twitter meta tags
- `jekyll-sitemap` for sitemap generation
- `jekyll-last-modified-at` for automatic `last_modified_at` from git
- Build with `bundle exec jekyll build` (produces `_site/` directory)
- JSON-LD: use `jekyll-seo-tag` or manually include in `_includes/head.html`

---

## WordPress

### Gutenberg Blocks (Modern)

Gutenberg uses block-based editing. Key blocks for blog content:

| Block | Purpose | Notes |
|-------|---------|-------|
| Paragraph | Body text | Each paragraph auto-wraps in `<p>` |
| Heading | H2-H6 | Set level in block toolbar |
| Image | Photos | Set alt text, caption, link in sidebar |
| Custom HTML | SVG charts | Paste raw SVG in HTML block |
| List | Bullets/numbers | For FAQ answers, step lists |
| Quote | Blockquotes | For expert quotes with attribution |
| Table | Comparison tables | For feature/pricing comparisons |
| Group | Wrappers | Group blocks for styling |

### Classic Editor (HTML)
```html
<h2>How Does AI Search Impact Organic Traffic?</h2>

<p>Organic CTR declined 61% with AI Overviews
(<a href="https://seerinteractive.com">Seer Interactive</a>, 2025).
This means brands must optimize for AI citation to maintain visibility
in a landscape where zero-click searches dominate.</p>

<figure>
  <img src="https://cdn.pixabay.com/photo/.../image.jpg"
       alt="Marketing dashboard showing AI search traffic metrics"
       width="1200" height="630" loading="lazy">
  <figcaption>Photo via Pixabay</figcaption>
</figure>
```

### Image Embedding
Upload via Media Library, then insert. Set these fields:
- **Alt text**: Descriptive sentence with topic keywords
- **Title**: Short descriptive title
- **Caption**: Optional, shows below image
- **Featured Image**: Set in post sidebar (used as OG image and blog listing)

### Chart / SVG Embedding
Use the Custom HTML block:
```html
<figure class="wp-block-html chart-container">
  <svg viewBox="0 0 560 380" role="img" aria-label="Chart description">
    <!-- Standard SVG with HTML attributes -->
  </svg>
</figure>
```

### Yoast SEO / RankMath Integration

| Field | Where | Purpose |
|-------|-------|---------|
| Focus keyword | SEO panel below editor | Primary target keyword |
| SEO title | SEO panel | Title tag (if different from H1) |
| Meta description | SEO panel | 150-160 chars, fact-dense |
| Canonical URL | SEO panel → Advanced | Prevents duplicate content |
| OG image | Social tab in SEO panel | Social sharing preview |
| OG title | Social tab | Title for social shares |
| OG description | Social tab | Description for social shares |

### Custom Fields for Structured Data
Use ACF (Advanced Custom Fields) or native custom fields:
- `last_updated` -- for dateModified in schema
- `author_bio` -- for E-E-A-T author section
- `faq_items` -- for FAQ schema generation

### Featured Image
Set via the "Featured Image" panel in the post editor sidebar. This image
serves as both the blog listing thumbnail and the OG image for social sharing.
Recommended size: 1200x630px.

### Excerpt Field
The Excerpt field (in post sidebar) generates the meta description if Yoast/
RankMath meta description is empty. Keep it to 150-160 characters, fact-dense,
with at least one statistic.

### Key Configuration Notes
- Permalink structure: Settings > Permalinks > Post name (`/%postname%/`)
- REST API: `wp-json/wp/v2/posts` for programmatic publishing
- Schema: Yoast/RankMath auto-generates BlogPosting schema
- Caching: use WP Super Cache or W3 Total Cache for TTFB < 200ms
- Security: keep WordPress, themes, and plugins updated
- robots.txt: accessible at `/robots.txt`, configure via Yoast

---

## Ghost

### Content Formats
Ghost stores content internally as Mobiledoc (JSON) but accepts HTML input
for custom cards and the API.

### Ghost Admin API (Programmatic Publishing)
```javascript
const GhostAdminAPI = require('@tryghost/admin-api')

const api = new GhostAdminAPI({
  url: 'https://your-blog.ghost.io',
  key: 'ADMIN_API_KEY',
  version: 'v5.0'
})

api.posts.add({
  title: 'How Does AI Search Impact Organic Traffic in 2026?',
  html: '<p>Organic CTR declined 61%...</p>',
  status: 'draft',
  tags: [{ name: 'AI Search' }, { name: 'SEO' }],
  meta_title: 'AI Search Impact on Organic Traffic (2026 Data)',
  meta_description: 'Organic CTR declined 61% with AI Overviews...',
  og_image: 'https://cdn.pixabay.com/photo/.../cover.jpg',
  og_title: 'AI Search Impact on Organic Traffic',
  og_description: 'New data reveals how AI search reshapes organic visibility.',
  canonical_url: 'https://your-blog.com/ai-search-organic-traffic',
  feature_image: 'https://cdn.pixabay.com/photo/.../cover.jpg',
  feature_image_alt: 'Marketing dashboard showing AI search metrics',
})
```

### Image Embedding
In the Ghost editor, use the Image card. For HTML content:
```html
<figure class="kg-card kg-image-card">
  <img class="kg-image"
       src="https://cdn.pixabay.com/photo/.../image.jpg"
       alt="Marketing team analyzing AI search data"
       loading="lazy">
  <figcaption>Photo via Pixabay</figcaption>
</figure>
```

### Chart / SVG Embedding
Use the HTML card in the Ghost editor to paste raw SVG:
```html
<figure class="kg-card kg-html-card">
  <svg viewBox="0 0 560 380" role="img" aria-label="Chart description">
    <!-- Standard SVG -->
  </svg>
</figure>
```

### Built-in SEO Fields

| Field | Location | Purpose |
|-------|----------|---------|
| Meta title | Post settings > Meta data | Title tag override |
| Meta description | Post settings > Meta data | 150-160 chars |
| Canonical URL | Post settings > Meta data | Duplicate prevention |
| OG image | Post settings > Twitter/Facebook | Social preview image |
| OG title | Post settings > Twitter/Facebook | Social preview title |
| Feature image | Post header | Hero + OG fallback |
| Feature image alt | Post header | Accessibility |
| Excerpt | Post settings > Excerpt | Newsletter + listing text |

### Custom Theme Considerations
Ghost themes use Handlebars templates:
```handlebars
{{! post.hbs }}
<article class="post">
  <h1>{{title}}</h1>
  <time datetime="{{date format='YYYY-MM-DD'}}">{{date format="MMMM DD, YYYY"}}</time>
  {{#if updated_at}}
    <time datetime="{{updated_at format='YYYY-MM-DD'}}">
      Updated: {{updated_at format="MMMM DD, YYYY"}}
    </time>
  {{/if}}
  <div class="post-content">{{content}}</div>
</article>
```

### Dynamic Routing
Configure content organization in `routes.yaml`:
```yaml
routes:
  /about/: about

collections:
  /blog/:
    permalink: /blog/{slug}/
    filter: tag:-hash-podcast
    template: blog

taxonomies:
  tag: /tag/{slug}/
  author: /author/{slug}/
```

### Key Configuration Notes
- Ghost handles structured data (JSON-LD) automatically
- Default output is server-rendered HTML -- AI crawlers can access content
- Newsletters: Ghost has built-in email sending for subscriber lists
- Membership: tiers and paid content built-in
- Themes: install via Ghost Admin > Settings > Design
- Content API: for headless CMS setups (read-only, public content)

---

## 11ty (Eleventy)

### Frontmatter Format
```yaml
---
title: "How Does AI Search Impact Organic Traffic in 2026?"
description: "Organic CTR declined 61% with AI Overviews. Here's how to optimize."
date: 2026-02-18
lastUpdated: 2026-02-18
author: "Author Name"
tags:
  - ai-search
  - seo
  - posts
layout: post.njk
coverImage: "/images/ai-search-cover.jpg"
coverImageAlt: "Marketing dashboard showing AI search metrics"
---
```

### Template Languages
11ty supports Nunjucks (`.njk`), Liquid (`.liquid`), Handlebars (`.hbs`),
JavaScript (`.11ty.js`), and more. Nunjucks is the most common choice.

### Data Cascade
11ty merges data from multiple sources (highest to lowest priority):
1. **File data** -- frontmatter in the content file
2. **Directory data** -- `blog.json` in the content directory
3. **Global data** -- files in `_data/` directory

```json
// blog/blog.json (applies to all files in blog/)
{
  "layout": "post.njk",
  "tags": ["posts"],
  "permalink": "/blog/{{ page.fileSlug }}/"
}
```

### Image Embedding
```markdown
![Marketing team analyzing search data](/images/search-dashboard.jpg)
```

For optimized images, use `eleventy-img` plugin:
```njk
{% image "src/images/search-dashboard.jpg", "Marketing team analyzing search data" %}
```

### Chart / SVG Embedding
Raw HTML/SVG works directly in markdown files. 11ty passes through HTML
without stripping.

```markdown
<figure>
  <svg viewBox="0 0 560 380" role="img" aria-label="CTR decline chart">
    <!-- SVG content -->
  </svg>
  <figcaption>Source: Seer Interactive (2025)</figcaption>
</figure>
```

### Computed Data for Dates and URLs
```javascript
// blog/blog.11tydata.js
module.exports = {
  eleventyComputed: {
    permalink: (data) => `/blog/${data.page.fileSlug}/`,
    lastUpdatedDisplay: (data) => {
      const date = data.lastUpdated || data.page.date
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    }
  }
}
```

### Passthrough File Copy
```javascript
// .eleventy.js
module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/images")
  eleventyConfig.addPassthroughCopy("src/svg")
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "/" })
}
```

### Key Configuration Notes
- Static output by default -- ideal for AI crawlers
- No build-step JS unless explicitly added (fast pages)
- Collections: use `tags` in frontmatter to group content
- Filters: add custom Nunjucks filters in `.eleventy.js` for date formatting
- Pagination: built-in for tag pages and archive pages
- JSON-LD: inject via layout template using frontmatter data
- Sitemap: use `eleventy-plugin-sitemap` or generate manually

---

## Gatsby

### Frontmatter Format
```yaml
---
title: "How Does AI Search Impact Organic Traffic in 2026?"
description: "Organic CTR declined 61% with AI Overviews. Here's how to optimize."
date: "2026-02-18"
lastUpdated: "2026-02-18"
author: "Author Name"
tags: ["ai-search", "seo", "traffic"]
slug: "ai-search-organic-traffic"
featuredImage: "../images/ai-search-cover.jpg"
featuredImageAlt: "Marketing dashboard showing AI search metrics"
---
```

### MDX Support
```javascript
// gatsby-config.js
module.exports = {
  plugins: [
    {
      resolve: 'gatsby-plugin-mdx',
      options: {
        extensions: ['.mdx', '.md'],
        gatsbyRemarkPlugins: [
          'gatsby-remark-images',
          'gatsby-remark-prismjs',
        ],
      },
    },
  ],
}
```

### Image Embedding
```mdx
![Marketing team analyzing search data](../images/search-dashboard.jpg)
```

Using `gatsby-plugin-image`:
```jsx
import { GatsbyImage, getImage } from 'gatsby-plugin-image'

const BlogPost = ({ data }) => {
  const image = getImage(data.mdx.frontmatter.featuredImage)
  return (
    <GatsbyImage
      image={image}
      alt={data.mdx.frontmatter.featuredImageAlt}
    />
  )
}
```

### Chart / SVG Embedding
In MDX files, use JSX-compatible SVG (same camelCase rules as Next.js):
```mdx
<figure style={{margin: '2.5rem 0', textAlign: 'center'}}>
  <svg viewBox="0 0 560 380" role="img" aria-label="CTR chart">
    <text x="280" y="30" textAnchor="middle" fontSize="16" fill="currentColor">
      Chart Title
    </text>
  </svg>
</figure>
```

### GraphQL Data Layer
```graphql
query BlogPostBySlug($slug: String!) {
  mdx(frontmatter: { slug: { eq: $slug } }) {
    body
    frontmatter {
      title
      description
      date(formatString: "MMMM DD, YYYY")
      lastUpdated(formatString: "MMMM DD, YYYY")
      tags
      featuredImage {
        childImageSharp {
          gatsbyImageData(width: 1200, placeholder: BLURRED)
        }
      }
    }
  }
}
```

### createPages API for Dynamic Routes
```javascript
// gatsby-node.js
exports.createPages = async ({ graphql, actions }) => {
  const { createPage } = actions
  const result = await graphql(`
    query {
      allMdx {
        nodes {
          id
          frontmatter { slug }
          internal { contentFilePath }
        }
      }
    }
  `)

  result.data.allMdx.nodes.forEach((node) => {
    createPage({
      path: `/blog/${node.frontmatter.slug}`,
      component: `${blogPostTemplate}?__contentFilePath=${node.internal.contentFilePath}`,
      context: { id: node.id },
    })
  })
}
```

### Key Configuration Notes
- Static output at build time -- AI crawlers get full HTML
- Use `gatsby-plugin-sitemap` for sitemap generation
- Use `gatsby-plugin-robots-txt` for robots.txt configuration
- `gatsby-plugin-react-helmet` or Gatsby Head API for meta tags
- JSON-LD: use `gatsby-plugin-schema-snapshot` or inline in Head component
- Build can be slow for large sites -- consider incremental builds

---

## HTML / Static

### Semantic HTML5 Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>How Does AI Search Impact Organic Traffic in 2026?</title>
  <meta name="description" content="Organic CTR declined 61% with AI Overviews. Here's how to optimize for both Google rankings and AI citations in 2026.">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="How Does AI Search Impact Organic Traffic in 2026?">
  <meta property="og:description" content="Organic CTR declined 61% with AI Overviews.">
  <meta property="og:image" content="https://cdn.pixabay.com/photo/.../cover.jpg">
  <meta property="og:url" content="https://yourblog.com/ai-search-organic-traffic">
  <meta property="article:published_time" content="2026-02-18T00:00:00Z">
  <meta property="article:modified_time" content="2026-02-18T00:00:00Z">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="How Does AI Search Impact Organic Traffic in 2026?">
  <meta name="twitter:description" content="Organic CTR declined 61% with AI Overviews.">
  <meta name="twitter:image" content="https://cdn.pixabay.com/photo/.../cover.jpg">

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "How Does AI Search Impact Organic Traffic in 2026?",
    "description": "Organic CTR declined 61% with AI Overviews.",
    "image": "https://cdn.pixabay.com/photo/.../cover.jpg",
    "datePublished": "2026-02-18",
    "dateModified": "2026-02-18",
    "author": {
      "@type": "Person",
      "name": "Author Name",
      "url": "https://yourblog.com/about"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Blog Name",
      "logo": {
        "@type": "ImageObject",
        "url": "https://yourblog.com/logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "https://yourblog.com/ai-search-organic-traffic"
    }
  }
  </script>
</head>
<body>
  <nav aria-label="Main navigation">
    <!-- Navigation -->
  </nav>

  <article>
    <header>
      <h1>How Does AI Search Impact Organic Traffic in 2026?</h1>
      <time datetime="2026-02-18">February 18, 2026</time>
    </header>

    <section>
      <h2>What Is the Impact of AI Overviews on Click-Through Rates?</h2>
      <p>Organic CTR declined 61% with AI Overviews, dropping from 1.76% to
      0.61% (<a href="https://seerinteractive.com">Seer Interactive</a>, 2025).
      This represents the most significant shift in search behavior since
      mobile-first indexing.</p>

      <figure>
        <img src="https://cdn.pixabay.com/photo/.../image.jpg"
             alt="Marketing dashboard showing declining organic CTR metrics"
             width="1200" height="630" loading="lazy">
        <figcaption>Photo via Pixabay</figcaption>
      </figure>
    </section>

    <aside aria-label="Frequently Asked Questions">
      <h2>Frequently Asked Questions</h2>
      <!-- FAQ content -->
    </aside>
  </article>

  <footer>
    <!-- Footer -->
  </footer>
</body>
</html>
```

### Image Embedding
```html
<figure>
  <img src="https://cdn.pixabay.com/photo/.../image.jpg"
       alt="Descriptive sentence including topic keywords naturally"
       width="1200" height="630"
       loading="lazy"
       decoding="async">
  <figcaption>Photo via Pixabay</figcaption>
</figure>
```

### Chart / SVG Embedding
```html
<figure>
  <svg viewBox="0 0 560 380"
       style="max-width: 100%; height: auto; font-family: 'Inter', system-ui, sans-serif"
       role="img"
       aria-label="Chart showing 61% CTR decline">
    <title>Organic CTR Decline with AI Overviews</title>
    <desc>Bar chart comparing 1.76% organic CTR before to 0.61% after AI Overviews</desc>
    <!-- SVG content with standard HTML attributes -->
  </svg>
  <figcaption>Source: Seer Interactive (2025)</figcaption>
</figure>
```

### Inline JSON-LD Schema

Place in `<head>` for BlogPosting:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "Title",
  "datePublished": "2026-02-18",
  "dateModified": "2026-02-18",
  "author": { "@type": "Person", "name": "Author" }
}
</script>
```

Place in `<head>` for FAQPage:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is the question?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The 40-60 word answer with a specific statistic and source."
      }
    }
  ]
}
</script>
```

### Key Configuration Notes
- No framework dependency -- works with any hosting
- AI crawlers can read static HTML without JS execution
- Manually manage OG/Twitter meta tags in `<head>`
- Use `loading="lazy"` and `decoding="async"` on images for performance
- Schema must be in HTML source, not injected via JavaScript
- Generate sitemap.xml manually or with a build script
- Use `<link rel="canonical" href="...">` to prevent duplicate content
- Place CSS in `<head>` (inline critical CSS for fast TTFB)

---

## Platform Selection Quick Reference

| Priority | Criterion | Recommendation |
|----------|-----------|---------------|
| AI crawlers | JS execution required? | Use SSG/SSR (Next.js, Astro, Hugo, 11ty, Gatsby) |
| Speed | TTFB < 200ms | Hugo (fastest builds), 11ty, Astro, static HTML |
| MDX/React | Component-driven content | Next.js, Gatsby |
| Simplicity | Minimal tooling | Hugo, Jekyll, 11ty, static HTML |
| Non-technical users | Visual editor | WordPress, Ghost |
| Headless CMS | API-first | Ghost (Content API), WordPress (REST API) |

### Universal Requirements (All Platforms)

1. **Static or server-rendered HTML** -- AI crawlers cannot execute JavaScript
2. **TTFB under 200ms** -- AI crawlers timeout at 3-5 seconds
3. **Schema in HTML source** -- not injected via client-side JS
4. **robots.txt allowing AI crawlers** -- GPTBot, ClaudeBot, PerplexityBot
5. **Sitemap at /sitemap.xml** -- helps all crawlers discover content
6. **OG meta tags** -- required for social sharing previews
7. **dateModified in schema** -- critical for freshness signals
