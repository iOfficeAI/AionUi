import { describe, expect, it } from 'vitest';

import { getLoginRedirectUrl, isLoginRoute } from '../../src/common/adapter/browserNavigation';

describe('browserNavigation', () => {
  it('builds a hash-router login redirect url', () => {
    expect(getLoginRedirectUrl({ origin: 'http://192.168.184.130:25809' })).toBe(
      'http://192.168.184.130:25809/#/login'
    );
  });

  it('recognizes both pathname and hash login routes', () => {
    expect(isLoginRoute({ pathname: '/login', hash: '' })).toBe(true);
    expect(isLoginRoute({ pathname: '/', hash: '#/login' })).toBe(true);
    expect(isLoginRoute({ pathname: '/', hash: '#/guid' })).toBe(false);
  });
});
