#!/usr/bin/env node
/**
 * fetch-bundled-skills.mjs — Bundled EVE strategy skills (build-time stage + verify).
 *
 * Copies the REAL EVE strategy SKILL.md trees out of the Company.OS skills dir
 * (the canonical authoring home, /.claude/skills) into a committed snapshot at
 *
 *   resources/bundled-skills/<skill-id>/SKILL.md
 *   resources/bundled-skills/marketing-outbound/<sub>/SKILL.md   (the bundle)
 *
 * electron-builder then maps `resources/bundled-skills` -> `bundled-skills` via
 * `extraResources`, landing it at `Contents/Resources/bundled-skills/` OUTSIDE the
 * asar (the bundled CPython/Hermes agent reads SKILL.md files via os.walk, not
 * Electron fs). At first run the runtime bootstrapper copies these trees into the
 * writable managedSkillsRoot so `skills.external_dirs` serves the real method
 * content to the running Hermes agent (replacing the boilerplate onboarding stubs).
 *
 * WHY a committed snapshot (vendor) and not fetch-at-build-only (like python):
 *   The app repo must build hermetically WITHOUT the Company.OS checkout present
 *   (CI, a fresh clone, a contributor box). So we COMMIT the snapshot and treat
 *   the cross-repo copy as an idempotent, env-gated REFRESH:
 *     - source present  -> refresh the snapshot from canonical, then verify.
 *     - source absent   -> trust the committed snapshot, then verify.
 *   Either way we FAIL-CLOSED (non-zero exit) if any allowlisted skill is missing
 *   from BOTH source and snapshot — a silent gap is the founder-self-detection
 *   failure mode (a skill the running agent thinks it has but doesn't).
 *
 * The skills are small markdown (~120 KB total), cross-platform, and pure text —
 * no signing/notarize concern (unlike Resources/python). So unlike
 * fetch-bundled-python this runs UNCONDITIONALLY for every platform.
 *
 * Source override:
 *   COMMAND_EVE_SKILLS_SRC=/abs/path/to/.claude/skills node scripts/fetch-bundled-skills.mjs
 *   (default: /Users/mathiasheinke/Developer/Company.OS/.claude/skills)
 *
 * The pure logic (allowlist, copy/skip decision, fail-closed verify) is exported
 * for unit testing; side effects (fs) run only when invoked directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// ALLOWLIST — the curated EVE strategy skill set.
// ---------------------------------------------------------------------------
// EXPLICIT allowlist (never glob .claude/skills — gitnexus and other dev/IDE
// skills must NOT travel into the shipped app). 14 single-folder skills with one
// SKILL.md each, PLUS marketing-outbound which is a BUNDLE (no top-level
// SKILL.md; 17 nested sub-skill dirs each with their own SKILL.md).
//
// `bundle: true` changes the verify rule: a single skill must land its own
// <id>/SKILL.md; a bundle must land at least one NESTED **/SKILL.md (Hermes'
// os.walk discovers every nested SKILL.md — FACT wheel agent/skill_utils.py:632-645).
export const EVE_STRATEGY_SKILLS = Object.freeze([
  { id: 'eve-doctrine' },
  { id: 'plan-system' },
  { id: 'pre-mortem' },
  { id: 'business-diagnostic' },
  { id: 'icp-persona-panel' },
  { id: 'decision-brief' },
  { id: 'deep-research' },
  { id: 'gtm-strategy' },
  { id: 'customer-discovery' },
  { id: 'business-architecture' },
  { id: 'hiring' },
  { id: 'option-tournament' },
  { id: 'landing-copy' },
  { id: 'human-design-profile' },
  { id: 'marketing-outbound', bundle: true },
]);

/** Just the ids, for callers that want the flat allowlist. */
export const EVE_STRATEGY_SKILL_IDS = Object.freeze(EVE_STRATEGY_SKILLS.map((s) => s.id));

export const DEFAULT_SKILLS_SRC = '/Users/mathiasheinke/Developer/Company.OS/.claude/skills';
export const COMMAND_EVE_SKILLS_SRC_ENV = 'COMMAND_EVE_SKILLS_SRC';

// ---------------------------------------------------------------------------
// PURE LOGIC (exported for unit tests; no fs side effects)
// ---------------------------------------------------------------------------

/**
 * Decide, for ONE allowlisted skill, where the build should source it from.
 * Pure: given whether the canonical source and the committed snapshot exist,
 * pick the action. FAIL-CLOSED when neither exists.
 *
 * Returns { action, reason }:
 *   - 'refresh'   source exists -> copy source over the snapshot (keep in sync).
 *   - 'keep'      source absent, snapshot exists -> trust the committed snapshot.
 *   - 'missing'   neither exists -> caller must FAIL (non-zero exit).
 */
export function decideSkillSource({ sourceExists, snapshotExists }) {
  if (sourceExists) return { action: 'refresh', reason: 'canonical source present — refreshing snapshot' };
  if (snapshotExists) return { action: 'keep', reason: 'source absent — trusting committed snapshot' };
  return {
    action: 'missing',
    reason: 'allowlisted skill missing from BOTH canonical source and committed snapshot — fail-closed',
  };
}

/**
 * The fail-closed verify decision for a staged skill, given what landed in the
 * snapshot. Pure.
 *
 *   single skill: requires <dir>/SKILL.md to be a non-empty file.
 *   bundle:       requires >= 1 nested **\/SKILL.md.
 *
 * Returns { ok, reason }.
 */
export function decideVerify({ bundle, hasOwnSkillMd, nestedSkillMdCount }) {
  if (bundle) {
    if ((nestedSkillMdCount || 0) >= 1) return { ok: true, reason: `bundle has ${nestedSkillMdCount} nested SKILL.md` };
    return { ok: false, reason: 'bundle has no nested SKILL.md' };
  }
  if (hasOwnSkillMd) return { ok: true, reason: 'SKILL.md present' };
  return { ok: false, reason: 'missing SKILL.md' };
}

// ---------------------------------------------------------------------------
// fs helpers (side-effecting; small + dependency-free)
// ---------------------------------------------------------------------------

/** True iff `p` exists and is a non-empty regular file. */
function isNonEmptyFile(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

/** Count nested SKILL.md files under `dir` (recursive). 0 if dir missing. */
function countNestedSkillMd(dir) {
  let count = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      count += countNestedSkillMd(full);
    } else if (ent.isFile() && ent.name === 'SKILL.md' && isNonEmptyFile(full)) {
      count += 1;
    }
  }
  return count;
}

/** Recursively copy a directory tree (markdown only; preserves layout). */
function copyTree(srcDir, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, ent.name);
    const to = path.join(destDir, ent.name);
    if (ent.isDirectory()) {
      copyTree(from, to);
    } else if (ent.isFile()) {
      fs.copyFileSync(from, to);
    }
    // symlinks / other entry types are intentionally skipped — skills are pure files.
  }
}

// ---------------------------------------------------------------------------
// CLI / side-effecting runner
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'resources', 'bundled-skills');

function log(...args) {
  console.log('[fetch-bundled-skills]', ...args);
}

/**
 * Stage every allowlisted skill into the snapshot dir, refreshing from the
 * canonical source when present, otherwise trusting the committed snapshot, and
 * verifying each landed correctly. Returns a list of failure strings (empty when
 * all OK). Pure-ish: takes the source root + snapshot root so tests can drive it
 * against fixtures.
 */
export function stageBundledSkills({ srcRoot, snapshotRoot, skills = EVE_STRATEGY_SKILLS }) {
  const failures = [];
  fs.mkdirSync(snapshotRoot, { recursive: true });

  for (const skill of skills) {
    const srcDir = path.join(srcRoot, skill.id);
    const destDir = path.join(snapshotRoot, skill.id);
    const sourceExists = (() => {
      try {
        return fs.statSync(srcDir).isDirectory();
      } catch {
        return false;
      }
    })();
    const snapshotExists = (() => {
      try {
        return fs.statSync(destDir).isDirectory();
      } catch {
        return false;
      }
    })();

    const decision = decideSkillSource({ sourceExists, snapshotExists });
    if (decision.action === 'missing') {
      failures.push(`bundled_skill_missing:${skill.id}`);
      log(`MISSING ${skill.id} — ${decision.reason}`);
      continue;
    }
    if (decision.action === 'refresh') {
      copyTree(srcDir, destDir);
      log(`refreshed ${skill.id} from source`);
    } else {
      log(`kept committed snapshot for ${skill.id}`);
    }

    // FAIL-CLOSED verify of what actually landed.
    const verify = decideVerify({
      bundle: Boolean(skill.bundle),
      hasOwnSkillMd: isNonEmptyFile(path.join(destDir, 'SKILL.md')),
      nestedSkillMdCount: countNestedSkillMd(destDir),
    });
    if (!verify.ok) {
      failures.push(`bundled_skill_invalid:${skill.id}`);
      log(`INVALID ${skill.id} — ${verify.reason}`);
    }
  }
  return failures;
}

function main() {
  const srcRoot = compactEnv(process.env[COMMAND_EVE_SKILLS_SRC_ENV]) || DEFAULT_SKILLS_SRC;
  log(`source=${srcRoot}`);
  log(`snapshot=${path.relative(REPO_ROOT, SNAPSHOT_DIR)}`);

  const failures = stageBundledSkills({ srcRoot, snapshotRoot: SNAPSHOT_DIR });
  if (failures.length) {
    console.error(
      `[fetch-bundled-skills] FAIL-CLOSED: ${failures.length} skill(s) missing/invalid:\n  ` +
        failures.join('\n  ') +
        `\n  Source: ${srcRoot}\n  A strategy skill the running agent expects is absent from both ` +
        `the canonical source and the committed snapshot — refusing to ship a silent gap.`
    );
    process.exitCode = 2;
    return;
  }
  log(`done. ${EVE_STRATEGY_SKILL_IDS.length} skills staged + verified.`);
}

function compactEnv(value) {
  return String(value ?? '').trim();
}

// Run only when invoked directly (so tests can import the pure logic).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error('[fetch-bundled-skills] ERROR:', error?.message || error);
    process.exitCode = 1;
  }
}
