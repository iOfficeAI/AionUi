# Author E-E-A-T Requirements

## Named Author Attribution

Every blog post requires a named human author. Anonymous or generic attribution
destroys trust signals and triggers quality demotion in both traditional search
and AI systems.

### Never Use

| Attribution | Problem |
|-------------|---------|
| "Admin" | No person, no trust |
| "Staff" | Indistinguishable from auto-generated |
| "Team" | No individual accountability |
| "Editor" | Not an author signal |
| No byline | Worst case -- page appears authorless |

### Required

- Full real name (first + last)
- Consistent name slug across the site (e.g., `/author/sarah-chen`)
- Same name used on social profiles linked via `sameAs`
- One author per post (co-authors acceptable with both named)

---

## Author Bio Structure

2-3 sentences. The bio establishes E-E-A-T credentials, not a sales pitch.

### Formula

**Sentence 1**: [Name] is a [role/title] with [N years] experience in [domain].
**Sentence 2**: [Credential, employer, or notable achievement relevant to the topic].
**Sentence 3** (optional): [Specific focus area or what they write about].

### Good Examples

> Sarah Chen is a content strategist with 8 years of experience in B2B SaaS.
> She's led content programs at HubSpot and Drift, specializing in data-driven
> blog optimization.

> Marcus Rivera is a senior frontend engineer at Vercel. He maintains two
> open-source React component libraries with 12K+ combined GitHub stars and
> writes about performance patterns for production applications.

> Dr. Elena Vasquez is a clinical psychologist and researcher at Stanford
> Medical Center. She has published 23 peer-reviewed papers on cognitive
> behavioral therapy and digital mental health interventions.

### Bad Examples (Anti-Patterns)

> "John is passionate about helping businesses grow through innovative digital
> solutions." -- Vague, no credentials, sounds like marketing copy.

> "Our team of experts delivers world-class content marketing services."
> -- Not a person, promotional, no specific expertise.

> "Jane is the CEO of GrowthMax Inc., the leading AI-powered marketing
> platform." -- Sales pitch disguised as bio.

---

## Author Page Requirements

Every named author must have a dedicated author page at `/author/{name-slug}`.

### Page Must Include

| Element | Details |
|---------|---------|
| Full name (H1) | Same name used in bylines |
| Professional photo | Real photo, not avatar or stock |
| Extended bio | 100-200 words with credentials |
| Social links | LinkedIn, Twitter/X, personal site, GitHub (as relevant) |
| Article list | All published posts by this author, newest first |
| ProfilePage schema | JSON-LD with Person entity |

### ProfilePage Schema Example

```json
{
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "mainEntity": {
    "@type": "Person",
    "@id": "https://example.com/author/sarah-chen#person",
    "name": "Sarah Chen",
    "jobTitle": "Content Strategist",
    "description": "Content strategist with 8 years of experience in B2B SaaS, specializing in data-driven blog optimization.",
    "url": "https://example.com/author/sarah-chen",
    "image": "https://example.com/images/authors/sarah-chen.jpg",
    "sameAs": [
      "https://linkedin.com/in/sarahchen",
      "https://twitter.com/sarahchen",
      "https://sarahchen.com"
    ],
    "worksFor": {
      "@type": "Organization",
      "name": "Example Corp"
    },
    "alumniOf": {
      "@type": "CollegeOrUniversity",
      "name": "UC Berkeley"
    }
  }
}
```

---

## Person Schema Properties

The Person schema embedded in BlogPosting and on author pages.

| Property | Required | Description | Example |
|----------|----------|-------------|---------|
| `@type` | Yes | Always "Person" | `"Person"` |
| `@id` | Yes | Stable URI with fragment | `"https://example.com/author/sarah-chen#person"` |
| `name` | Yes | Full name | `"Sarah Chen"` |
| `jobTitle` | Yes | Current role | `"Content Strategist"` |
| `url` | Yes | Author page URL | `"https://example.com/author/sarah-chen"` |
| `image` | Yes | Headshot URL | `"https://example.com/images/authors/sarah-chen.jpg"` |
| `sameAs` | Yes | Array of social/profile URLs | `["https://linkedin.com/in/sarahchen"]` |
| `worksFor` | Recommended | Organization entity | `{"@type": "Organization", "name": "Example Corp"}` |
| `alumniOf` | Optional | Educational institution | `{"@type": "CollegeOrUniversity", "name": "UC Berkeley"}` |
| `description` | Recommended | Brief professional summary | `"B2B SaaS content strategist..."` |
| `knowsAbout` | Optional | Array of expertise topics | `["SEO", "content strategy", "B2B marketing"]` |

### Complete Person JSON-LD

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

## Experience Signal Markers

Phrases that demonstrate first-hand experience. Use these naturally throughout
content to signal genuine expertise to both human readers and quality raters.

### Use These Patterns

| Pattern | When to Use |
|---------|-------------|
| "When we tested..." | Describing an experiment or A/B test |
| "In our experience..." | Sharing practitioner insight |
| "After implementing this for [client]..." | Case study context |
| "Over the past [N] years, I've found..." | Long-term observation |
| "Here's what our data shows..." | Introducing proprietary findings |
| "I've personally seen..." | Direct observation |
| "We ran this experiment across [N] sites..." | Multi-site testing |
| "What surprised us was..." | Counterintuitive findings |
| "The mistake most teams make is..." | Practitioner wisdom |
| "When I worked at [Company]..." | Named employer context |

### Signals to AVOID

| Anti-Pattern | Problem |
|-------------|---------|
| "As an expert in..." | Self-proclaimed authority, no evidence |
| "It is well known that..." | Vague consensus claim |
| "Studies show..." (no citation) | Unsourced authority claim |
| "Everyone agrees..." | Unfalsifiable |
| "Trust us when we say..." | Demands trust rather than earning it |
| Generic "top tips" language | Could have been written by anyone |
| No first-person perspective | Reads like encyclopedia, not experience |
| "In this article, we will..." | Filler, not experience signal |

---

## Trust Indicators

Trust is the most important member of the E-E-A-T family (September 2025 QRG).
Trust encompasses and validates all other signals.

### Site-Level Trust Signals

| Signal | Priority | Implementation |
|--------|----------|----------------|
| Contact page | Critical | Real email, phone, or contact form |
| About page | Critical | Company/author info, mission, team |
| Privacy policy | Critical | Required by law in most jurisdictions |
| Terms of service | High | Legal framework for content use |
| Editorial policy | High | How content is created, reviewed, updated |
| Physical address | High (local) | Required for LocalBusiness, helpful for all |
| Author social profiles | High | Verifiable external presence |
| HTTPS | Critical | Non-negotiable baseline |
| Clear ownership | High | Who publishes this site and why |

### Content-Level Trust Signals

| Signal | Implementation |
|--------|----------------|
| Source attribution | Every claim backed by named source |
| Transparent methodology | How data was collected, sample size |
| Conflict of interest disclosure | Affiliate links, sponsorships |
| Correction/update notes | "Updated [date]: corrected [what]" |
| Expert review | "Reviewed by [Expert Name], [credentials]" |
| Date transparency | Publish date AND last updated date visible |

---

## September 2025 QRG Key Principle

Google's Quality Rater Guidelines (September 2025 revision) established:

> "Trust is the most important member of the E-E-A-T family because untrustworthy
> pages have low E-E-A-T no matter how Experienced, Expert, or Authoritative they
> may seem."

This means a page with brilliant expert content but missing trust signals (no
author attribution, no contact info, no source citations) will score low overall.
Trust is the foundation; the other three factors build on it.

---

## E-E-A-T Scoring Rubric

| Factor | Weight | Key Signals |
|--------|--------|-------------|
| Experience | 20% | First-hand knowledge, original content, case studies, personal testing, process documentation |
| Expertise | 25% | Credentials, technical depth, accuracy, comprehensiveness, professional background |
| Authoritativeness | 25% | Industry recognition, external citations, backlinks, reputation, speaking/publication history |
| Trustworthiness | 30% | Contact info, transparency, security, source attribution, editorial policy, corrections |

### Scoring Flow

Trust is evaluated FIRST. If trust is low, the overall E-E-A-T score is capped
regardless of how strong the other three signals are.

```
Trust Assessment → If Low → Cap at "Low E-E-A-T"
                 → If Adequate → Evaluate E + E + A → Combined Score
```

---

## E-E-A-T Applies to ALL Queries (December 2025)

The December 2025 core update expanded E-E-A-T evaluation beyond YMYL topics
to all competitive queries. This means:

- **Before December 2025**: E-E-A-T scrutiny primarily for health, finance, legal,
  safety topics (Your Money or Your Life).
- **After December 2025**: Any query where multiple pages compete for ranking now
  undergoes E-E-A-T evaluation. This includes technology, marketing, entertainment,
  hobby, and general informational content.

### Practical Impact

A blog post about "best mechanical keyboards" now faces the same E-E-A-T
scrutiny as a post about "best health insurance plans." Author credentials,
first-hand testing, original photography, and trust signals all matter.

---

## E-E-A-T Signals by Content Type

| Content Type | Experience | Expertise | Authoritativeness | Trustworthiness |
|-------------|------------|-----------|-------------------|-----------------|
| **Blog Post** | Author tested/used what they write about; personal anecdotes | Deep topic knowledge; technical accuracy | Links from other sites; author published elsewhere | Sourced claims; editorial policy; contact page |
| **Product Review** | Hands-on testing; original photos/video; owns the product | Technical specs knowledge; comparison framework | Known reviewer; multiple reviews published | Disclosure of affiliates; transparent scoring method |
| **How-To Guide** | Author has done the process; screenshots of their work | Step accuracy; edge cases covered; troubleshooting | Recognized practitioner; cited by others | Tested instructions; warnings included; updated dates |
| **News Article** | Reporter was present or interviewed sources directly | Subject matter knowledge; context provided | Established publication; editorial oversight | Multiple sources; corrections policy; byline |
| **Opinion/Editorial** | Author has relevant professional experience | Informed perspective backed by evidence | Published track record; industry standing | Clearly labeled as opinion; counterpoints acknowledged |

### Minimum Requirements by Content Type

| Content Type | Must Have |
|-------------|-----------|
| Blog Post | Named author, 2+ sourced stats, author bio with credentials |
| Product Review | Original photos, hands-on testing evidence, disclosure |
| How-To Guide | Author's own screenshots, tested steps, last-updated date |
| News Article | Named journalist, 2+ sources, publication editorial policy |
| Opinion/Editorial | Author credentials for topic, "Opinion" label, evidence |
