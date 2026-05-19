---
name: requirements-clarifier
description: Analyze requirements documents to identify ambiguities and generate a structured clarification report with prioritized questions. Use when users provide requirement docs, user stories, or feature specs that need clarification before development begins.
description_zh: 分析需求文档，识别模糊点，生成结构化澄清报告和优先级问题清单。在开发开始前用于需求澄清。
---

# Requirements Clarifier

Analyze a requirements document and produce a structured clarification report.

## Process

1. Read the full requirements document carefully
2. Identify ambiguities across six categories (see below)
3. Generate prioritized clarification questions
4. Output a structured Markdown report

## Ambiguity Categories

| Code  | Category              | Examples                                          |
| ----- | --------------------- | ------------------------------------------------- |
| SCOPE | Scope & boundaries    | What's in/out, which users, which platforms       |
| LOGIC | Business logic        | Edge cases, conditional flows, error handling     |
| DATA  | Data & state          | Formats, validation rules, storage, ownership     |
| UI    | UI & interaction      | Layout, responsive behavior, empty/loading states |
| PERF  | Performance           | Latency targets, concurrency, data volume limits  |
| SEC   | Security & compliance | Auth requirements, data sensitivity, audit needs  |

## Question Priority Levels

- **MUST** — blocks implementation; cannot proceed without an answer
- **SHOULD** — important for correctness; likely causes rework if skipped
- **NICE** — improves clarity; can be deferred to later

## Output Format

Produce the report in this exact structure:

```markdown
# Requirements Clarification Report

## Summary

<2-3 sentence summary of what the requirements describe>

## Ambiguities Found

### [SCOPE] <short title>

**Priority:** MUST | SHOULD | NICE
**Context:** <quote or paraphrase the relevant requirement text>
**Question:** <specific question to ask the stakeholder>
**Assumption if skipped:** <what you will assume if no answer is given>

### [LOGIC] <short title>

...

## Clarification Questions (Prioritized)

### MUST Answer Before Development

1. [SCOPE] <question>
2. [LOGIC] <question>

### SHOULD Answer Soon

1. [DATA] <question>

### NICE to Have

1. [UI] <question>

## Working Assumptions

If clarification is not received, implementation will proceed with these assumptions:

- <assumption 1>
- <assumption 2>
```

## Rules

- Tag every ambiguity with its category code in brackets: `[SCOPE]`, `[LOGIC]`, etc.
- Number ambiguities sequentially: `[AMBI-1]`, `[AMBI-2]`, ... in the Ambiguities section
- Keep questions specific and answerable — avoid vague questions like "Can you clarify this?"
- Include a concrete assumption for every MUST question so development can unblock if needed
- If the document is clear and complete, output: `No significant ambiguities found. Requirements are ready for implementation.`
