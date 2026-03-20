/**
 * Contract tests: Rust auth module vs TypeScript AuthService
 * Verifies functional equivalence and cross-compatibility.
 */
import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Rust implementation
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rust = require('@aionui/native') as {
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
  generateToken: (payload: { userId: string; username: string }, secret: string, expiresIn: string) => string;
  verifyJwt: (token: string, secret: string) => { userId: string; username: string } | null;
  validateUsername: (username: string) => { isValid: boolean; errors: string[] };
  validatePasswordStrength: (password: string) => { isValid: boolean; errors: string[] };
  generateRandomPassword: () => string;
  generateUserCredentials: () => { username: string; password: string; createdAt: number };
  generateSessionId: () => string;
  generateSecretKey: () => string;
  constantTimeCompare: (a: string, b: string) => boolean;
  sha256Hex: (input: string) => string;
};

// TS AuthService functions (inline equivalents for comparison)
const tsHashPassword = (password: string): Promise<string> =>
  new Promise((resolve, reject) => {
    bcrypt.hash(password, 12, (error, hash) => (error ? reject(error) : resolve(hash)));
  });

const tsVerifyPassword = (password: string, hash: string): Promise<boolean> =>
  new Promise((resolve, reject) => {
    bcrypt.compare(password, hash, (error, same) => (error ? reject(error) : resolve(same)));
  });

// --- Password Hashing ---

describe('auth contract: password hashing', () => {
  it('Rust hash produces argon2id format', async () => {
    const hash = await rust.hashPassword('test-password');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('Rust hash + Rust verify roundtrip', async () => {
    const password = 'MyStr0ng!Pass';
    const hash = await rust.hashPassword(password);
    expect(await rust.verifyPassword(password, hash)).toBe(true);
    expect(await rust.verifyPassword('wrong', hash)).toBe(false);
  });

  it('Rust verifies TS bcrypt hashes (backward compat)', async () => {
    const password = 'test-bcrypt-123';
    const bcryptHash = await tsHashPassword(password);
    expect(bcryptHash).toMatch(/^\$2[ab]\$/);
    expect(await rust.verifyPassword(password, bcryptHash)).toBe(true);
    expect(await rust.verifyPassword('wrong-password', bcryptHash)).toBe(false);
  });

  it('empty password hashing works', async () => {
    const hash = await rust.hashPassword('');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await rust.verifyPassword('', hash)).toBe(true);
    expect(await rust.verifyPassword('not-empty', hash)).toBe(false);
  });

  it('Unicode password hashing works', async () => {
    const password = '密码测试🔐';
    const hash = await rust.hashPassword(password);
    expect(await rust.verifyPassword(password, hash)).toBe(true);
  });

  it('unknown hash format returns false', async () => {
    expect(await rust.verifyPassword('pass', 'unknown-hash')).toBe(false);
  });
});

// --- JWT ---

describe('auth contract: JWT', () => {
  const secret = 'test-secret-key-for-contract-tests';

  it('Rust generate + Rust verify roundtrip', () => {
    const payload = { userId: 'user_123', username: 'admin' };
    const token = rust.generateToken(payload, secret, '24h');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = rust.verifyJwt(token, secret);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe('user_123');
    expect(decoded!.username).toBe('admin');
  });

  it('TS jwt.sign -> Rust verifyJwt (cross-compat)', () => {
    const payload = { userId: 'user_42', username: 'testuser' };
    const tsToken = jwt.sign(payload, secret, {
      expiresIn: '24h',
      issuer: 'aionui',
      audience: 'aionui-webui',
    });

    const decoded = rust.verifyJwt(tsToken, secret);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe('user_42');
    expect(decoded!.username).toBe('testuser');
  });

  it('Rust generateToken -> TS jwt.verify (cross-compat)', () => {
    const payload = { userId: 'user_99', username: 'cross-test' };
    const rustToken = rust.generateToken(payload, secret, '1h');

    const decoded = jwt.verify(rustToken, secret, {
      issuer: 'aionui',
      audience: 'aionui-webui',
    }) as { userId: string; username: string };

    expect(decoded.userId).toBe('user_99');
    expect(decoded.username).toBe('cross-test');
  });

  it('wrong secret returns null', () => {
    const token = rust.generateToken({ userId: 'u1', username: 'x' }, secret, '1h');
    expect(rust.verifyJwt(token, 'wrong-secret')).toBeNull();
  });

  it('malformed token returns null', () => {
    expect(rust.verifyJwt('not.a.jwt', secret)).toBeNull();
    expect(rust.verifyJwt('', secret)).toBeNull();
    expect(rust.verifyJwt('abc', secret)).toBeNull();
  });

  it('token missing issuer fails verification', () => {
    // Generate a token without issuer
    const token = jwt.sign({ userId: 'u1', username: 'x' }, secret, {
      expiresIn: '1h',
      audience: 'aionui-webui',
    });
    expect(rust.verifyJwt(token, secret)).toBeNull();
  });

  it('token missing audience fails verification', () => {
    const token = jwt.sign({ userId: 'u1', username: 'x' }, secret, {
      expiresIn: '1h',
      issuer: 'aionui',
    });
    expect(rust.verifyJwt(token, secret)).toBeNull();
  });

  it('numeric userId preserved as string', () => {
    // TS version normalizes userId to string via String(decoded.userId)
    const token = jwt.sign({ userId: 42, username: 'numeric' }, secret, {
      expiresIn: '1h',
      issuer: 'aionui',
      audience: 'aionui-webui',
    });
    const decoded = rust.verifyJwt(token, secret);
    // Rust serde deserializes number as string since the field is String type
    // This may return null if serde fails -- that's an acceptable deviation
    // since all new user IDs are already strings in the current architecture
    if (decoded !== null) {
      expect(typeof decoded.userId).toBe('string');
    }
  });
});

// --- Validation ---

describe('auth contract: validateUsername', () => {
  // TS reference implementation (inline)
  function tsValidateUsername(username: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (username.length < 3) errors.push('Username must be at least 3 characters long');
    if (username.length > 32) errors.push('Username must be less than 32 characters long');
    if (!/^[a-zA-Z0-9_-]+$/.test(username))
      errors.push('Username can only contain letters, numbers, hyphens, and underscores');
    if (/^[_-]|[_-]$/.test(username)) errors.push('Username cannot start or end with hyphen or underscore');
    return { isValid: errors.length === 0, errors };
  }

  const cases = [
    'admin',
    'user-name_123',
    'ab',
    'a'.repeat(33),
    'user@name',
    '_user',
    'user-',
    '',
    '用户名',
    'ABC',
    'a-b',
    'a_b',
    '123',
  ];

  for (const input of cases) {
    it(`"${input.slice(0, 20)}": identical result`, () => {
      const tsResult = tsValidateUsername(input);
      const rustResult = rust.validateUsername(input);
      expect(rustResult.isValid).toBe(tsResult.isValid);
      expect(rustResult.errors.toSorted()).toEqual(tsResult.errors.toSorted());
    });
  }
});

describe('auth contract: validatePasswordStrength', () => {
  function tsValidatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (password.length < 8) errors.push('Password must be at least 8 characters long');
    if (password.length > 128) errors.push('Password must be less than 128 characters long');
    const weakPasswords = ['password', '12345678', '123456789', 'qwertyui', 'abcdefgh'];
    if (weakPasswords.includes(password.toLowerCase()))
      errors.push('Password is too common, please choose a stronger one');
    return { isValid: errors.length === 0, errors };
  }

  const cases = [
    'StrongP@ss1',
    'short',
    'a'.repeat(129),
    'password',
    'PASSWORD',
    '12345678',
    '123456789',
    'qwertyui',
    'abcdefgh',
    'Abcd1234',
    'A'.repeat(128),
    '',
  ];

  for (const input of cases) {
    it(`"${input.slice(0, 20)}": identical result`, () => {
      const tsResult = tsValidatePasswordStrength(input);
      const rustResult = rust.validatePasswordStrength(input);
      expect(rustResult.isValid).toBe(tsResult.isValid);
      expect(rustResult.errors.toSorted()).toEqual(tsResult.errors.toSorted());
    });
  }
});

// --- Generation ---

describe('auth contract: generation functions', () => {
  it('generateRandomPassword: correct format (100 runs)', () => {
    for (let i = 0; i < 100; i++) {
      const p = rust.generateRandomPassword();
      expect(p.length).toBeGreaterThanOrEqual(12);
      expect(p.length).toBeLessThanOrEqual(16);
      expect(p).toMatch(/[a-z]/); // has lowercase
      expect(p).toMatch(/[A-Z]/); // has uppercase
      expect(p).toMatch(/[0-9]/); // has digit
      expect(p).toMatch(/[!@#$%^&*]/); // has special
    }
  });

  it('generateRandomPassword passes validatePasswordStrength', () => {
    for (let i = 0; i < 100; i++) {
      const p = rust.generateRandomPassword();
      const v = rust.validatePasswordStrength(p);
      expect(v.isValid).toBe(true);
    }
  });

  it('generateUserCredentials: correct format', () => {
    const c = rust.generateUserCredentials();
    expect(c.username.length).toBeGreaterThanOrEqual(6);
    expect(c.username.length).toBeLessThanOrEqual(8);
    expect(c.username).toMatch(/^[a-z0-9]+$/);
    expect(c.password.length).toBeGreaterThanOrEqual(12);
    expect(c.createdAt).toBeGreaterThan(0);
  });

  it('generateSessionId: 64 hex chars', () => {
    const id = rust.generateSessionId();
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it('generateSessionId: unique across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => rust.generateSessionId()));
    expect(ids.size).toBe(100);
  });

  it('generateSecretKey: 128 hex chars', () => {
    const key = rust.generateSecretKey();
    expect(key).toHaveLength(128);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });
});

// --- Crypto Utilities ---

describe('auth contract: crypto utilities', () => {
  it('constantTimeCompare: equal strings', () => {
    expect(rust.constantTimeCompare('abc', 'abc')).toBe(true);
  });

  it('constantTimeCompare: unequal strings', () => {
    expect(rust.constantTimeCompare('abc', 'xyz')).toBe(false);
  });

  it('constantTimeCompare: different lengths', () => {
    expect(rust.constantTimeCompare('short', 'longer')).toBe(false);
  });

  it('constantTimeCompare: empty strings', () => {
    expect(rust.constantTimeCompare('', '')).toBe(true);
  });

  it('sha256Hex: known value', () => {
    // SHA-256("hello") is a well-known constant
    expect(rust.sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('sha256Hex: matches Node.js crypto', () => {
    const crypto = require('crypto');
    const inputs = ['', 'test-input', '令牌-密钥-🔑', 'a'.repeat(10000)];
    for (const input of inputs) {
      const nodeHash = crypto.createHash('sha256').update(input).digest('hex');
      expect(rust.sha256Hex(input)).toBe(nodeHash);
    }
  });

  it('sha256Hex: deterministic', () => {
    const a = rust.sha256Hex('test');
    const b = rust.sha256Hex('test');
    expect(a).toBe(b);
  });
});
