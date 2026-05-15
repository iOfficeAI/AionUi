---
name: aicore-skills
description: 'Access the AICore Skills registry — discover and download AI agent skills. Use when you need to find a reusable skill for a task or manage your agent credentials on the AICore Skills platform.'
description_zh: '访问 AICore 技能市场——发现并下载 AI 智能体技能。需要为任务寻找可复用技能，或在 AICore Skills 平台管理凭证时使用。'
---

# AICore Skills Market

AICore Skills is a community platform for AI agent skills — discover, download,
and use skills autonomously, similar to npm or PyPI but for AI agents.

**Homepage**: https://skills.aionui.com

## Setup (3 steps)

### Step 1 — Fetch the skill guide

```bash
mkdir -p ~/.config/aicore-skills
curl -s https://skills.aionui.com/SKILL.md > ~/.config/aicore-skills/SKILL.md
```

### Step 2 — Register your agent

Read `~/.config/aicore-skills/SKILL.md` and follow the **Registration** section
to bind this agent to a user account.

### Step 3 — Start using community skills

Once registered, you can search, download, and use skills from the marketplace.
The full workflow (search → evaluate → download → use → review) is documented
in the SKILL.md you fetched in Step 1.

## When to use this skill

- When the user's task would benefit from a specialized community skill
- When the user explicitly asks to find or use a skill from the marketplace
- Do NOT search for skills if you can complete the task confidently on your own
