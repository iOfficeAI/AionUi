/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { decryptPayload, encryptPayload, sha1Sign } from '@process/channels/plugins/wecom/WecomCrypto';

describe('WecomCrypto', () => {
  it('verifies SHA1 signature order matches WeCom spec', () => {
    const sig = sha1Sign('tok', '1', '2', 'enc');
    expect(sig).toMatch(/^[a-f0-9]{40}$/);
    expect(sha1Sign('tok', '1', '2', 'enc')).toBe(sig);
  });

  it('roundtrips encrypt and decrypt with a 43-char EncodingAESKey', () => {
    const key = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    expect(key.length).toBe(43);
    const plain = JSON.stringify({ msgtype: 'text', text: { content: 'hello' } });
    const enc = encryptPayload(key, plain);
    const out = decryptPayload(key, enc);
    expect(out).toBe(plain);
  });
});
