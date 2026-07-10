import { describe, expect, it } from 'vitest';
import {
  assignMemberColors,
  memberColorValue,
  LEADER_COLOR_INDEX,
  TEAM_MEMBER_PALETTE,
} from '@/renderer/pages/team/identity/teamMemberColors';

const leader = (slot_id: string) => ({ slot_id, role: 'leader' });
const mate = (slot_id: string) => ({ slot_id, role: 'teammate' });

describe('assignMemberColors', () => {
  it('always pins the leader to color index 0', () => {
    const map = assignMemberColors({}, [leader('L'), mate('a'), mate('b')]);
    expect(map.L).toBe(LEADER_COLOR_INDEX);
    expect(map.a).not.toBe(LEADER_COLOR_INDEX);
    expect(map.b).not.toBe(LEADER_COLOR_INDEX);
    expect(map.a).not.toBe(map.b);
  });

  it('assigns sequential non-zero colors to new teammates', () => {
    const map = assignMemberColors({}, [leader('L'), mate('a'), mate('b'), mate('c')]);
    expect(map.a).toBe(1);
    expect(map.b).toBe(2);
    expect(map.c).toBe(3);
  });

  it('keeps existing members color fixed when a new member is added (pin-down)', () => {
    const first = assignMemberColors({}, [leader('L'), mate('a'), mate('b')]);
    const second = assignMemberColors(first, [leader('L'), mate('a'), mate('b'), mate('c')]);
    expect(second.a).toBe(first.a);
    expect(second.b).toBe(first.b);
    expect(second.c).toBeDefined();
    expect(second.c).not.toBe(first.a);
    expect(second.c).not.toBe(first.b);
  });

  it('does not change others colors when a middle member is removed', () => {
    const first = assignMemberColors({}, [leader('L'), mate('a'), mate('b'), mate('c')]);
    // remove 'b'
    const second = assignMemberColors(first, [leader('L'), mate('a'), mate('c')]);
    expect(second.a).toBe(first.a);
    expect(second.c).toBe(first.c); // c keeps its color, does NOT shift into b's slot
    expect(second.b).toBeUndefined(); // b's color released
  });

  it('reuses a released color for a newly added member', () => {
    const first = assignMemberColors({}, [leader('L'), mate('a'), mate('b'), mate('c')]);
    const bColor = first.b;
    const removed = assignMemberColors(first, [leader('L'), mate('a'), mate('c')]);
    // add a new member 'd' — should reuse b's freed color (smallest free non-zero)
    const readded = assignMemberColors(removed, [leader('L'), mate('a'), mate('c'), mate('d')]);
    expect(readded.d).toBe(bColor);
    expect(readded.a).toBe(first.a);
    expect(readded.c).toBe(first.c);
  });

  it('cycles through the palette when members exceed palette size', () => {
    const many = [leader('L'), ...Array.from({ length: TEAM_MEMBER_PALETTE.length + 2 }, (_, i) => mate(`m${i}`))];
    const map = assignMemberColors({}, many);
    // every member has a valid index within palette bounds
    for (const a of many) {
      expect(map[a.slot_id]).toBeGreaterThanOrEqual(0);
      expect(map[a.slot_id]).toBeLessThan(TEAM_MEMBER_PALETTE.length);
    }
    // leader still 0
    expect(map.L).toBe(0);
  });

  it('handles a team with no leader (all teammates)', () => {
    const map = assignMemberColors({}, [mate('a'), mate('b')]);
    expect(map.a).toBeDefined();
    expect(map.b).toBeDefined();
    expect(map.a).not.toBe(map.b);
  });
});

describe('memberColorValue', () => {
  it('returns the palette value for a mapped slot', () => {
    const map = { L: 0, a: 1, b: 2 };
    expect(memberColorValue(map, 'a')).toBe(TEAM_MEMBER_PALETTE[1]);
    expect(memberColorValue(map, 'b')).toBe(TEAM_MEMBER_PALETTE[2]);
  });

  it('returns the leader color for an unknown or undefined slot', () => {
    expect(memberColorValue({}, 'ghost')).toBe(TEAM_MEMBER_PALETTE[LEADER_COLOR_INDEX]);
    expect(memberColorValue({}, undefined)).toBe(TEAM_MEMBER_PALETTE[LEADER_COLOR_INDEX]);
  });

  it('correctly returns leader color when index is 0 (not treated as missing)', () => {
    expect(memberColorValue({ L: 0 }, 'L')).toBe(TEAM_MEMBER_PALETTE[0]);
  });
});
