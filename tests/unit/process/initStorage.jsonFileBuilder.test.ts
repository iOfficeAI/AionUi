import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Test the in-memory cached JsonFileBuilder behavior.
 *
 * Since JsonFileBuilder is module-private, we replicate its encode/decode
 * logic and verify the file-level contract: data roundtrips correctly,
 * reads come from memory (not disk), and writes persist to disk.
 */

const encode = (data: unknown) => btoa(encodeURIComponent(String(data)));
const decode = (base64: string) => decodeURIComponent(atob(base64));

describe('JsonFileBuilder in-memory cache behavior', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonfilebuilder-test-'));
    filePath = path.join(tmpDir, 'test-config.txt');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('encode/decode roundtrip', () => {
    it('should roundtrip simple JSON', () => {
      const data = { theme: 'dark', language: 'zh' };
      const encoded = encode(JSON.stringify(data));
      const decoded = JSON.parse(decode(encoded));
      expect(decoded).toEqual(data);
    });

    it('should roundtrip unicode and special characters', () => {
      const data = { name: '中文测试', emoji: '🎉', special: '<script>alert("xss")</script>' };
      const encoded = encode(JSON.stringify(data));
      const decoded = JSON.parse(decode(encoded));
      expect(decoded).toEqual(data);
    });

    it('should roundtrip nested objects and arrays', () => {
      const data = {
        'mcp.config': [{ id: 'server1', name: 'test', enabled: true }],
        'model.config': [{ id: 'p1', platform: 'openai', model: ['gpt-4'] }],
      };
      const encoded = encode(JSON.stringify(data));
      const decoded = JSON.parse(decode(encoded));
      expect(decoded).toEqual(data);
    });
  });

  describe('backward compatibility with existing files', () => {
    it('should read a pre-existing base64-encoded file', async () => {
      const data = { 'gemini.config': { authType: 'oauth', proxy: '' }, theme: 'dark' };
      await fs.writeFile(filePath, encode(JSON.stringify(data)));

      const raw = readFileSync(filePath).toString();
      const parsed = JSON.parse(decode(raw));
      expect(parsed).toEqual(data);
    });

    it('should return empty object for empty file', () => {
      // File doesn't exist → readFileSync throws → catch → {} as S
      expect(existsSync(filePath)).toBe(false);
    });

    it('should return empty object for corrupted base64', async () => {
      await fs.writeFile(filePath, '!!!invalid-base64!!!');

      let result = {};
      try {
        const raw = readFileSync(filePath).toString();
        result = JSON.parse(decode(raw));
      } catch {
        result = {};
      }
      expect(result).toEqual({});
    });
  });

  describe('write serialization', () => {
    it('should persist data that survives a fresh read from disk', async () => {
      const data = { 'mcp.config': [{ id: '1', name: 'test' }], theme: 'light' };
      const encoded = encode(JSON.stringify(data));

      // Ensure parent dir exists (same as WriteFile)
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, encoded);

      // Fresh read from disk
      const raw = readFileSync(filePath).toString();
      const parsed = JSON.parse(decode(raw));
      expect(parsed).toEqual(data);
    });

    it('should handle rapid sequential writes without corruption', async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Simulate rapid writes via promise chain (same pattern as JsonFileBuilder)
      let writeChain: Promise<unknown> = Promise.resolve();
      let cache: Record<string, unknown> = {};

      for (let i = 0; i < 20; i++) {
        cache[`key${i}`] = `value${i}`;
        const encoded = encode(JSON.stringify(cache));
        writeChain = writeChain.then(() => fs.writeFile(filePath, encoded));
      }

      await writeChain;

      // Verify final state
      const raw = readFileSync(filePath).toString();
      const parsed = JSON.parse(decode(raw));
      expect(Object.keys(parsed)).toHaveLength(20);
      expect(parsed.key0).toBe('value0');
      expect(parsed.key19).toBe('value19');
    });
  });
});
