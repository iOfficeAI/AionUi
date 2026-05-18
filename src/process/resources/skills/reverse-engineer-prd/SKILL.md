---
name: reverse-engineer-prd
description: Analyze UI screenshots or design images to produce a structured PRD (Product Requirements Document) with functional modules, user stories, interaction logic, and data entities. Use when a user provides a screenshot or design mockup and wants to extract requirements from it.
description_zh: 分析 UI 截图或设计图，输出包含功能模块、用户故事、交互逻辑和数据实体的结构化 PRD 文档。适合从截图逆向推导产品需求。
---

# Reverse Engineer PRD from UI

Analyze a UI screenshot or design image and produce a complete, structured Product Requirements Document.

## Process

1. Carefully examine every visible element in the image
2. Infer the product's purpose, target users, and core value proposition
3. Decompose into functional modules
4. Write user stories for each module
5. Document interaction logic and state transitions
6. Identify data entities and their relationships
7. Output the full PRD in the structure below

## Output Format

```markdown
# Product Requirements Document
**Source:** [screenshot filename or description]
**Analyzed by:** [your agent name]
**Date:** [today's date]

---

## 1. Product Overview
**Purpose:** <one sentence>
**Target Users:** <who uses this>
**Core Value:** <what problem it solves>

---

## 2. Functional Modules

### Module: <Name>
**Description:** <what this module does>
**Entry Point:** <how users access it>

#### User Stories
| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | [role] | [action] | [benefit] | MUST/SHOULD/NICE |

#### Interaction Logic
- **State:** <state name> → **Trigger:** <user action> → **Result:** <what happens>
- Include: loading states, empty states, error states, success states

#### Edge Cases
- <edge case description and expected behavior>

---

## 3. Data Entities

| Entity | Fields | Relationships |
|--------|--------|---------------|
| <name> | field1 (type), field2 (type) | belongs_to: <other entity> |

---

## 4. Non-Functional Requirements (inferred)
- **Performance:** <any visible loading indicators, pagination, or lazy loading clues>
- **Accessibility:** <visible accessibility considerations>
- **Responsive:** <evidence of responsive design>

---

## 5. Open Questions
Items that could not be determined from the screenshot alone:
1. <question about unclear behavior>
2. <question about data source>
```

## Rules

- Only describe what is **visible or clearly implied** by the screenshot — do not invent features
- For anything unclear, add it to "Open Questions" rather than guessing
- User story IDs must be sequential (US-001, US-002, ...)
- Priority levels: **MUST** (core flow), **SHOULD** (important but not blocking), **NICE** (enhancement)
- If multiple screens are provided, treat them as a flow and document transitions between screens
- Output in the same language as any text visible in the UI (Chinese UI → Chinese PRD, English UI → English PRD)
