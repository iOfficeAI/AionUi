import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EVE_STRATEGY_SKILLS,
  EVE_STRATEGY_SKILL_IDS,
  decideSkillSource,
  decideVerify,
  stageBundledSkills,
} from './fetch-bundled-skills.mjs';

// --- allowlist shape -------------------------------------------------------

test('the allowlist is exactly the 15 curated strategy skills', () => {
  assert.equal(EVE_STRATEGY_SKILL_IDS.length, 15);
  assert.ok(EVE_STRATEGY_SKILL_IDS.includes('eve-doctrine'));
  assert.ok(EVE_STRATEGY_SKILL_IDS.includes('marketing-outbound'));
  // gitnexus and other dev/IDE skills must NEVER be in the allowlist.
  assert.ok(!EVE_STRATEGY_SKILL_IDS.includes('gitnexus'));
});

test('marketing-outbound is the only bundle; the rest are single skills', () => {
  const bundles = EVE_STRATEGY_SKILLS.filter((s) => s.bundle).map((s) => s.id);
  assert.deepEqual(bundles, ['marketing-outbound']);
});

// --- decideSkillSource (refresh / keep / missing) --------------------------

test('decideSkillSource refreshes from source when source exists', () => {
  assert.equal(decideSkillSource({ sourceExists: true, snapshotExists: false }).action, 'refresh');
  assert.equal(decideSkillSource({ sourceExists: true, snapshotExists: true }).action, 'refresh');
});

test('decideSkillSource keeps the snapshot when source is absent but snapshot exists', () => {
  assert.equal(decideSkillSource({ sourceExists: false, snapshotExists: true }).action, 'keep');
});

test('decideSkillSource FAILS CLOSED (missing) when neither source nor snapshot exists', () => {
  assert.equal(decideSkillSource({ sourceExists: false, snapshotExists: false }).action, 'missing');
});

// --- decideVerify (single vs bundle) ---------------------------------------

test('decideVerify single: OK only with its own SKILL.md', () => {
  assert.equal(decideVerify({ bundle: false, hasOwnSkillMd: true, nestedSkillMdCount: 0 }).ok, true);
  assert.equal(decideVerify({ bundle: false, hasOwnSkillMd: false, nestedSkillMdCount: 5 }).ok, false);
});

test('decideVerify bundle: OK with >=1 nested SKILL.md, FAILS with none', () => {
  assert.equal(decideVerify({ bundle: true, hasOwnSkillMd: false, nestedSkillMdCount: 3 }).ok, true);
  assert.equal(decideVerify({ bundle: true, hasOwnSkillMd: false, nestedSkillMdCount: 0 }).ok, false);
});

// --- stageBundledSkills end-to-end against a fixture -----------------------

function makeFixtureSrc(root, { omit = [] } = {}) {
  const omitSet = new Set(omit);
  const srcRoot = path.join(root, 'src-skills');
  fs.mkdirSync(srcRoot, { recursive: true });
  for (const skill of EVE_STRATEGY_SKILLS) {
    if (omitSet.has(skill.id)) continue;
    const dir = path.join(srcRoot, skill.id);
    fs.mkdirSync(dir, { recursive: true });
    if (skill.bundle) {
      fs.writeFileSync(path.join(dir, 'README.md'), '# bundle\n');
      const sub = path.join(dir, 'icp-definer');
      fs.mkdirSync(sub, { recursive: true });
      fs.writeFileSync(path.join(sub, 'SKILL.md'), '# icp-definer\nreal\n');
    } else {
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${skill.id}\nreal\n`);
    }
  }
  return srcRoot;
}

test('stageBundledSkills refreshes from source and verifies all 15 (no failures)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fbs-test-'));
  try {
    const srcRoot = makeFixtureSrc(root);
    const snapshotRoot = path.join(root, 'snapshot');
    const failures = stageBundledSkills({ srcRoot, snapshotRoot });
    assert.deepEqual(failures, []);
    // single skill landed
    assert.ok(fs.existsSync(path.join(snapshotRoot, 'eve-doctrine', 'SKILL.md')));
    // bundle's nested SKILL.md landed
    assert.ok(fs.existsSync(path.join(snapshotRoot, 'marketing-outbound', 'icp-definer', 'SKILL.md')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stageBundledSkills keeps the committed snapshot when source is absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fbs-test-'));
  try {
    const snapshotRoot = path.join(root, 'snapshot');
    // Pre-seed a full snapshot (as if committed), then point at a non-existent source.
    const srcRoot = makeFixtureSrc(root);
    stageBundledSkills({ srcRoot, snapshotRoot }); // populate snapshot
    fs.rmSync(srcRoot, { recursive: true, force: true }); // source now absent
    const failures = stageBundledSkills({ srcRoot, snapshotRoot });
    assert.deepEqual(failures, []); // trusts the snapshot, still verifies
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stageBundledSkills FAILS CLOSED when a skill is in neither source nor snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fbs-test-'));
  try {
    const srcRoot = makeFixtureSrc(root, { omit: ['eve-doctrine'] });
    const snapshotRoot = path.join(root, 'snapshot'); // empty -> no committed fallback either
    const failures = stageBundledSkills({ srcRoot, snapshotRoot });
    assert.ok(failures.includes('bundled_skill_missing:eve-doctrine'));
    // the others still staged
    assert.ok(fs.existsSync(path.join(snapshotRoot, 'plan-system', 'SKILL.md')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stageBundledSkills FAILS CLOSED on an invalid bundle (no nested SKILL.md)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fbs-test-'));
  try {
    const srcRoot = makeFixtureSrc(root);
    // Break the bundle: a dir with only a README, no nested SKILL.md.
    fs.rmSync(path.join(srcRoot, 'marketing-outbound'), { recursive: true, force: true });
    fs.mkdirSync(path.join(srcRoot, 'marketing-outbound'), { recursive: true });
    fs.writeFileSync(path.join(srcRoot, 'marketing-outbound', 'README.md'), 'only readme\n');
    const snapshotRoot = path.join(root, 'snapshot');
    const failures = stageBundledSkills({ srcRoot, snapshotRoot });
    assert.ok(failures.includes('bundled_skill_invalid:marketing-outbound'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
