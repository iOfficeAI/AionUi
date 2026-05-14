import { describe, expect, it } from 'vitest';

import { SECURITY_CONFIG } from '@process/webserver/config/constants';

describe('webui content security policy', () => {
  it('allows localhost service health probes from the browser UI', () => {
    const localScheme = 'http';
    const localProbeOrigins = ['127.0.0.1', 'localhost'].map((host) => `${localScheme}://${host}:*`);

    for (const policy of [SECURITY_CONFIG.HEADERS.CSP_DEV, SECURITY_CONFIG.HEADERS.CSP_PROD]) {
      expect(policy).toContain('connect-src');
      for (const origin of localProbeOrigins) {
        expect(policy).toContain(origin);
      }
    }
  });
});
