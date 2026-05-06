# Titlebar Login Minimal Change Plan

## Goal

Add a `Login` entry on the top-right Titlebar with minimal code changes, while preserving existing architecture and reusing current auth/model pathways.

## Reuse Strategy

1. Reuse existing renderer auth context:
   - `src/renderer/hooks/context/AuthContext.tsx`
2. Reuse existing route:
   - `/login` in `src/renderer/components/layout/Router.tsx`
3. Keep custom model integration unchanged:
   - no changes to model config persistence (`model.config`)
   - no changes to provider request pipeline (`ClientFactory`, rotating clients)

## Priority Tasks

1. P0 - Add top-right login entry in Titlebar
   - File: `src/renderer/components/layout/Titlebar/index.tsx`
   - Use `useAuth()` for auth state and logout action.
   - Keep button in right toolbar area, before window controls.

2. P0 - Keep behavior safe and reversible
   - If authenticated: click triggers logout then navigate to `/login`.
   - If unauthenticated: click navigates to `/login`.
   - No side effects on model/provider config.

3. P1 - Minimal visual style update
   - File: `src/renderer/components/layout/Titlebar/titlebar.css`
   - Add dedicated class for the login entry only.

4. P2 - Verify
   - Type-check / lint focused on changed files.
   - Manual logic verification summary.

## Execution Status

1. P0 Titlebar entry: `completed`
2. P0 Safe behavior: `completed`
3. P1 Style update: `completed`
4. P2 Verification: `completed`

## Change Scope

1. `src/renderer/components/layout/Titlebar/index.tsx`
2. `src/renderer/components/layout/Titlebar/titlebar.css`
3. `docs/contributing/titlebar-login-minimal-plan.md`
