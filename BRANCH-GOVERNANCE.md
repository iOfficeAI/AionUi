# Branch Governance — AionUi (POUNDING Fork)

## Phase 1 (current — asymmetric)

| Branch | Role | Base | Merge Direction |
|--------|------|------|----------------|
| `upstream-sync/main` | Upstream mirror | upstream `main` | upstream → `upstream-sync/main` |
| `main` | Local integration (branded) | Upstream `main` + branding | `halo/feat/*` / `fix/*` → `main` |
| `dev` | *(upstream tracking only)* Operational reference | upstream `dev` | upstream → `dev` (read-only) |
| `integration/fork-brand-login-model` | Brand integration trunk | Upstream + branding commits | Branding branches → here |
| `release/pounding-v2.0.x` | Release freeze / validation | `integration/fork-brand-login-model` | Validation-only; no feature work |
| `feat/pounding-*` | Branding feature branches | `integration/fork-brand-login-model` | feature → `integration/fork-brand-login-model` |
| `fix/*` | Bugfix branches | owning target | fix → owning branch |

## Phase 2 (target — after workflow redesign)

AionUi moves to same model as AionCore:
- `upstream-sync/main` + team-owned `main` + short-lived `release/pounding-*`
- Workflow triggers redesigned away from `dev`-centric automation

## Rules

1. `release/pounding-*` is **validation-only by default** — no feature work
2. Urgent `fix/*` on release branch requires explicit approval AND merge-back to owning stable branch
3. Upstream intake flows only through `upstream-sync/main` — never directly to product branches
4. AionUi keeps `integration/fork-brand-login-model` as stable control plane in Phase 1 (not yet migrated to `main`)
