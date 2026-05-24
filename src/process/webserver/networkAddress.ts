/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { networkInterfaces, type NetworkInterfaceInfo } from 'os';

type NetworkInterfaceMap = ReturnType<typeof networkInterfaces>;

function isIPv4Interface(net: NetworkInterfaceInfo): boolean {
  return net.family === 'IPv4' || (net.family as unknown) === 4;
}

function parseIPv4(address: string): number[] | null {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isTailscaleAddress(address: string): boolean {
  const parts = parseIPv4(address);
  return Boolean(parts && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

function isPrivateAddress(address: string): boolean {
  const parts = parseIPv4(address);
  if (!parts) return false;

  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

function isLinkLocalAddress(address: string): boolean {
  const parts = parseIPv4(address);
  return Boolean(parts && parts[0] === 169 && parts[1] === 254);
}

function scoreRemoteAddress(interfaceName: string, address: string): number {
  const normalizedName = interfaceName.toLowerCase();

  if (isLinkLocalAddress(address)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (normalizedName.includes('tailscale') || isTailscaleAddress(address)) {
    return 1000;
  }

  let score = 0;

  if (isPrivateAddress(address)) {
    score += 100;
  }

  if (/^(wi-?fi|wlan|ethernet|en\d+|eth\d+)/i.test(interfaceName)) {
    score += 50;
  }

  if (address.startsWith('192.168.')) {
    score += 30;
  } else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(address)) {
    score += 20;
  } else if (address.startsWith('10.')) {
    score += 10;
  } else {
    score += 5;
  }

  if (/(vpn|virtual|anyconnect|vmware|hyper-v|vbox|bluetooth)/i.test(interfaceName)) {
    score -= 40;
  }

  return score;
}

export function selectPreferredRemoteAddress(nets: NetworkInterfaceMap): string | null {
  const candidates: Array<{ address: string; order: number; score: number }> = [];
  let order = 0;

  for (const name of Object.keys(nets)) {
    const netInfo = nets[name];
    if (!netInfo) continue;

    for (const net of netInfo) {
      if (!isIPv4Interface(net) || net.internal) {
        continue;
      }

      const score = scoreRemoteAddress(name, net.address);
      if (score === Number.NEGATIVE_INFINITY) {
        continue;
      }

      candidates.push({ address: net.address, order, score });
      order += 1;
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  return candidates[0]?.address ?? null;
}

export function getPreferredRemoteAddress(): string | null {
  return selectPreferredRemoteAddress(networkInterfaces());
}
