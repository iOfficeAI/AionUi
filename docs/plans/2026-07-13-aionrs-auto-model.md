# Aionrs Auto Model Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make team creation work for Aionrs assistants whose model policy is “remember last model” but has no remembered model yet.

**Architecture:** Keep assistant model precedence unchanged: fixed model, then remembered model. When neither exists and the assistant uses Aionrs, query the backend provider list and choose the first enabled model rather than returning the invalid sentinel `default`. Preserve the existing fallback for ACP and Gemini, and cover the new behavior with focused resolver tests.

**Tech Stack:** TypeScript, React renderer IPC bridge, Vitest.

---

### Task 1: Add regression coverage

**Files:**

- Modify: `tests/unit/renderer/teamCreateModelResolver.test.ts`

**Steps:**

1. Mock `ipcBridge.mode.listProviders`.
2. Add a test proving an Aionrs assistant with `auto` mode and no `last_model_id` resolves to the first available model from an enabled provider.
3. Add coverage for skipping disabled providers and providers with no models.
4. Run the focused test and confirm it fails because the current implementation returns `default`.

### Task 2: Implement the Aionrs fallback

**Files:**

- Modify: `packages/desktop/src/renderer/pages/team/components/teamCreateModelResolver.ts`

**Steps:**

1. Import the provider type only if needed for type-safe list handling.
2. Change the Aionrs fallback to call `ipcBridge.mode.listProviders.invoke()`.
3. Select the first enabled provider with an enabled model, respecting `model_enabled` when present.
4. Throw a clear error if no usable Aionrs provider/model exists; never return `default` for Aionrs team creation.
5. Keep fixed and remembered models higher priority.

### Task 3: Verify and commit

**Files:**

- Test: `tests/unit/renderer/teamCreateModelResolver.test.ts`
- Modify: `packages/desktop/src/renderer/pages/team/components/teamCreateModelResolver.ts`

**Steps:**

1. Run the focused Vitest test.
2. Run formatting, lint, and type checks applicable to the changed files.
3. Review the diff and ensure no unrelated files are included.
4. Commit with `fix: resolve aionrs auto model for team agents`.
5. Push the branch to the fork and open a PR targeting `iOfficeAI/AionUi:main`.
