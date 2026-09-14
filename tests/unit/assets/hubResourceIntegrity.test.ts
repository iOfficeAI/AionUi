import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { verifyHubResources } = require('../../../scripts/prepareHubResources.js') as {
  verifyHubResources: () => unknown;
};

describe('hub resource integrity', () => {
  it('verifies the pinned index and every bundled extension archive', () => {
    expect(() => verifyHubResources()).not.toThrow();
  });
});
