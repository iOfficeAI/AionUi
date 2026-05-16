import { uuid } from '@/src/utils/uuid';

describe('uuid', () => {
  describe('with crypto.getRandomValues available', () => {
    it('returns a string of the default length (8)', () => {
      const id = uuid();
      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[0-9a-f]+$/);
    });

    it('returns a string of custom length', () => {
      const id = uuid(16);
      expect(id).toHaveLength(16);
      expect(id).toMatch(/^[0-9a-f]+$/);
    });

    it('returns a string of length 1', () => {
      const id = uuid(1);
      expect(id).toHaveLength(1);
    });

    it('generates unique values', () => {
      const ids = new Set(Array.from({ length: 100 }, () => uuid()));
      expect(ids.size).toBe(100);
    });
  });

  describe('fallback path (no crypto)', () => {
    const originalCrypto = globalThis.crypto;

    beforeEach(() => {
      // Remove crypto to force fallback
      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        writable: true,
        configurable: true,
      });
    });

    it('returns a string of the requested length', () => {
      const id = uuid(8);
      expect(id).toHaveLength(8);
      expect(typeof id).toBe('string');
    });

    it('returns unique values via counter increment', () => {
      const a = uuid(12);
      const b = uuid(12);
      expect(a).not.toBe(b);
    });
  });
});
