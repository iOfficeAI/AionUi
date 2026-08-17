/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The WebUI access URL advertises a LAN IP so a phone/browser can reach the
// desktop. The old logic returned the first non-internal IPv4 the OS listed,
// which on a multi-NIC box picks a VPN / benchmark adapter over the real LAN.
// These tests pin pickLanIP: skip unreachable ranges, prefer real private LANs.

import { describe, it, expect } from 'vitest';
import type { networkInterfaces } from 'node:os';
import { pickLanIP } from './static-server.js';

type Nets = ReturnType<typeof networkInterfaces>;

// Minimal builder — only the fields pickLanIP reads (family/internal/address).
const iface = (address: string, internal = false) =>
  ({ family: 'IPv4' as const, internal, address }) as unknown as NonNullable<Nets[string]>[number];

describe('pickLanIP', () => {
  it('skips the RFC 2544 (198.18/15) tunnel adapter and returns the real LAN', () => {
    // The reported bug: a utility tunnel (Cloudflare WARP) was listed first.
    const nets: Nets = {
      utun3: [iface('198.18.1.0')],
      en0: [iface('192.168.2.88')],
    };
    expect(pickLanIP(nets)).toBe('192.168.2.88');
  });

  it('prefers a 192.168 LAN even when a 10/8 VPN is listed first', () => {
    const nets: Nets = {
      utun4: [iface('10.55.176.144')],
      en0: [iface('192.168.2.88')],
    };
    expect(pickLanIP(nets)).toBe('192.168.2.88');
  });

  it('ranks 192.168 > 172.16/12 > 10/8', () => {
    const nets: Nets = {
      a: [iface('10.0.0.5')],
      b: [iface('172.16.3.4')],
      c: [iface('192.168.1.10')],
    };
    expect(pickLanIP(nets)).toBe('192.168.1.10');
  });

  it('keeps OS order among equally-ranked (both 10/8) addresses', () => {
    // Physical NIC listed before the VPN — stable sort must preserve that.
    const nets: Nets = {
      en0: [iface('10.1.1.2')],
      utun4: [iface('10.55.176.144')],
    };
    expect(pickLanIP(nets)).toBe('10.1.1.2');
  });

  it('skips link-local 169.254/16', () => {
    const nets: Nets = {
      en5: [iface('169.254.10.1')],
      en0: [iface('192.168.0.20')],
    };
    expect(pickLanIP(nets)).toBe('192.168.0.20');
  });

  it('ignores loopback and IPv6', () => {
    const nets: Nets = {
      lo0: [
        iface('127.0.0.1', true),
        { family: 'IPv6', internal: true, address: '::1' } as unknown as NonNullable<Nets[string]>[number],
      ],
      en0: [iface('192.168.5.5')],
    };
    expect(pickLanIP(nets)).toBe('192.168.5.5');
  });

  it('returns null when only unreachable ranges exist (falls back to localhost upstream)', () => {
    const nets: Nets = {
      utun3: [iface('198.18.1.0')],
      lo0: [iface('127.0.0.1', true)],
    };
    expect(pickLanIP(nets)).toBeNull();
  });

  it('returns a public IPv4 only as a last resort when no private range is present', () => {
    const nets: Nets = {
      eth0: [iface('203.0.113.7')],
    };
    expect(pickLanIP(nets)).toBe('203.0.113.7');
  });
});
