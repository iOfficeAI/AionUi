import { describe, expect, it } from 'vitest';

import { SECURITY_CONFIG } from '@process/webserver/config/constants';

describe('webui content security policy', () => {
  it('allows localhost service health probes from the browser UI', () => {
    for (const policy of [SECURITY_CONFIG.HEADERS.CSP_DEV, SECURITY_CONFIG.HEADERS.CSP_PROD]) {
      expect(policy).toContain('connect-src');
      expect(policy).toContain('http://127.0.0.1:*');
      expect(policy).toContain('http://localhost:*');
    }
  });
});
