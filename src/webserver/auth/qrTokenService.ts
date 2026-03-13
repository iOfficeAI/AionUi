/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { networkInterfaces } from 'os';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { UserRepository } from '@/webserver/auth/repository/UserRepository';
import { AUTH_CONFIG } from '@/webserver/config/constants';

const qrTokenStore = new Map<string, { expiresAt: number; used: boolean; allowLocalOnly: boolean }>();
const QR_TOKEN_EXPIRY = 5 * 60 * 1000;

function getLanIP(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;

    for (const net of netInfo) {
      const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      if (isIPv4 && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

function isLocalIP(ip: string): boolean {
  if (!ip) return false;
  const cleanIP = ip.replace(/^::ffff:/, '');

  if (cleanIP === '127.0.0.1' || cleanIP === 'localhost' || cleanIP === '::1') return true;
  if (cleanIP.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIP)) return true;
  if (cleanIP.startsWith('192.168.')) return true;
  if (cleanIP.startsWith('169.254.')) return true;

  return false;
}

export function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [token, data] of qrTokenStore.entries()) {
    if (data.expiresAt < now || data.used) {
      qrTokenStore.delete(token);
    }
  }
}

export function createQRToken(port: number, allowRemote: boolean): { token: string; expiresAt: number; qrUrl: string } {
  cleanupExpiredTokens();

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + QR_TOKEN_EXPIRY;
  const allowLocalOnly = !allowRemote;
  qrTokenStore.set(token, { expiresAt, used: false, allowLocalOnly });

  const lanIP = getLanIP();
  const baseUrl = allowRemote && lanIP ? `http://${lanIP}:${port}` : `http://localhost:${port}`;
  const qrUrl = `${baseUrl}/qr-login?token=${token}`;

  return { token, expiresAt, qrUrl };
}

export function generateQRLoginUrlDirect(port: number, allowRemote: boolean): { qrUrl: string; expiresAt: number } {
  const { qrUrl, expiresAt } = createQRToken(port, allowRemote);
  return { qrUrl, expiresAt };
}

export async function verifyQRTokenDirect(qrToken: string, clientIP?: string): Promise<{ success: boolean; data?: { sessionToken: string; username: string }; msg?: string }> {
  try {
    const tokenData = qrTokenStore.get(qrToken);
    if (!tokenData) {
      return { success: false, msg: 'Invalid or expired QR token' };
    }

    if (Date.now() > tokenData.expiresAt) {
      qrTokenStore.delete(qrToken);
      return { success: false, msg: 'QR token has expired' };
    }

    if (tokenData.used) {
      qrTokenStore.delete(qrToken);
      return { success: false, msg: 'QR token has already been used' };
    }

    if (tokenData.allowLocalOnly && clientIP && !isLocalIP(clientIP)) {
      console.warn(`[QRTokenService] QR token rejected: non-local IP ${clientIP} attempted to use local-only token`);
      return { success: false, msg: 'QR login is only allowed from local network' };
    }

    tokenData.used = true;

    const adminUser = UserRepository.findByUsername(AUTH_CONFIG.DEFAULT_USER.USERNAME);
    if (!adminUser) {
      return { success: false, msg: 'Admin user not found' };
    }

    const sessionToken = AuthService.generateToken(adminUser);
    UserRepository.updateLastLogin(adminUser.id);
    qrTokenStore.delete(qrToken);

    return {
      success: true,
      data: {
        sessionToken,
        username: adminUser.username,
      },
    };
  } catch (error) {
    console.error('[QRTokenService] Verify QR token error:', error);
    return {
      success: false,
      msg: error instanceof Error ? error.message : 'Failed to verify QR token',
    };
  }
}
