/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EVE_STRATEGY_SKILL_IDS,
  copyBundledStrategySkills,
  resolveBundledSkillsDir,
  resolveCommandEveRuntimeBootstrapPaths,
} from '@/process/commandEve/runtimeBootstrapCore';
import { buildCommandEvePromptProof } from '@/process/commandEve/ollamaOpenAiShim';
import {
  COMMAND_EVE_ASSISTANT_RULE_DE,
  COMMAND_EVE_ASSISTANT_RULE_EN,
} from '@/process/commandEve/assistantBootstrapCore';

// =========================================================================
// EVE SOUL-WIRING self-detection gate (founder-self-detection-standard).
//
// The whole point of this slice is that the running Hermes agent reads EVE's
// REAL identity (SOUL.md) and runs with the learning loop ON — not the prior
// 5-line stub with the loop killed (reasoning_effort:none, creation_nudge:0,
// no memory/curator). The founder-self-detection-standard says a failure the
// system FAILS TO SELF-DETECT is worse than the bug. So these tests are the
// regression TRIPWIRE: if the soul silently drifts back to a thin stub, or any
// learning switch silently flips off, the build MUST break here and be VISIBLE.
//
// EVE_SOUL_MARKDOWN and writeHermesRuntimeFiles are module-private (not
// exported), and the full bootstrap is an async side-effecting flow, so for the
// soul-text + config-emission assertions we read the SOURCE literal directly —
// the same fail-closed, un-mockable invariant pattern the marketing-gate test
// uses (commandEveChatMarketingGate.test.ts). The skill-copy / resolver / shim
// assertions exercise the real EXPORTED functions against fixtures.
// =========================================================================

const RUNTIME_BOOTSTRAP_SOURCE_PATH = path.resolve(
  __dirname,
  '../../../packages/desktop/src/process/commandEve/runtimeBootstrapCore.ts'
);

const stripComments = (source: string): string =>
  source
    // block comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // line comments (keep "://" intact so http(s) URLs survive)
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const RUNTIME_SOURCE_RAW = fs.readFileSync(RUNTIME_BOOTSTRAP_SOURCE_PATH, 'utf8');
const RUNTIME_SOURCE_CODE = stripComments(RUNTIME_SOURCE_RAW);

// Extract the EVE_SOUL_MARKDOWN template-literal body so we assert on the soul
// PROSE, not on comments that merely mention these phrases.
const extractSoulMarkdown = (raw: string): string => {
  const marker = 'const EVE_SOUL_MARKDOWN = `';
  const start = raw.indexOf(marker);
  expect(start, 'EVE_SOUL_MARKDOWN literal must exist in runtimeBootstrapCore.ts').toBeGreaterThan(-1);
  const bodyStart = start + marker.length;
  const end = raw.indexOf('`;', bodyStart);
  expect(end, 'EVE_SOUL_MARKDOWN literal must be terminated').toBeGreaterThan(bodyStart);
  return raw.slice(bodyStart, end);
};

const SOUL_MARKDOWN = extractSoulMarkdown(RUNTIME_SOURCE_RAW);

describe('EVE soul-wiring: SOUL.md self-detection tripwire', () => {
  it('is NOT the prior 5-line capability stub', () => {
    // The old stub was effectively a single capability/safety paragraph. The real
    // soul is a multi-section identity document. Length + section count are the
    // coarse drift guards; the marker assertions below are the precise ones.
    expect(SOUL_MARKDOWN.length).toBeGreaterThan(2000);
    // Regression signature: the old stub's whole body was a flat
    // "You are EVE, Command EVE Chief of Staff." line with no identity sections.
    const sectionHeadings = (SOUL_MARKDOWN.match(/^## /gm) || []).length;
    expect(sectionHeadings).toBeGreaterThanOrEqual(6);
  });

  it('carries The Operator identity + who-she-is-for-the-user line', () => {
    expect(SOUL_MARKDOWN).toContain('# EVE SOUL');
    expect(SOUL_MARKDOWN).toContain('The Operator');
    expect(SOUL_MARKDOWN).toContain('JARVIS for making money');
    // who I am FOR you / the 14-day north star
    expect(SOUL_MARKDOWN).toMatch(/Chief of Staff/i);
    expect(SOUL_MARKDOWN).toContain('go offline for 14 days');
    expect(SOUL_MARKDOWN).toContain('you are the brand');
  });

  it('contains at least 5 of the 8 convictions verbatim', () => {
    const convictions = [
      'Simplicity is strategy',
      'Growth by subtraction',
      'Curse of Capability',
      'Bottlenecks are singular',
      'Plumbing before water',
      'Customers know the answer',
      'No memo, no decision',
      'Leverage over busyness',
    ];
    const present = convictions.filter((c) => SOUL_MARKDOWN.includes(c));
    expect(present.length).toBeGreaterThanOrEqual(5);
  });

  it('carries the challenger method ("and then what?") and VISION->VERSIONS decomposition', () => {
    expect(SOUL_MARKDOWN).toContain('and then what');
    expect(SOUL_MARKDOWN).toMatch(/VISION .* VERSIONS .* MILESTONES/);
    expect(SOUL_MARKDOWN).toMatch(/confidant and CHALLENGER/i);
  });

  it('carries the non-negotiables: invisible delivery + per-client isolation + money-gate', () => {
    expect(SOUL_MARKDOWN).toMatch(/invisible[ -]delivery/i);
    expect(SOUL_MARKDOWN).toMatch(/per-client isolation/i);
    expect(SOUL_MARKDOWN).toMatch(/I do not move money/i);
  });

  it('carries the SELF-LEARNING section: it remembers (USER.md/MEMORY.md) AND builds itself skills', () => {
    // The whole reason for the config switches below — the soul must SAY it learns.
    expect(SOUL_MARKDOWN).toMatch(/How I learn and improve myself/i);
    expect(SOUL_MARKDOWN).toContain('USER.md');
    expect(SOUL_MARKDOWN).toContain('MEMORY.md');
    expect(SOUL_MARKDOWN).toMatch(/I build myself skills/i);
  });

  it('carries the honesty wall (configured, not yet proven)', () => {
    expect(SOUL_MARKDOWN).toMatch(/honesty wall/i);
    expect(SOUL_MARKDOWN).toContain('configured, not yet proven');
    expect(SOUL_MARKDOWN).toMatch(/FACT \/ INFERENCE \/ HYPOTHESIS/);
  });
});

describe('EVE soul-wiring: config.yaml emission self-detection (the loop-is-ON proof)', () => {
  // Assert on the emitted config array source (comments stripped) so a mention
  // inside a comment can never satisfy the gate.
  it('emits reasoning_effort that is NOT "none"', () => {
    // The agent: block must use the tier-keyed variable, never the literal none.
    expect(RUNTIME_SOURCE_CODE).toContain('`  reasoning_effort: ${reasoningEffort}`');
    expect(RUNTIME_SOURCE_CODE).not.toContain("'  reasoning_effort: none'");
    expect(RUNTIME_SOURCE_CODE).not.toContain('`  reasoning_effort: none`');
    // The default the founder single-tenant build ships must still THINK.
    expect(RUNTIME_SOURCE_CODE).toMatch(
      /DEFAULT_COMMAND_EVE_REASONING_EFFORT[^=]*=\s*'(low|medium|high|xhigh)'/
    );
  });

  it('emits the creation_nudge_interval as the tier-keyed variable (not a hard 0 kill-switch)', () => {
    expect(RUNTIME_SOURCE_CODE).toContain('`  creation_nudge_interval: ${creationNudgeInterval}`');
    expect(RUNTIME_SOURCE_CODE).not.toContain("'  creation_nudge_interval: 0'");
  });

  it('emits the memory block ON (memory_enabled + user_profile_enabled + nudge_interval)', () => {
    expect(RUNTIME_SOURCE_CODE).toContain("'memory:'");
    expect(RUNTIME_SOURCE_CODE).toContain("'  memory_enabled: true'");
    expect(RUNTIME_SOURCE_CODE).toContain("'  user_profile_enabled: true'");
    expect(RUNTIME_SOURCE_CODE).toContain("'  nudge_interval: 10'");
  });

  it('emits curator ON (the self-optimize half of the loop)', () => {
    expect(RUNTIME_SOURCE_CODE).toContain("'curator:'");
    expect(RUNTIME_SOURCE_CODE).toContain("'  enabled: true'");
  });

  it('emits kanban auto_decompose ON (vision->versions->milestones->child)', () => {
    expect(RUNTIME_SOURCE_CODE).toContain("'  auto_decompose: true'");
    expect(RUNTIME_SOURCE_CODE).not.toContain("'  auto_decompose: false'");
  });

  it('writes the composed soul to SOUL.md (not a stub literal)', () => {
    expect(RUNTIME_SOURCE_CODE).toMatch(/['"]SOUL\.md['"]\),\s*EVE_SOUL_MARKDOWN/);
  });
});

describe('EVE soul-wiring: bundled strategy skills copy (real, additive, fail-closed)', () => {
  const makeFixture = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-soul-bundle-'));
    const bundledSkillsDir = path.join(root, 'bundled-skills');
    fs.mkdirSync(bundledSkillsDir, { recursive: true });
    // 14 single-folder skills.
    for (const id of EVE_STRATEGY_SKILL_IDS) {
      if (id === 'marketing-outbound') continue;
      const dir = path.join(bundledSkillsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${id}\nReal strategy skill content for ${id}.\n`);
    }
    // marketing-outbound is a BUNDLE: no top-level SKILL.md, nested sub-skills.
    const moRoot = path.join(bundledSkillsDir, 'marketing-outbound');
    const sub1 = path.join(moRoot, 'icp-definer');
    const sub2 = path.join(moRoot, 'copywriting-linkedin-dm');
    fs.mkdirSync(sub1, { recursive: true });
    fs.mkdirSync(sub2, { recursive: true });
    fs.writeFileSync(path.join(sub1, 'SKILL.md'), '# icp-definer\nnested sub-skill\n');
    fs.writeFileSync(path.join(sub2, 'SKILL.md'), '# copywriting-linkedin-dm\nnested sub-skill\n');

    const paths = resolveCommandEveRuntimeBootstrapPaths(path.join(root, 'userData'));
    return { root, bundledSkillsDir, paths };
  };

  it('lands all 15 allowlisted strategy skills with real (non-stub) content', () => {
    const { root, bundledSkillsDir, paths } = makeFixture();
    try {
      const failures = copyBundledStrategySkills(paths, bundledSkillsDir);
      expect(failures).toEqual([]);
      for (const id of EVE_STRATEGY_SKILL_IDS) {
        if (id === 'marketing-outbound') continue;
        const dest = path.join(paths.managedSkillsRoot, id, 'SKILL.md');
        expect(fs.existsSync(dest), `${id}/SKILL.md must land`).toBe(true);
        expect(fs.readFileSync(dest, 'utf8')).toContain(`Real strategy skill content for ${id}`);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies marketing-outbound whole-tree (nested sub-skill SKILL.md files travel)', () => {
    const { root, bundledSkillsDir, paths } = makeFixture();
    try {
      copyBundledStrategySkills(paths, bundledSkillsDir);
      const moDest = path.join(paths.managedSkillsRoot, 'marketing-outbound');
      expect(fs.existsSync(path.join(moDest, 'icp-definer', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(moDest, 'copywriting-linkedin-dm', 'SKILL.md'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('FAILS CLOSED with a visible failure when an allowlisted skill is missing (no silent stub)', () => {
    const { root, bundledSkillsDir, paths } = makeFixture();
    try {
      // Remove one strategy skill from the snapshot — the founder-self-detection
      // case: a silent miss must BREAK and be VISIBLE, not fall back to a stub.
      fs.rmSync(path.join(bundledSkillsDir, 'pre-mortem'), { recursive: true, force: true });
      const failures = copyBundledStrategySkills(paths, bundledSkillsDir);
      expect(failures).toContain('capabilities.bundled_skill_missing:pre-mortem');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('no-ops (no failures) when no bundled-skills dir is resolved (bare env, snapshot-less)', () => {
    const { root, paths } = makeFixture();
    try {
      expect(copyBundledStrategySkills(paths, '')).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('EVE soul-wiring: resolveBundledSkillsDir resolution order', () => {
  it('prefers COMMAND_EVE_SKILLS_DIR env, then resourcesPath, then cwd/resources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eve-soul-resolve-'));
    try {
      const envDir = path.join(root, 'env-skills');
      const resourcesDir = path.join(root, 'res');
      fs.mkdirSync(envDir, { recursive: true });
      fs.mkdirSync(path.join(resourcesDir, 'bundled-skills'), { recursive: true });

      // env wins when present.
      expect(resolveBundledSkillsDir({ COMMAND_EVE_SKILLS_DIR: envDir }, resourcesDir)).toBe(envDir);
      // resourcesPath wins when env absent.
      expect(resolveBundledSkillsDir({}, resourcesDir)).toBe(path.join(resourcesDir, 'bundled-skills'));
      // empty string when neither env, resourcesPath, nor cwd/resources exists.
      const nonexistentResources = path.join(root, 'nope');
      const result = resolveBundledSkillsDir({}, nonexistentResources);
      // cwd/resources/bundled-skills IS committed in this repo, so the dev
      // fallback legitimately resolves; assert it never returns the missing path.
      expect(result).not.toBe(path.join(nonexistentResources, 'bundled-skills'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('EVE soul-wiring: prompt-proof shim covers the soul (self-detection stays green)', () => {
  it('classifies the new SOUL text as marker "eve_soul" (not "none")', () => {
    const proof = buildCommandEvePromptProof({
      messages: [
        { role: 'system', content: SOUL_MARKDOWN },
        { role: 'user', content: 'where are we?' },
      ],
    });
    expect(proof.marker).toBe('eve_soul');
    expect(proof.ok).toBe(true);
  });

  it('still classifies the internal EVE Operating Rule (the rule resource still stacks)', () => {
    const proof = buildCommandEvePromptProof({
      messages: [{ role: 'system', content: COMMAND_EVE_ASSISTANT_RULE_EN }],
    });
    expect(proof.marker).toBe('eve_operating_rule');
    expect(proof.ok).toBe(true);
  });

  it('marks "none" only when no EVE identity is present', () => {
    const proof = buildCommandEvePromptProof({
      messages: [{ role: 'user', content: 'hello there' }],
    });
    expect(proof.marker).toBe('none');
    expect(proof.ok).toBe(false);
  });
});

describe('EVE soul-wiring: internal Operating Rule reconciled to defer to SOUL.md', () => {
  it('scopes the rule as the internal layer that defers to the soul (DE + EN)', () => {
    // Reconcile invariant: the internal orchestration rule must NOT present a
    // second competing identity — it explicitly defers to SOUL.md and yields on
    // conflict. It must NOT itself carry the soul's identity cues, so the
    // prompt-proof can still distinguish the rule resource from the soul.
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).toContain('SOUL.md');
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).toMatch(/identity[\s\S]*live[\s\S]*soul/i);
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).toMatch(/when they conflict, SOUL\.md wins/i);
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).not.toContain('The Operator');
    expect(COMMAND_EVE_ASSISTANT_RULE_DE).toContain('SOUL.md');
    expect(COMMAND_EVE_ASSISTANT_RULE_DE).toMatch(/gewinnt SOUL\.md/i);
    expect(COMMAND_EVE_ASSISTANT_RULE_DE).not.toContain('The Operator');
  });

  it('keeps the load-bearing "# EVE Operating Rule" heading (shim marker contract)', () => {
    expect(COMMAND_EVE_ASSISTANT_RULE_EN.startsWith('# EVE Operating Rule')).toBe(true);
    expect(COMMAND_EVE_ASSISTANT_RULE_DE.startsWith('# EVE Operating Rule')).toBe(true);
  });

  it('preserves the no-secrets / gate boundaries (consumers + existing invariants unbroken)', () => {
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).toContain('You do not set Plane items to Done');
    expect(COMMAND_EVE_ASSISTANT_RULE_EN).toContain('raw tokens');
    expect(COMMAND_EVE_ASSISTANT_RULE_DE).toContain('Du setzt keine Plane-Items auf Done');
    expect(COMMAND_EVE_ASSISTANT_RULE_DE).toContain('Passwoertern');
  });
});
