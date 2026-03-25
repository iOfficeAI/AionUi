# OSS PR

Smart commit + PR workflow for open source projects: auto-create prefixed branch when on main/master, then open a pull request.

## Instructions

Help me commit the current changes and open a PR. Follow these steps:

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

4. **Branch naming suggestions** (for reference when on main/master):
   - `feat/xxx` — new feature
   - `fix/xxx` — bug fix
   - `refactor/xxx` — refactoring
   - `chore/xxx` — maintenance

   Example: user inputs "feat/dark-mode" → branch name `{prefix}/feat/dark-mode`

5. **Run quality checks**:

   ```bash
   bun run lint
   bun run format
   bunx tsc --noEmit
   ```

   - **lint fails** → Stop and report lint errors. Do not proceed until fixed.
   - **format** → Auto-fixes formatting issues silently.
   - **tsc fails** → Stop and report TypeScript errors. Do not proceed until fixed.
   - **All pass** → Proceed silently.

6. **Run tests**:

   ```bash
   bunx vitest run
   ```

   - **Fails** → Stop and report failing tests. Do not proceed until fixed.
   - **Passes** → Proceed silently.

7. **Commit workflow**:
   - Run `git status` and `git diff` to understand the changes
   - Generate commit message in English using conventional commits format
   - **Important**: Do NOT include `Co-authored-by` or any AI attribution in the commit message

8. **Push & create PR**:
   - Push the branch with `git push -u origin <branch>`
   - Run `git log main..HEAD --oneline` and `git diff main...HEAD` to understand all changes
   - Create PR with `gh pr create`, title under 70 characters
   - PR body format:

     ```
     ## Summary
     <1-3 bullet points>

     ## Test plan
     <bulleted checklist of what to verify>
     ```

   - **Important**: Do NOT include any AI-generated signatures or tool attributions in the PR body
   - Return the PR URL when done
