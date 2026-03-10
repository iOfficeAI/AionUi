# OSS Commit

Smart commit for open source projects: auto-create prefixed branch when on main/master.

## Instructions

Help me commit the current changes. Follow these rules:

1. **Gather info** (run these commands first):
   - `git branch --show-current` — determine current branch
   - `git status --short` — see changed files
   - `git config user.name` — get branch prefix

2. **Determine branch prefix**:
   - Use `git config user.name` — convert to lowercase and replace spaces with hyphens (e.g. "John Doe" → "john-doe")
   - If not available, ask the user to provide a prefix

3. **Check current branch**:
   - If on `main` or `master` → Ask for a new branch name, auto-prefix with `{prefix}/`, create and switch to it, then commit
   - If NOT on `main`/`master` → Commit directly on current branch

4. **Commit workflow**:
   - Run `git status` and `git diff` to understand the changes
   - Generate commit message in English using conventional commits format
   - **Important**: Do NOT include `Co-authored-by` or any AI attribution in the commit message
   - Do NOT push automatically

4. **Branch naming suggestions** (for reference when on main/master):
   - `feat/xxx` — new feature
   - `fix/xxx` — bug fix
   - `refactor/xxx` — refactoring
   - `chore/xxx` — maintenance

   Example: user inputs "feat/dark-mode" → branch name `{prefix}/feat/dark-mode`
