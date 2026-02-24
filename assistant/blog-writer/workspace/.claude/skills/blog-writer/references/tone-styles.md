# Writing Tone & Style Reference

## Tone Profiles

Choose ONE tone as the foundation. Do not blend tones — each is a complete voice system.

### Technical Authority
**Best for:** Engineering blogs, developer tools, architecture deep-dives

**Characteristics:**
- Precise language, correct terminology
- Code examples and technical details
- Confident assertions backed by data
- Minimal metaphors — clarity over creativity
- "We benchmarked this against three alternatives. Here's what we found."

**Avoid:** Overly casual language, vague generalizations, marketing superlatives

### Conversational Expert
**Best for:** Product blogs, industry commentary, thought leadership

**Characteristics:**
- Knowledgeable but approachable
- Uses "you" and "we" naturally
- Shares opinions and takes positions
- Mixes data with anecdote
- "Here's the thing nobody talks about when they recommend microservices..."

**Avoid:** Academic formality, hedging language, being preachy

### Narrative Storyteller
**Best for:** Case studies, founder stories, lessons learned, retrospectives

**Characteristics:**
- Opens with a scene or moment
- Uses chronological or thematic structure
- Characters, tension, resolution
- Data embedded in story, not presented separately
- "It was 2 AM when the Slack notification came in. Our database was on fire."

**Avoid:** Dry enumeration, generic examples, missing the payoff

### Practical Guide
**Best for:** Tutorials, how-to guides, implementation walkthroughs

**Characteristics:**
- Clear sequential steps
- Prerequisites stated upfront
- Code blocks with explanations
- Expected outcomes at each step
- "Before you start, you'll need Node 20+ and a PostgreSQL instance."

**Avoid:** Theoretical tangents, ambiguous instructions, missing steps

### Analytical Observer
**Best for:** Trend analysis, market commentary, competitive analysis

**Characteristics:**
- Data-first, opinion-second
- Comparative frameworks and matrices
- Balanced perspectives before taking a position
- Charts and tables for comparison
- "The data tells an interesting story. Let's look at three signals."

**Avoid:** Premature conclusions, cherry-picked data, missing counter-arguments

## Voice Calibration

### Formality Spectrum

```
Academic ←──────────────────────────────────→ Casual
  │                                              │
  Research paper    Industry blog    Dev blog    Twitter thread
```

Most blog posts land in the middle: professional but human. Not a research paper, not a tweet.

### Confidence Spectrum

```
Hedging ←──────────────────────────────────→ Declarative
  │                                              │
  "It might be..."  "Evidence suggests..."  "This is how it works."
```

Match confidence to evidence strength:
- Strong data → declarative: "Teams using X ship 40% faster."
- Weak data → qualified: "Early signals suggest X may reduce deploy times."
- Opinion → own it: "I believe X will replace Y within 3 years. Here's why."

### Complexity Spectrum

```
Simplified ←──────────────────────────────→ Advanced
  │                                              │
  Beginner guide   Standard post   Deep dive   Architecture RFC
```

Adjust based on audience:
- Explain jargon for general audiences
- Use jargon freely for specialist audiences
- Never explain what the audience already knows — it's condescending

## Sentence-Level Craft

### Vary sentence length
Short sentences create emphasis. They punch. Longer sentences provide context, nuance, and the kind of flowing rhythm that carries a reader through complex ideas without losing them. Alternate between them.

### Active voice by default
- Yes: "The team shipped the feature in three days."
- No: "The feature was shipped by the team in three days."
- Exception: when the actor is unknown or irrelevant: "The vulnerability was discovered in March."

### Specific over general
- Yes: "Latency dropped from 340ms to 12ms after we switched to edge caching."
- No: "Performance improved significantly after optimization."

### Cut filler
Delete these phrases on sight — they add words but not meaning:
- "It's worth noting that" → just note it
- "At the end of the day" → delete
- "In order to" → "to"
- "The fact that" → delete, restructure
- "It goes without saying" → then don't say it
- "As a matter of fact" → delete
- "Needless to say" → then don't
