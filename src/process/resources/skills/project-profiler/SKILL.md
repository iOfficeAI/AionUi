---
name: project-profiler
description: Interpret the output of team_analyze_project and produce a human-readable project profile report with complexity assessment, recommended agent lineup, and suggested skill configuration. Use after calling team_analyze_project to present results to the user.
description_zh: 解读 team_analyze_project 的输出，生成包含复杂度评估、推荐 Agent 配置和建议技能清单的可读报告。
---

# Project Profiler

Interpret a project analysis result and produce a clear, actionable report.

## Input

You will receive a JSON object from `team_analyze_project` with this shape:

```json
{
  "complexity": "low | medium | high",
  "type": "frontend | backend | fullstack | data | devops | mixed",
  "fileStats": { "total": 0, "byExtension": {} },
  "detectedStack": ["react", "typescript", "nestjs", ...],
  "recommendedAgents": [
    { "role": "Frontend Developer", "preset": "builtin-frontend-dev", "reason": "..." }
  ],
  "recommendedSkills": ["requirements-clarifier", "reverse-engineer-prd", ...]
}
```

## Output Format

```markdown
# Project Profile

## Summary

**Complexity:** 🟢 Low | 🟡 Medium | 🔴 High
**Type:** <project type>
**Tech Stack:** <comma-separated detected technologies>

## Complexity Assessment

<2-3 sentences explaining why this complexity level was assigned — reference file count, stack diversity, and detected frameworks>

## Recommended Team Lineup

| Role        | Preset      | Why               |
| ----------- | ----------- | ----------------- |
| <role name> | <preset id> | <one-line reason> |

> **How to set up:** Ask the team leader to spawn these agents using the presets above.

## Recommended Skills

Enable these skills for the agents working on this project:

| Skill        | Purpose                |
| ------------ | ---------------------- |
| <skill name> | <one-line description> |

> **How to enable:** Go to Settings → Skills Hub and toggle these on, or add them to `.aicore/skills.json` in your workspace.

## Next Steps

1. <first concrete action — e.g. "Ask the leader to spawn the recommended agents">
2. <second action — e.g. "Review and confirm the tech profile in .aicore/tech-profile.yaml">
3. <third action if needed>
```

## Rules

- Map complexity to emoji: low → 🟢, medium → 🟡, high → 🔴
- Explain complexity in plain language — avoid raw numbers unless they are surprising
- Only recommend agents that match the detected project type (don't recommend a backend dev for a purely frontend project)
- If `recommendedAgents` is empty, say "No specialized agents needed — a general-purpose agent can handle this project"
- Keep the report concise — a reader should finish it in under 60 seconds
