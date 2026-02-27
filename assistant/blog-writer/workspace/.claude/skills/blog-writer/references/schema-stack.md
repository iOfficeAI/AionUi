# Complete Blog Schema Reference

## Why Schema Matters

72% of first-page results use structured data markup. Pages using 3+ schema
types have approximately 13% higher likelihood of AI citation. Schema must
appear in HTML source -- not injected via JavaScript -- because most AI crawlers
do not execute JS.

---

## BlogPosting Schema

The primary schema for every blog post. Embeds author, publisher, and article
metadata in a single structured entity.

### Full Property Reference

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `@context` | Yes | URL | Always `"https://schema.org"` |
| `@type` | Yes | String | Always `"BlogPosting"` |
| `@id` | Yes | URI | Stable identifier: `{siteUrl}/blog/{slug}#article` |
| `headline` | Yes | String | Post title, max 110 characters |
| `description` | Yes | String | Meta description, 150-160 characters |
| `datePublished` | Yes | ISO 8601 | Original publish date |
| `dateModified` | Yes | ISO 8601 | Last content update date |
| `author` | Yes | Person | Author entity (use @id reference) |
| `publisher` | Yes | Organization | Site/company entity (use @id reference) |
| `image` | Yes | ImageObject or URL | Featured image, min 1200x630px |
| `mainEntityOfPage` | Yes | WebPage | The page URL |
| `wordCount` | Recommended | Integer | Total word count of article body |
| `articleSection` | Recommended | String | Category/topic (e.g., "SEO") |
| `keywords` | Recommended | String or Array | Comma-separated or array of keywords |
| `inLanguage` | Recommended | String | BCP 47 language code (e.g., "en-US") |
| `url` | Recommended | URL | Canonical URL of the post |
| `thumbnailUrl` | Optional | URL | Smaller preview image |
| `articleBody` | Optional | String | Full text (usually omitted for size) |

### Complete BlogPosting Example

```json
{
  "@type": "BlogPosting",
  "@id": "https://example.com/blog/technical-seo-guide#article",
  "headline": "Complete Guide to Technical SEO in 2026",
  "description": "Technical SEO has evolved beyond Core Web Vitals. 72% of top-ranking pages now use structured data. Here's how to optimize your site for both traditional search and AI systems.",
  "datePublished": "2026-01-15T08:00:00Z",
  "dateModified": "2026-02-10T14:30:00Z",
  "author": {
    "@id": "https://example.com/author/sarah-chen#person"
  },
  "publisher": {
    "@id": "https://example.com#organization"
  },
  "image": {
    "@type": "ImageObject",
    "url": "https://example.com/images/blog/technical-seo-guide.jpg",
    "width": 1200,
    "height": 630,
    "caption": "Technical SEO optimization workflow diagram"
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://example.com/blog/technical-seo-guide"
  },
  "wordCount": 3200,
  "articleSection": "SEO",
  "keywords": ["technical SEO", "structured data", "Core Web Vitals", "schema markup"],
  "inLanguage": "en-US"
}
```

---

## Person Schema

Used for author attribution in BlogPosting and on dedicated author pages.

### Full Property Reference

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `@type` | Yes | String | Always `"Person"` |
| `@id` | Yes | URI | Stable: `{siteUrl}/author/{slug}#person` |
| `name` | Yes | String | Full name |
| `jobTitle` | Yes | String | Current professional title |
| `url` | Yes | URL | Author page URL |
| `image` | Yes | URL | Professional headshot |
| `sameAs` | Yes | Array | Social profile URLs (LinkedIn, Twitter, GitHub, personal site) |
| `worksFor` | Recommended | Organization | Current employer |
| `alumniOf` | Optional | CollegeOrUniversity | Educational background |
| `description` | Recommended | String | Brief professional bio |
| `knowsAbout` | Optional | Array | Expertise topics |

### Complete Person Example

```json
{
  "@type": "Person",
  "@id": "https://example.com/author/sarah-chen#person",
  "name": "Sarah Chen",
  "jobTitle": "Content Strategist",
  "url": "https://example.com/author/sarah-chen",
  "image": "https://example.com/images/authors/sarah-chen.jpg",
  "description": "Content strategist with 8 years of experience in B2B SaaS, specializing in data-driven blog optimization.",
  "sameAs": [
    "https://linkedin.com/in/sarahchen",
    "https://twitter.com/sarahchen",
    "https://sarahchen.com"
  ],
  "worksFor": {
    "@type": "Organization",
    "name": "Example Corp",
    "url": "https://example.com"
  },
  "alumniOf": {
    "@type": "CollegeOrUniversity",
    "name": "UC Berkeley"
  },
  "knowsAbout": ["SEO", "Content Strategy", "B2B SaaS Marketing"]
}
```

---

## Organization Schema

Represents the publishing entity. Referenced by every BlogPosting via the
`publisher` property.

### Full Property Reference

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `@type` | Yes | String | `"Organization"` or `"LocalBusiness"` |
| `@id` | Yes | URI | Stable: `{siteUrl}#organization` |
| `name` | Yes | String | Company/brand name |
| `url` | Yes | URL | Homepage URL |
| `logo` | Yes | ImageObject | Company logo (min 112x112px, max 600px wide) |
| `sameAs` | Recommended | Array | Social media profile URLs |
| `contactPoint` | Recommended | ContactPoint | Support/contact info |
| `description` | Optional | String | Brief company description |
| `founder` | Optional | Person | Company founder |
| `foundingDate` | Optional | Date | When the company was founded |

### Complete Organization Example

```json
{
  "@type": "Organization",
  "@id": "https://example.com#organization",
  "name": "Example Corp",
  "url": "https://example.com",
  "logo": {
    "@type": "ImageObject",
    "url": "https://example.com/images/logo.png",
    "width": 300,
    "height": 60
  },
  "sameAs": [
    "https://twitter.com/examplecorp",
    "https://linkedin.com/company/examplecorp",
    "https://github.com/examplecorp"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "email": "support@example.com",
    "url": "https://example.com/contact"
  }
}
```

---

## BreadcrumbList Schema

Provides navigation hierarchy to search engines and AI systems. Improves
how pages appear in search results and helps crawlers understand site structure.

### ItemListElement Pattern

Each breadcrumb item requires `@type`, `position`, `name`, and `item` (URL).

### Complete BreadcrumbList Example

```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://example.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Blog",
      "item": "https://example.com/blog"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "SEO",
      "item": "https://example.com/blog/category/seo"
    },
    {
      "@type": "ListItem",
      "position": 4,
      "name": "Complete Guide to Technical SEO in 2026",
      "item": "https://example.com/blog/technical-seo-guide"
    }
  ]
}
```

### Rules

- Always start with Home (position 1)
- Include category/topic level if applicable
- Final item is the current page
- Positions must be sequential integers starting at 1
- Every item except the last must have an `item` URL

---

## FAQPage Schema

**Important**: Since August 2023, FAQ rich results are restricted to government
and health authority websites. However, the markup still helps AI systems extract
question-answer pairs for citation. Continue using it for AI visibility.

### Structure

```
FAQPage
  └── mainEntity (array)
        └── Question
              ├── name (the question text)
              └── acceptedAnswer
                    └── Answer
                          └── text (the answer text, 40-60 words)
```

### Complete FAQPage Example

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How does technical SEO affect AI visibility?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Technical SEO directly determines whether AI crawlers can access and extract your content. Since AI crawlers do not execute JavaScript, server-side rendered HTML with structured data markup is essential. Sites with proper technical SEO see up to 340% more AI citations."
      }
    },
    {
      "@type": "Question",
      "name": "What is the most important schema type for blog posts?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "BlogPosting schema is the foundation for blog content. It provides structured metadata about the article including author, dates, and content classification. Combined with Person and Organization schemas, it creates a complete entity graph that search engines and AI systems use to evaluate content authority."
      }
    },
    {
      "@type": "Question",
      "name": "Do AI search engines use schema markup?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. AI search engines like ChatGPT Search, Perplexity, and Google AI Overviews use schema markup to identify authoritative content. Pages with 3 or more schema types have approximately 13% higher likelihood of being cited in AI-generated responses compared to pages without structured data."
      }
    }
  ]
}
```

### Guidelines

- 3-5 FAQ items per page (not excessive)
- Answers should be 40-60 words (concise, extractable)
- Questions should match real user queries (People Also Ask style)
- Do not duplicate content already in the main article body
- Each answer should be self-contained and useful without context

---

## ImageObject Schema

Used within BlogPosting for featured images and inline article images.

### Properties

| Property | Required | Type | Description |
|----------|----------|------|-------------|
| `@type` | Yes | String | `"ImageObject"` |
| `url` | Yes | URL | Full image URL |
| `width` | Yes | Integer | Width in pixels |
| `height` | Yes | Integer | Height in pixels |
| `caption` | Recommended | String | Descriptive caption |
| `creditText` | Recommended | String | Photographer or source credit |
| `copyrightHolder` | Optional | Person/Organization | Rights holder |
| `license` | Optional | URL | Link to license (e.g., Creative Commons) |

### Complete ImageObject Example

```json
{
  "@type": "ImageObject",
  "url": "https://example.com/images/blog/seo-workflow-diagram.jpg",
  "width": 1200,
  "height": 630,
  "caption": "Technical SEO audit workflow showing the 7-step process from crawl analysis to implementation",
  "creditText": "Example Corp Design Team",
  "copyrightHolder": {
    "@type": "Organization",
    "name": "Example Corp"
  }
}
```

---

## Speakable Schema

Optimizes content for voice search and voice assistants (Google Assistant,
Siri, Alexa). Identifies which sections of a page are most suitable for
text-to-speech playback.

### Implementation Options

Use `cssSelector` (preferred) or `xPath` to identify speakable content sections.

### Speakable Example with CSS Selectors

```json
{
  "@type": "WebPage",
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": [
      ".article-summary",
      ".faq-answer",
      "h1",
      ".key-takeaway"
    ]
  }
}
```

### Speakable Example with XPath

```json
{
  "@type": "WebPage",
  "speakable": {
    "@type": "SpeakableSpecification",
    "xPath": [
      "/html/head/title",
      "/html/body//article/p[1]",
      "/html/body//div[@class='key-takeaway']"
    ]
  }
}
```

### Guidelines

- Point to concise, self-contained text sections
- Ideal sections: article summaries, FAQ answers, key takeaways
- Avoid pointing to entire articles (too long for voice)
- Each speakable section should be under 2-3 sentences
- Content must make sense when read aloud without visual context

---

## Stable @id Patterns

Every schema entity needs a stable, unique `@id` that remains consistent across
page loads and site rebuilds. This allows search engines to build entity graphs
and AI systems to deduplicate references.

### Standard Patterns

| Entity | @id Pattern | Example |
|--------|-------------|---------|
| Blog Post | `{siteUrl}/blog/{slug}#article` | `https://example.com/blog/seo-guide#article` |
| Author | `{siteUrl}/author/{slug}#person` | `https://example.com/author/sarah-chen#person` |
| Organization | `{siteUrl}#organization` | `https://example.com#organization` |
| WebPage | `{siteUrl}/blog/{slug}` | `https://example.com/blog/seo-guide` |
| BreadcrumbList | `{siteUrl}/blog/{slug}#breadcrumb` | `https://example.com/blog/seo-guide#breadcrumb` |
| FAQPage | `{siteUrl}/blog/{slug}#faq` | `https://example.com/blog/seo-guide#faq` |

### Rules

- Use the fragment identifier (`#`) to differentiate entities on the same page
- Never use random IDs, timestamps, or build hashes
- Keep patterns consistent across every page on the site
- The URL portion must match the canonical URL
- Use `@id` references to link entities instead of embedding duplicates

### Referencing by @id

Instead of embedding a full Person object in every BlogPosting, reference the
@id and define the Person once in the @graph:

```json
"author": {
  "@id": "https://example.com/author/sarah-chen#person"
}
```

---

## Deprecated Schema Types -- NEVER Use

These types have been deprecated by Google. Using them does not cause penalties
but wastes implementation effort and may trigger rich result validation warnings.

| Type | Deprecated | Date | Notes |
|------|------------|------|-------|
| HowTo | Yes | September 2023 | Rich results removed entirely |
| SpecialAnnouncement | Yes | July 2025 | COVID-era, no longer processed |
| Practice Problem | Yes | -- | Educational, no longer generates rich results |
| Dataset | Yes | -- | For general search; still works in Google Dataset Search |
| Sitelinks Search Box | Yes | -- | Google generates these algorithmically now |
| Q&A | Yes | January 2026 | Replaced by community forum features |

### What to Use Instead

| Deprecated Type | Alternative |
|----------------|-------------|
| HowTo | Use standard BlogPosting with clear step headings (H2/H3) |
| Q&A | Use FAQPage for editorial Q&A; no replacement for community Q&A |
| SpecialAnnouncement | Use standard Article or NewsArticle |

---

## JSON-LD @graph Pattern

Combine all schema entities in a single `<script type="application/ld+json">`
tag using the `@graph` array. This is the recommended approach for pages with
multiple schema types.

### Benefits

- Single script tag instead of multiple scattered blocks
- Entities reference each other via `@id`
- Easier to maintain and validate
- Cleaner HTML source

### Complete @graph Example (Blog Post Page)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://example.com#organization",
      "name": "Example Corp",
      "url": "https://example.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://example.com/images/logo.png",
        "width": 300,
        "height": 60
      },
      "sameAs": [
        "https://twitter.com/examplecorp",
        "https://linkedin.com/company/examplecorp"
      ]
    },
    {
      "@type": "Person",
      "@id": "https://example.com/author/sarah-chen#person",
      "name": "Sarah Chen",
      "jobTitle": "Content Strategist",
      "url": "https://example.com/author/sarah-chen",
      "image": "https://example.com/images/authors/sarah-chen.jpg",
      "sameAs": [
        "https://linkedin.com/in/sarahchen",
        "https://twitter.com/sarahchen"
      ],
      "worksFor": {
        "@id": "https://example.com#organization"
      }
    },
    {
      "@type": "BlogPosting",
      "@id": "https://example.com/blog/technical-seo-guide#article",
      "headline": "Complete Guide to Technical SEO in 2026",
      "description": "Technical SEO has evolved beyond Core Web Vitals. 72% of top-ranking pages now use structured data. Here's how to optimize your site for both traditional search and AI systems.",
      "datePublished": "2026-01-15T08:00:00Z",
      "dateModified": "2026-02-10T14:30:00Z",
      "author": {
        "@id": "https://example.com/author/sarah-chen#person"
      },
      "publisher": {
        "@id": "https://example.com#organization"
      },
      "image": {
        "@type": "ImageObject",
        "url": "https://example.com/images/blog/technical-seo-guide.jpg",
        "width": 1200,
        "height": 630,
        "caption": "Technical SEO optimization workflow diagram"
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "https://example.com/blog/technical-seo-guide"
      },
      "wordCount": 3200,
      "articleSection": "SEO",
      "keywords": ["technical SEO", "structured data", "schema markup"],
      "inLanguage": "en-US"
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://example.com/blog/technical-seo-guide#breadcrumb",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Home",
          "item": "https://example.com"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "Blog",
          "item": "https://example.com/blog"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "Complete Guide to Technical SEO in 2026",
          "item": "https://example.com/blog/technical-seo-guide"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://example.com/blog/technical-seo-guide#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How does technical SEO affect AI visibility?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Technical SEO directly determines whether AI crawlers can access and extract your content. Server-side rendered HTML with structured data is essential since AI crawlers do not execute JavaScript."
          }
        },
        {
          "@type": "Question",
          "name": "What schema types should every blog post have?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Every blog post should have BlogPosting, Person (author), Organization (publisher), and BreadcrumbList schemas at minimum. Adding FAQPage as a fifth type increases AI citation likelihood by approximately 13%."
          }
        }
      ]
    }
  ]
}
```

---

## Schema Validation Checklist

| Check | Pass | Fail |
|-------|------|------|
| JSON-LD in HTML source (not JS-injected) | In `<head>` or `<body>` tag | Loaded via JavaScript |
| Valid JSON syntax | Passes JSON.parse() | Syntax errors |
| @context is `https://schema.org` | Exact match | Missing or HTTP |
| @id uses stable fragment pattern | Consistent across builds | Random or missing |
| dateModified matches actual update | Within 24 hours of last edit | Stale or fabricated |
| Author @id matches author page | Same URI used everywhere | Inconsistent references |
| Image URLs are absolute | Start with `https://` | Relative paths |
| No deprecated types used | None from deprecated list | HowTo, Q&A, etc. |
| 3+ schema types per page | BlogPosting + Person + Org + Breadcrumb minimum | Fewer than 3 |
| Validates in Google Rich Results Test | No errors | Errors present |

### Validation Tools

- **Google Rich Results Test**: https://search.google.com/test/rich-results
- **Schema.org Validator**: https://validator.schema.org
- **JSON-LD Playground**: https://json-ld.org/playground/
