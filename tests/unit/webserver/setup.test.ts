import express from 'express';
import { describe, expect, it } from 'vitest';
import { setupBasicMiddleware } from '../../../src/process/webserver/setup';

describe('setupBasicMiddleware', () => {
  it('trusts only local and private proxy hops by default', () => {
    const app = express();

    setupBasicMiddleware(app);

    expect(app.get('trust proxy')).toBe('loopback, linklocal, uniquelocal');
  });
});
