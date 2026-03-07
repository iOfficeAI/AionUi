# AionUi Development Rules

This project is based on an open-source project (iOfficeAI/AionUi). To maintain consistency and avoid merge conflicts or polluted branches, ALWAYS adhere to the following rules when developing new features or fixing bugs:

## 1. Branching Strategy
- **ALWAYS branch off from `main`**. Do NOT branch off from another feature branch unless explicitly requested.
- Before creating a new branch, ensure your local `main` branch is up-to-date with `origin/main`.
- **Branch Naming Convention**: Use `feature/YourFeatureName` for new features or `fix/YourBugFix` for bug fixes. Examples: `feature/EnvironmentSeparation`, `fix/webui-issues`.

## 2. Commit & PR Workflow
1. Create a feature branch: `git checkout -b feature/AmazingFeature`
2. Commit your changes: `git commit -m 'Add some AmazingFeature'`
3. Push to the branch: `git push origin feature/AmazingFeature`
4. Open a Pull Request.

## 3. Code Quality & Pre-commits
- The project uses `prek` (a Rust implementation of pre-commit) for code checks.
- Run checks on staged files before committing: `prek run`
- Alternatively, you can install the git hooks using `prek install` to automate this.

## 4. Tech Stack & Environment
- **Package Manager**: Always use `bun` and `just`. Do not use `npm` or `yarn` directly if `just` commands are available (e.g., `just install`, `just dev`).
- **Framework**: React 19, TypeScript, Electron, Vite, UnoCSS.
- Follow the existing code style, including UI components (Arco Design) and Icons (@icon-park/react).

## 5. Branch Hygiene
- Keep feature branches focused on a single topic. Do not mix unrelated changes (e.g., UI tweaks mixed with backend separation) to avoid polluting the PR.
- If you notice unrelated changes in your working directory from previous branches, clean them up or stash them before starting new work.
