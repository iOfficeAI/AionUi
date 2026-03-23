---
name: pr
description: |
  Pull request workflow: ensure issue exists, push branch, open PR with issue link.
  Use when: (1) User asks to create a pull request, (2) User says "PR" or "open PR",
  (3) User invokes /oss-pr after committing, (4) After completing a commit workflow.
---

# PR Skill

Structured PR workflow: verify branch → ensure issue exists → push → create PR.

**Announce at start:** "I'm using PR skill to create your pull request."

## Workflow

### Step 0: Branch & Change Verification

```bash
git branch --show-current
git log main..HEAD --oneline
git diff main...HEAD --stat
```

**Rules:**

- If on `main` or `master`: **STOP** — create a new branch first (see commit skill Step 0)
- If no commits ahead of main: **STOP** — nothing to submit
- If branch has uncommitted changes: ask user whether to commit first

### Step 1: Analyze Changes

Review ALL commits between main and HEAD (not just the latest):

```bash
git log main..HEAD --oneline
git diff main...HEAD
```

Summarize:

- What the PR accomplishes (feature, fix, refactor, etc.)
- Which modules/areas are affected
- Any breaking changes or migration notes

### Step 2: Issue Association

**Check if the user mentioned an issue** during the conversation (e.g., "fixes #123", "关联 issue #45", or a GitHub issue URL).

#### Case A: Issue was mentioned

- Note the issue number for PR body (e.g., `Closes #123`)

#### Case B: No issue mentioned

- **Create a new issue** using `gh issue create`:

```bash
gh issue create --title "<concise title>" --body "$(cat <<'EOF'
## Description

<Brief description of what this change addresses>

## Context

<Why this change is needed>
EOF
)"
```

- Use the new issue number for PR body
- **Title format:** same convention as commit messages but in sentence case
- **Label:** add appropriate labels if available (`enhancement`, `bug`, `documentation`, etc.)

### Step 3: Push Branch

```bash
git push -u origin <branch-name>
```

If push fails due to remote rejection, inform user and do NOT force-push.

### Step 4: Create Pull Request

```bash
gh pr create --title "<pr-title>" --body "$(cat <<'EOF'
## Summary

<1-3 bullet points describing the changes>

## Changes

<List of key changes, grouped by area>

## Related Issue

Closes #<issue-number>

## Test Plan

- [ ] <test steps or verification items>
EOF
)"
```

**PR Title rules:**

- Under 70 characters
- Format: `<type>(<scope>): <description>` (same as commit convention)
- If single commit, reuse commit message as title
- If multiple commits, write a summary title

**PR Body rules:**

- `Closes #<number>` to auto-close the linked issue on merge
- Include test plan with actionable checklist
- If there are breaking changes, add a `## Breaking Changes` section

### Step 5: Post-PR

After creating the PR:

1. Output the PR URL to user
2. If the PR includes i18n changes, remind to verify all locales
3. If the PR includes new files in feature areas, remind about coverage config

## Issue Creation Guidelines

When creating issues automatically:

| Change Type | Issue Title Example                               | Labels          |
| ----------- | ------------------------------------------------- | --------------- |
| New feature | `feat(webui): add file upload support`            | `enhancement`   |
| Bug fix     | `fix(cron): timezone offset causes missed jobs`   | `bug`           |
| Refactor    | `refactor(settings): decompose SkillsHubSettings` | `refactor`      |
| Docs        | `docs: add architecture conventions`              | `documentation` |

## Mandatory Rules

### No AI Signature

**NEVER add any AI-related signatures.** This includes:

- `Generated with <AI tool>` in PR descriptions
- `Co-Authored-By: <any AI tool>` in commits
- Any AI-generated footer, byline, or emoji attribution

### Always Link Issues

Every PR must reference an issue. No exceptions — create one if none exists.

### No Force Push

NEVER force-push without explicit user approval.

## Quick Reference

```
0. Verify branch (not main) and commits exist
1. Analyze all changes between main..HEAD
2. Find or create issue
3. git push -u origin <branch>
4. gh pr create --title "..." --body "..." with Closes #<issue>
5. Output PR URL
```
