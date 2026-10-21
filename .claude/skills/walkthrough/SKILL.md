---
name: walkthrough
description: Guidelines and standard format for generating task completion walkthroughs upon finishing a task or user request.
---

# Walkthrough Skill

Generate a structured, clean, and organized **Walkthrough** summary when completing a user task or execution.

AionUi parses the walkthrough into an interactive **WalkthroughCard** with quick copy, section badges, collapsibles, and syntax-highlighted markdown.

## When to Use

Deliver a Walkthrough at the end of a non-trivial execution, such as:

- Implementing a new feature
- Refactoring or restructuring code
- Fixing complex bugs
- Setting up integrations, models, or configurations

## Format Specification

Wrap the walkthrough in `[WALKTHROUGH]...[/WALKTHROUGH]` tags:

```markdown
[WALKTHROUGH]

# Walkthrough: <Title of the Task or Feature>

<Brief overview / summary paragraph explaining what was achieved.>

## 1. Delivered / What Was Delivered (O que foi Entregue)

- Summary table or bullet points of files modified/created and components delivered.

## 2. How It Works (Como Funciona)

- Technical explanation, architecture, data flow, or mermaid diagram.

## 3. How to Use & Verify (Como Usar / Como Testar)

- Step-by-step instructions or commands for the user to run, test, and verify the changes.

## 4. Things to Watch Out For & Tips (O que Prestar Atenção & Dicas)

- Important caveats, warnings, edge cases, configuration requirements, or follow-ups.
  [/WALKTHROUGH]
```

## Section Types Recognized by AionUi

The parser automatically categorizes headings into semantic sections with custom theme icons:

| Section Type     | Common Headings (English, Portuguese, Chinese)                                                            | Icon        |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ----------- |
| **`delivered`**  | "Delivered", "What was delivered", "Changes Made", "O que foi Entregue", "Alterações", "交付内容"         | Green check |
| **`howItWorks`** | "How It Works", "Architecture", "Como Funciona", "Funcionamento", "Arquitetura", "实现原理"               | Blue brain  |
| **`usage`**      | "How to Use", "Usage", "How to Test", "Testing", "Verification", "Como Usar", "Como Testar", "使用与验证" | Orange play |
| **`notes`**      | "Notes", "Things to Watch Out For", "Caveats", "Tips", "O que Prestar Atenção", "Dicas", "注意事项"       | Red warning |
| **`custom`**     | Any other custom section title (e.g. "Next Steps", "PR Status")                                           | Neutral doc |
