# Merge Steward Procedure

This document defines the operating procedure for merging PRs when branch protection requires approval from someone other than the PR author. The goal is to keep branch protection intact without relying on self-approval, admin bypass, or relaxed repository rules.

This procedure covers the human merge step that follows the automated flow in [pr-automation.md](pr-automation.md). It applies once a PR reaches the `bot:ready-to-merge` state but still shows `mergeStateStatus=BLOCKED` because the required human approval is missing.

## Role

A Merge Steward is a maintainer or required reviewer who owns the final GitHub-side approval and merge step after implementation, CI monitoring, and agent review are complete.

The Merge Steward does not replace code review. They verify that the handoff is complete, submit the required GitHub approval with their own account, and perform the merge action according to repository policy.

## Required GitHub Permissions

The Merge Steward must have:

- Required reviewer or maintainer status for the repository.
- Permission to submit PR reviews on GitHub.
- Permission to squash merge PRs into the protected branch.
- Permission to enable auto-merge when the repository allows it and the PR is otherwise ready.
- Visibility into branch protection blockers when a PR remains blocked after CI passes.

## AI / `plus61` Responsibilities

The AI worker or `plus61` PR author is responsible for:

- Creating the PR from the prepared branch.
- Keeping the branch scoped to the approved task.
- Monitoring CI until checks are green, or reporting failures with job names and actionable triage notes.
- Requesting or confirming C-Reviewer approval before handoff.
- Posting a review-ready or merge-ready comment with scope, tests, risks, and current blockers.
- Calling out any review-target limitations, such as vendored third-party files that should be hash-verified rather than content-reviewed.

The AI worker or `plus61` author must not assume they can satisfy required approval when they authored the PR.

## Merge Steward Responsibilities

The Merge Steward is responsible for:

- Reviewing the PR handoff summary and confirming the requested scope.
- Confirming CI is green or that auto-merge is appropriate while required checks finish.
- Confirming C-Reviewer or equivalent review is complete when required by the task.
- Approving the PR on GitHub using their own account.
- Squash merging the PR when ready.
- Enabling auto-merge when all non-check requirements are satisfied but required checks are still running.
- Reporting exact branch-protection blockers when GitHub still shows the PR as blocked.

## Prohibited Practices

Do not use these as normal workflow shortcuts:

- Routine admin bypass of branch protection.
- Self-approval by the PR author as the required approval path.
- Relaxing branch protection to merge a specific PR.
- Sharing PATs, GitHub sessions, or maintainer credentials with agents or other users.
- Asking an agent to bypass branch protection or merge without the required human approval.

## PR Handoff Checklist

Before asking the Merge Steward to merge, the PR author or agent must provide:

- PR URL and head commit SHA.
- CI status is green, or auto-merge is appropriate while checks are still running.
- C-Reviewer or equivalent approval is present, or explicitly requested as the next human action.
- Scope summary and confirmation that unrelated changes are excluded.
- Test plan and command results.
- Risk notes, including generated, vendored, or third-party files.
- Reviewer guidance for limited-review areas, such as vendored files that should be hash-verified rather than content-reviewed.
- Current GitHub state when available: `reviewDecision`, `mergeStateStatus`, `mergeable`, and required checks.

## Example: PR #3123

For the `playwright-interactive` trial PR #3123:

1. AI / `plus61` opens the PR from the prepared branch.
2. AI / `plus61` monitors CI and reports that required checks are green.
3. AI / `plus61` posts the merge-ready summary with:
   - Upstream source and pinned SHAs.
   - Three-commit structure.
   - Tier 1 / Tier 2 activation model.
   - Trial log reference.
   - Formatter hook exclude rationale.
   - Note that `.codex/skills/external/playwright-interactive@b0401f0/` is upstream vendoring and should not receive content review.
   - Review target limited to policy docs and hook configuration.
4. C-Reviewer confirms final approval or provides blocking comments.
5. Merge Steward reviews the handoff, approves the PR in GitHub, and squash merges.
6. If all required reviews are present but checks are still completing, Merge Steward may enable auto-merge instead of manually waiting.

If GitHub reports `mergeable=MERGEABLE` but `mergeStateStatus=BLOCKED` and there are no approvals, the blocker is the missing required human approval. The AI / `plus61` author should report the blocker and stop; the Merge Steward must complete the approval and merge step.
