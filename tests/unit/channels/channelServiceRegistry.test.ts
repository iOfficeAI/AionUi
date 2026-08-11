/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ChannelServiceRegistry } from '@process/channels/core/ChannelServiceRegistry';

describe('ChannelServiceRegistry', () => {
  it('resolves services with channel-first priority by default', () => {
    const registry = new ChannelServiceRegistry();
    const sharedImpl = { source: 'shared' };
    const pluginImpl = { source: 'plugin' };
    const channelImpl = { source: 'channel' };

    registry.register({
      key: 'message.send',
      owner: 'shared-owner',
      scope: 'shared',
      implementation: sharedImpl,
    });

    registry.register({
      key: 'message.send',
      owner: 'plugin-owner',
      scope: 'plugin',
      implementation: pluginImpl,
    });

    registry.register({
      key: 'message.send',
      owner: 'channel-core',
      scope: 'channel',
      implementation: channelImpl,
    });

    const resolved = registry.resolve<{ source: string }>('message.send');
    expect(resolved).toEqual(channelImpl);
  });

  it('prefers requester-owned plugin service when scope and priority match', () => {
    const registry = new ChannelServiceRegistry();
    const ownerA = 'plugin-a';
    const ownerB = 'plugin-b';

    registry.register({
      key: 'session.store',
      owner: ownerA,
      scope: 'plugin',
      implementation: { owner: ownerA },
    });

    registry.register({
      key: 'session.store',
      owner: ownerB,
      scope: 'plugin',
      implementation: { owner: ownerB },
    });

    const resolvedForB = registry.resolve<{ owner: string }>('session.store', {
      requesterOwner: ownerB,
    });

    expect(resolvedForB?.owner).toBe(ownerB);
  });

  it('plugin facade registers with plugin scope and unregisters by owner', () => {
    const registry = new ChannelServiceRegistry();
    const pluginRegistry = registry.createPluginRegistry('plugin-c');

    pluginRegistry.register('feature.toggle', { enabled: true });
    expect(registry.resolve<{ enabled: boolean }>('feature.toggle')?.enabled).toBe(true);

    const removed = pluginRegistry.unregister('feature.toggle');
    expect(removed).toBe(true);
    expect(registry.resolve('feature.toggle')).toBeUndefined();
  });

  it('unregisterOwner removes all services from the owner', () => {
    const registry = new ChannelServiceRegistry();

    registry.register({
      key: 'one',
      owner: 'plugin-d',
      scope: 'plugin',
      implementation: 1,
    });
    registry.register({
      key: 'two',
      owner: 'plugin-d',
      scope: 'shared',
      implementation: 2,
    });
    registry.register({
      key: 'one',
      owner: 'channel-core',
      scope: 'channel',
      implementation: 3,
    });

    const removedCount = registry.unregisterOwner('plugin-d');
    expect(removedCount).toBe(2);
    expect(registry.resolve<number>('one')).toBe(3);
    expect(registry.resolve<number>('two')).toBeUndefined();
  });
});
