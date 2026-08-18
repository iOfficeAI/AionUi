import { describe, expect, it } from 'vitest';
import { getAdHocTeamName } from '../../../packages/desktop/src/renderer/pages/conversation/hooks/adHocTeamNaming';

describe('getAdHocTeamName', () => {
  it('keeps a meaningful source title and appends the localized fallback label', () => {
    expect(getAdHocTeamName(' Release plan ', 'Ad-hoc team')).toBe('Release plan · Ad-hoc team');
  });

  it('uses the localized fallback label when the source title is empty', () => {
    expect(getAdHocTeamName('  ', '临时团队')).toBe('临时团队');
  });
});
