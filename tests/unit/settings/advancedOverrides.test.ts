import type { CustomAgentAdvancedOverrides } from '@/common/types/platform/acpTypes';
import { buildAdvancedJson, parseAdvancedOverrides } from '@/renderer/pages/settings/AgentSettings/advancedOverrides';
import { describe, expect, it } from 'vitest';

/** The override bag for a parse that succeeded, or the outcome kind otherwise. */
function bagOf(json: string): CustomAgentAdvancedOverrides | 'ignored' | 'invalid' {
  const result = parseAdvancedOverrides(json);
  return result.kind === 'ok' ? result.value : result.kind;
}

describe('parseAdvancedOverrides', () => {
  // Regression: the panel accepted this JSON, showed no error, and dropped the key on save — so a
  // custom ACP agent could never be made team-selectable from the UI.
  it('keeps behavior_policy.supports_team', () => {
    expect(bagOf('{"behavior_policy":{"supports_team":true}}')).toEqual({
      behavior_policy: { supports_team: true },
    });
  });

  it('keeps both policy flags without either clobbering the other', () => {
    expect(bagOf('{"behavior_policy":{"supports_side_question":true,"supports_team":true}}')).toEqual({
      behavior_policy: { supports_side_question: true, supports_team: true },
    });
  });

  it('keeps supports_side_question alone (unchanged behaviour)', () => {
    expect(bagOf('{"behavior_policy":{"supports_side_question":true}}')).toEqual({
      behavior_policy: { supports_side_question: true },
    });
  });

  it('preserves false, which is a meaningful value and not an absence', () => {
    expect(bagOf('{"behavior_policy":{"supports_team":false}}')).toEqual({
      behavior_policy: { supports_team: false },
    });
  });

  it('ignores non-boolean flags rather than coercing them', () => {
    expect(bagOf('{"behavior_policy":{"supports_team":"yes"}}')).toEqual({});
  });

  it('omits behavior_policy entirely when no known flag is present', () => {
    expect(bagOf('{"behavior_policy":{"unknown_flag":true}}')).toEqual({});
  });

  it('keeps the other override keys', () => {
    expect(bagOf('{"yolo_id":"y","native_skills_dirs":["/a"],"description":"d"}')).toEqual({
      description: 'd',
      native_skills_dirs: ['/a'],
      yolo_id: 'y',
    });
  });

  it('drops blank strings and empty arrays so an untouched panel sends nothing', () => {
    expect(bagOf('{"yolo_id":"  ","native_skills_dirs":[],"description":""}')).toEqual({});
  });

  it('filters non-string entries out of native_skills_dirs', () => {
    expect(bagOf('{"native_skills_dirs":["/a",1,null]}')).toEqual({ native_skills_dirs: ['/a'] });
  });

  it('reports invalid JSON so the editor can surface it', () => {
    expect(bagOf('{oops')).toBe('invalid');
  });

  // Valid JSON that is neither object nor array clears the error and keeps the previous bag —
  // behaviour preserved verbatim from the inline logic this replaced, hence a kind of its own.
  it('reports non-object JSON as ignored, not invalid', () => {
    expect(bagOf('"str"')).toBe('ignored');
    expect(bagOf('null')).toBe('ignored');
  });

  // An array passes `typeof x === 'object'`, so it has always been read as an object with no known
  // keys — i.e. it clears the bag. Documented rather than changed: this PR fixes a dropped key, not
  // the panel's tolerance for odd input.
  it('treats an array as an empty bag, as before', () => {
    expect(bagOf('[]')).toEqual({});
  });
});

describe('buildAdvancedJson', () => {
  it('advertises supports_team in the skeleton — the panel is its only documentation', () => {
    const skeleton = JSON.parse(buildAdvancedJson({})) as CustomAgentAdvancedOverrides;
    expect(skeleton.behavior_policy).toEqual({ supports_side_question: false, supports_team: false });
  });

  // The panel is a serialize → edit → parse loop; a key surviving the skeleton but not the parse
  // (the bug this suite guards) is precisely what the user cannot see.
  it('round-trips a policy through build then parse', () => {
    const advanced = { behavior_policy: { supports_side_question: true, supports_team: true } };
    expect(bagOf(buildAdvancedJson(advanced))).toEqual(advanced);
  });

  it('round-trips the empty skeleton to the default policy', () => {
    expect(bagOf(buildAdvancedJson({}))).toEqual({
      behavior_policy: { supports_side_question: false, supports_team: false },
    });
  });
});
