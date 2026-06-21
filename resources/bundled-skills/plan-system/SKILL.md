---
name: plan-system
description: Turn a vision, strategy, campaign, app, or big goal into a versioned, navigable PLAN that lives on the native kanban + SQL board — a SUPERGOAL broken into VERSION milestones (v1.1, v1.2, v2.0 …) with concrete child Worker Contracts hanging under each. Use when the user wants to plan/structure/organize a goal, "make a plan", "break this down", "set up a roadmap", "track this across versions", "where are we / what's next", or whenever loose intent needs an executable structure the user can keep steering even as they re-decide mid-flight. For Command EVE this is a core product capability — EVE co-builds the plan WITH the operator on the same board-shape we run in Plane externally, so the operator (and their clients) always keep orientation toward where they want to go (v1 → v2 → v3) even when the work changes.
---

# Plan System

A plan-system is the structure that lets a vision survive contact with reality. Instead of a flat
to-do list that loses the "why" and the "where to" the moment priorities shift, you build a
**three-tier, versioned plan** on a live board (native kanban + SQL): a **SUPERGOAL** (the
übergeordnetes Ziel — a campaign, an app, a vision) → **VERSION MILESTONES** (the Teilschritte:
v1.1, v1.2, v2.0 …) → **CHILD WORKER CONTRACTS** (the concrete, executable work items hanging under
each milestone). The result is a whole system to operate in: the user keeps a rough orientation
toward where they want to go even when they re-decide, re-order, or add things mid-flight. It is the
same board-shape Company.OS runs in Plane externally — here it runs natively on Hermes.

## When to use
- Turning a vision, strategy, marketing campaign, app, or big goal into an executable, navigable plan.
- Tracking a goal across versions/milestones (v1 → v2 → v3) where scope will change as you learn.
- Whenever loose intent ("I want to launch X", "grow Y") needs a structure the user can steer.
- Any time work needs a backbone that survives re-prioritization — add/re-parent without losing the why.

## The method
1. **Capture the SUPERGOAL + its WHY.** State the übergeordnetes Ziel in one line as the top board
   item (a campaign / app / vision). Record *why it matters* and the **definition of done** for the
   whole arc. **Link source-of-truth docs** (strategy notes, brief, spec) — the plan points AT the
   truth, it does not duplicate it. This item is the orientation the user steers by.
2. **Break into VERSION milestones.** Decompose the supergoal into ordered version Teilschritte —
   `v1.1`, `v1.2`, `v2.0` … — each a shippable increment with its own goal and exit criteria.
   v1 = the smallest thing that delivers value; later versions = where they want to go. The version
   ladder IS the navigation: the user can always see current-version vs. the destination.
3. **Hang CHILD WORKER CONTRACTS under each version.** For each milestone create concrete work items
   as parent→child of that version, each a parseable Worker Contract with these fields:
   `role:*` · `source_of_truth` (absolute doc paths) · `acceptance_criteria` (verifiable outcomes) ·
   `gates` (command/review checks) · `human_gate` (HG level) · `reporting` (what worker.reported
   carries). One verifiable outcome per item; small enough to run, big enough to matter.
4. **Operate it on the native board (kanban + SQL).** Hermes already HAS the kanban + DB — this skill
   is EVE *understanding how to drive it under this doctrine*. Use it to: create items at the right
   tier, set parent/child links (supergoal→version→contract), apply **version labels/prefixes** so
   items sort by milestone, read the current state ("what's in progress, what's next, what's done"),
   and update states as work moves (Backlog → In Progress → In Review → Done). All operations are
   **idempotent** — re-running a create/update must not duplicate; match on a stable key first.
5. **Keep it living.** The plan is not frozen at kickoff. Re-prioritize versions, re-parent items,
   split or add child contracts as the user re-decides — **the orientation survives the change**
   because the supergoal and version ladder stay put while the work underneath flexes. After each
   move, re-read the board so the user sees the updated path from "now" to "where we want to go".

## Output
- A live three-tier board: SUPERGOAL → VERSION milestones → child Worker Contracts, navigable by version.
- Each child item is a parseable Worker Contract (role · source_of_truth · acceptance_criteria · gates · human_gate · reporting).
- A current-state read: what's done, in progress, and next — and the remaining path to each version's exit criteria.
- The plan stays doc-linked (points at source-of-truth, no duplication) and **human-gated**: a worker may move items into progress/review, but **Done is a founder/CEO transition, never the worker's.**

## For Command EVE
This is how the operator **"Alois"** turns intent into a steerable system, and how **EVE** makes it
real on the board:
- **EVE creates the asset.** When Alois names a goal ("launch the spring campaign", "ship the app
  v2"), EVE provisions the plan-system: it writes the SUPERGOAL item, the version milestones, and the
  first child Worker Contracts on Hermes' native kanban + SQL board — then hands Alois a navigable
  roadmap, not a wall of tasks.
- **Alois self-checks first.** Before steering clients, Alois runs his OWN goals through the
  plan-system — vision → versions → contracts — so his orientation is concrete and he has felt the
  method work on himself.
- **Then Alois checks his clients.** Once a client is created, Alois (with EVE) stands up the same
  three-tier plan for that client's goal, so every client keeps the same orientation toward v1 → v2 →
  v3, and re-decisions mid-engagement never lose the thread.
- **Same shape, native runtime.** It is the exact board-shape Company.OS runs in Plane externally —
  EVE just operates it natively on Hermes, idempotently and doc-linked, with Done reserved for the
  founder/CEO gate.

## Rules
- Three tiers, always: SUPERGOAL → VERSION → child Worker Contract. Don't flatten the ladder away.
- Point at source-of-truth docs; never duplicate the strategy into the board.
- Every child item is a real Worker Contract with verifiable acceptance_criteria — not a vague task.
- Idempotent operations only: match-then-update, never blind-create duplicates.
- The plan is living — re-parent and re-prioritize freely; the supergoal + version ladder hold the orientation.
- Human-gated: workers move items to In Review; **Done is founder/CEO**, not the worker, not EVE.
