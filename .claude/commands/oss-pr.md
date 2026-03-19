# OSS PR

Commit + PR workflow for open source contributions: auto-creates a user-prefixed branch when on main/master, then delegates to the `commit` and `pr` skills.

## Steps

### Step 1 — Resolve Branch

```bash
git branch --show-current
git config user.name
```

- Convert `user.name` to lowercase, replace spaces with hyphens → `{prefix}` (e.g. "John Doe" → `john-doe`)
- If `user.name` is unavailable, ask the user to provide a prefix

**If on `main` or `master`:**

- Run `git diff HEAD --stat` and `git status` to inspect the staged/unstaged changes
- Based on the actual changes, generate **1–2 recommended branch names** following `<type>/<short-description>` convention (e.g. `feat/dark-mode`, `fix/login-crash`)
- Present them as a numbered list and ask the user to pick one or provide their own
- Create and switch: `git checkout -b {prefix}/{branch-name}` (e.g. `john-doe/feat/dark-mode`)

**If already on a feature branch:** proceed as-is.

### Step 2 — Commit

Follow the `commit` skill in full (quality checks, grouping, format, approval).

### Step 3 — Open PR

Follow the `pr` skill — **skip** the issue association step (do NOT create or link an issue), proceed directly to push and PR creation.
