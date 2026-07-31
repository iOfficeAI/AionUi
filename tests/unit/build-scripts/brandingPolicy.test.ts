import { describe, expect, it } from 'vitest';
import { auditBranding, containsForbiddenPromotion, containsOldBrandInValue } from './brandingAudit.mjs';

describe('CSBU WorkMate branding audit', () => {
  it('accepts the repository branding policy', () => {
    expect(auditBranding()).toEqual([]);
  });

  it('detects an old product name in nested locale values', () => {
    expect(containsOldBrandInValue({ nested: ['AionUi'] })).toBe(true);
    expect(containsOldBrandInValue({ nested: ['Aion', 'Aion Assistant', 'Aion CLI'] })).toBe(true);
    expect(containsOldBrandInValue({ nested: ['AionCore', 'AionHub'] })).toBe(true);
    expect(containsOldBrandInValue({ nested: ['CSBU WorkMate'] })).toBe(false);
  });

  it('detects affiliate and contributor-campaign content', () => {
    expect(containsForbiddenPromotion('https://vendor.example/register?aff=aionui')).toBe(true);
    expect(containsForbiddenPromotion('Internal deployment documentation')).toBe(false);
  });
});
