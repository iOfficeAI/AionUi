# Pull Request

> Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting. PRs that ignore the rules below may be closed and asked to resubmit.

## Description

<!-- Provide a clear and concise description of what this PR does and why. -->

## Related Issues

<!-- Link related issues. "Closes #123" / "Fixes #123" will auto-close the issue on merge. -->

- Closes #

## Type of Change

- [ ] `fix` — Bug fix (non-breaking change which fixes an issue)
- [ ] `feat` — New feature (non-breaking change which adds functionality)
- [ ] `perf` — Performance improvement
- [ ] `refactor` — Code restructuring (no behavior change)
- [ ] Breaking change (fix or feature that would break existing functionality)
- [ ] `docs` — Documentation update

## Atomic PR Checklist (Rule 1)

- [ ] This PR contains **exactly one** feature or bug fix that cannot be further decomposed
- [ ] The PR title follows Conventional Commit format: `<type>(<scope>): <subject>` (English)

## Local Checks (Rule 3)

<!-- Run these before pushing — CI will reject the PR if they fail. -->

- [ ] `bun run format` — formatting passes
- [ ] `bun run lint` — no lint errors (skip if no `.ts`/`.tsx` changed)
- [ ] `bunx tsc --noEmit` — no type errors (skip if no `.ts`/`.tsx` changed)
- [ ] `bunx vitest run` — tests pass
- [ ] i18n validated (`bun run i18n:types` + `node scripts/check-i18n.js`) — only if `src/renderer/`, `locales/`, or `src/common/config/i18n/` changed; N/A otherwise
- [ ] New/changed user-facing text uses i18n keys (no hardcoded strings)

## Runtime Verification

<!-- Which platforms did you actually run and verify on? -->

- [ ] Verified on macOS
- [ ] Verified on Windows
- [ ] Verified on Linux
- [ ] I have performed a self-review of my own code

## Screenshots

<!-- If applicable, add screenshots or recordings to help explain your changes. -->

## Additional Context

<!-- Add any other context about the pull request here. -->

---

<!-- Commits and PR titles must NOT contain AI signatures (Co-Authored-By, "Generated with", etc.). -->

**Thank you for contributing to AionUi! 🎉**
