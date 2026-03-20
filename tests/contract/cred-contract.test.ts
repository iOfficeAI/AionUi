/**
 * Contract tests: Rust vs TypeScript credential-crypto implementations
 * Verifies identical behavior for the same inputs.
 */
import { describe, expect, it } from 'vitest';

// TypeScript implementation
import * as ts from '@process/channels/utils/credentialCrypto';

// Rust implementation
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rust = require('@aionui/native') as typeof ts;

describe('credential-crypto contract: encryptString', () => {
  const cases = [
    { name: 'empty string', input: '' },
    { name: 'simple ASCII', input: 'my-secret-token' },
    { name: 'Unicode text', input: '令牌-密钥-🔑' },
    { name: 'long string', input: 'a'.repeat(10_000) },
    { name: 'special chars', input: '!@#$%^&*()_+-=[]{}|;:,.<>?' },
    { name: 'newlines and tabs', input: 'line1\nline2\ttab' },
    { name: 'JSON-like', input: '{"key":"value","nested":{"a":1}}' },
  ];

  for (const { name, input } of cases) {
    it(`${name}: identical output`, () => {
      expect(rust.encryptString(input)).toBe(ts.encryptString(input));
    });
  }
});

describe('credential-crypto contract: decryptString', () => {
  const cases = [
    { name: 'empty string', input: '' },
    { name: 'b64: prefix', input: 'b64:bXktc2VjcmV0LXRva2Vu' },
    { name: 'enc: prefix (legacy)', input: 'enc:bXktc2VjcmV0LXRva2Vu' },
    { name: 'plain: prefix', input: 'plain:my-secret-token' },
    { name: 'no prefix (legacy)', input: 'raw-legacy-value' },
    { name: 'invalid base64 b64:', input: 'b64:!!!invalid!!!' },
    { name: 'invalid base64 enc:', input: 'enc:!!!invalid!!!' },
    { name: 'b64: Unicode', input: `b64:${Buffer.from('令牌-密钥-🔑', 'utf-8').toString('base64')}` },
  ];

  for (const { name, input } of cases) {
    it(`${name}: identical output`, () => {
      expect(rust.decryptString(input)).toBe(ts.decryptString(input));
    });
  }
});

describe('credential-crypto contract: roundtrip', () => {
  const values = ['hello', 'my-secret-token', '令牌-密钥-🔑', 'a'.repeat(5000)];

  for (const val of values) {
    it(`encrypt then decrypt: "${val.slice(0, 30)}..."`, () => {
      // TS roundtrip
      const tsEncrypted = ts.encryptString(val);
      const tsDecrypted = ts.decryptString(tsEncrypted);
      // Rust roundtrip
      const rustEncrypted = rust.encryptString(val);
      const rustDecrypted = rust.decryptString(rustEncrypted);

      expect(tsDecrypted).toBe(val);
      expect(rustDecrypted).toBe(val);
      expect(rustEncrypted).toBe(tsEncrypted);
    });
  }
});

describe('credential-crypto contract: encryptCredentials', () => {
  it('with token', () => {
    const input = { token: 'abc', name: 'test', enabled: true };
    const tsResult = ts.encryptCredentials({ ...input });
    const rustResult = rust.encryptCredentials({ ...input });
    expect(rustResult).toEqual(tsResult);
  });

  it('without token', () => {
    const input = { name: 'test', api_key: '123' };
    const tsResult = ts.encryptCredentials({ ...input });
    const rustResult = rust.encryptCredentials({ ...input });
    expect(rustResult).toEqual(tsResult);
  });

  it('empty token', () => {
    const input = { token: '', name: 'test' };
    const tsResult = ts.encryptCredentials({ ...input });
    const rustResult = rust.encryptCredentials({ ...input });
    expect(rustResult).toEqual(tsResult);
  });

  it('undefined input returns nullish', () => {
    const tsResult = ts.encryptCredentials(undefined);
    const rustResult = rust.encryptCredentials(undefined);
    // TS returns undefined, Rust/napi returns null -- both are nullish.
    // All callers use `if (!credentials)` which treats both identically.
    expect(tsResult == null).toBe(true);
    expect(rustResult == null).toBe(true);
  });

  it('non-string token (number)', () => {
    const input = { token: 12345, name: 'test' } as unknown as Record<
      string,
      string | number | boolean | undefined
    >;
    const tsResult = ts.encryptCredentials({ ...input });
    const rustResult = rust.encryptCredentials({ ...input });
    expect(rustResult).toEqual(tsResult);
  });
});

describe('credential-crypto contract: decryptCredentials', () => {
  it('roundtrip with token', () => {
    const original = { token: 'my-secret', name: 'test', enabled: true };
    const tsEncrypted = ts.encryptCredentials({ ...original });
    const rustEncrypted = rust.encryptCredentials({ ...original });

    const tsDecrypted = ts.decryptCredentials(tsEncrypted);
    const rustDecrypted = rust.decryptCredentials(rustEncrypted);

    expect(tsDecrypted).toEqual(original);
    expect(rustDecrypted).toEqual(original);
  });

  it('undefined input returns nullish', () => {
    const tsResult = ts.decryptCredentials(undefined);
    const rustResult = rust.decryptCredentials(undefined);
    // TS returns undefined, Rust/napi returns null -- both are nullish.
    expect(tsResult == null).toBe(true);
    expect(rustResult == null).toBe(true);
  });
});

describe('credential-crypto contract: isEncryptionAvailable', () => {
  it('same result', () => {
    expect(rust.isEncryptionAvailable()).toBe(ts.isEncryptionAvailable());
  });
});
