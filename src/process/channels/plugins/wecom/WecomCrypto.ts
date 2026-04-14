/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';

/**
 * WeCom AI Bot / callback crypto (AES-256-CBC + SHA1 signature).
 * Matches Enterprise WeChat encrypted callback specification.
 */
export function sha1Sign(token: string, timestamp: string, nonce: string, encrypted: string): string {
  const sorted = [token, String(timestamp), String(nonce), encrypted].toSorted();
  return crypto.createHash('sha1').update(sorted.join('')).digest('hex');
}

function decodePkcs7(buffer: Buffer): Buffer {
  const pad = buffer[buffer.length - 1];
  if (pad < 1 || pad > 32) {
    throw new Error('Invalid PKCS7 padding');
  }
  return buffer.subarray(0, buffer.length - pad);
}

function encodePkcs7(buffer: Buffer): Buffer {
  const blockSize = 32;
  const padLen = blockSize - (buffer.length % blockSize || blockSize);
  const pad = Buffer.alloc(padLen, padLen);
  return Buffer.concat([buffer, pad]);
}

export function decryptPayload(encodingAesKey: string, encrypted: string): string {
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  const iv = aesKey.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  const raw = decodePkcs7(decrypted);
  const body = raw.subarray(16);
  const len = body.subarray(0, 4).readUInt32BE(0);
  return body.subarray(4, 4 + len).toString('utf8');
}

export function encryptPayload(encodingAesKey: string, plainText: string): string {
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  const iv = aesKey.subarray(0, 16);
  const random16 = crypto.randomBytes(16);
  const message = Buffer.from(plainText);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(message.length, 0);
  const encoded = encodePkcs7(Buffer.concat([random16, len, message]));
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(encoded), cipher.final()]).toString('base64');
}
