---
name: mermaid
description: Render Mermaid diagrams as SVG or ASCII art using beautiful-mermaid. Use when users need to create flowcharts, sequence diagrams, state diagrams, class diagrams, or ER diagrams. Supports both graphical SVG output and terminal-friendly ASCII/Unicode output.
---

# Mermaid Diagram Renderer

Render Mermaid diagrams using `beautiful-mermaid` library. Supports 5 diagram types with dual output modes.

## Quick Start

> Dependencies (`beautiful-mermaid`) auto-install on first run.

### SVG Output (Default)

```bash
# From file
npx tsx scripts/render.ts diagram.mmd --output diagram.svg

# From stdin
echo "graph LR; A-->B-->C" | npx tsx scripts/render.ts --stdin --output flow.svg
```

### ASCII Output (Terminal)

```bash
# ASCII art for terminal display
npx tsx scripts/render.ts diagram.mmd --ascii

# Pipe directly
echo "graph TD; Start-->End" | npx tsx scripts/render.ts --stdin --ascii
```

Output example:

```
┌───────┐     ┌─────┐
│ Start │────▶│ End │
└───────┘     └─────┘
```

## Supported Diagrams

| Type      | Syntax            | Best For                |
| --------- | ----------------- | ----------------------- |
| Flowchart | `graph TD/LR`     | Processes, decisions    |
| Sequence  | `sequenceDiagram` | API calls, interactions |
| State     | `stateDiagram-v2` | State machines          |
| Class     | `classDiagram`    | OOP design              |
| ER        | `erDiagram`       | Database schemas        |

## Theming (SVG only)

```bash
npx tsx scripts/render.ts diagram.mmd --theme github-dark --output out.svg
```

Use invalid theme name to see available themes list (e.g., `--theme ?`)

## Resources

- `scripts/render.ts` - Main rendering script
- `references/syntax.md` - Mermaid syntax quick reference
