/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ChannelServiceScope = 'channel' | 'plugin' | 'shared';

const DEFAULT_RESOLVE_ORDER: readonly ChannelServiceScope[] = ['channel', 'plugin', 'shared'];

type InternalServiceEntry<T = unknown> = {
  key: string;
  implementation: T;
  owner: string;
  scope: ChannelServiceScope;
  priority: number;
  registeredAt: number;
};

export interface IChannelServiceRegistration<T = unknown> {
  key: string;
  implementation: T;
  owner: string;
  scope?: ChannelServiceScope;
  priority?: number;
}

export interface IChannelServiceResolveOptions {
  requesterOwner?: string;
  resolveOrder?: readonly ChannelServiceScope[];
}

export interface IChannelPluginServiceRegistry {
  register<T>(
    key: string,
    implementation: T,
    options?: {
      scope?: Extract<ChannelServiceScope, 'plugin' | 'shared'>;
      priority?: number;
    }
  ): () => void;
  resolve<T>(key: string, options?: Omit<IChannelServiceResolveOptions, 'requesterOwner'>): T | undefined;
  unregister(key: string): boolean;
}

export interface IChannelMessageServiceContract {
  sendMessage: (
    sessionId: string,
    conversationId: string,
    message: string,
    onStream: (message: import('@/common/chat/chatLib').TMessage, isInsert: boolean) => void
  ) => Promise<string>;
  confirm: (conversationId: string, callId: string, value: string) => Promise<void>;
}

/**
 * ChannelServiceRegistry
 *
 * Public interface layer for channel plugins.
 * - Supports service registration by channel core and plugins
 * - Resolves services with channel-first priority by default
 * - Provides owner-scoped plugin registry facade for safe registration
 */
export class ChannelServiceRegistry {
  private services = new Map<string, InternalServiceEntry[]>();

  register<T>(registration: IChannelServiceRegistration<T>): () => void {
    const key = registration.key.trim();
    if (!key) {
      throw new Error('ChannelServiceRegistry: service key is required');
    }

    const owner = registration.owner.trim();
    if (!owner) {
      throw new Error('ChannelServiceRegistry: owner is required');
    }

    const entry: InternalServiceEntry<T> = {
      key,
      implementation: registration.implementation,
      owner,
      scope: registration.scope ?? 'shared',
      priority: registration.priority ?? 0,
      registeredAt: Date.now(),
    };

    const bucket = this.services.get(key) ?? [];
    bucket.push(entry as InternalServiceEntry);
    this.services.set(key, bucket);

    return () => {
      this.unregisterOne(key, owner, entry.registeredAt);
    };
  }

  resolve<T>(key: string, options?: IChannelServiceResolveOptions): T | undefined {
    const entries = this.services.get(key);
    if (!entries || entries.length === 0) {
      return undefined;
    }

    const order = (
      options?.resolveOrder && options.resolveOrder.length > 0 ? options.resolveOrder : DEFAULT_RESOLVE_ORDER
    ) as readonly ChannelServiceScope[];
    const scopeRank = new Map<ChannelServiceScope, number>();
    order.forEach((scope, index) => {
      scopeRank.set(scope, index);
    });

    const requesterOwner = options?.requesterOwner;

    const sorted = [...entries].toSorted((a, b) => {
      const aRank = scopeRank.get(a.scope) ?? Number.MAX_SAFE_INTEGER;
      const bRank = scopeRank.get(b.scope) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) {
        return aRank - bRank;
      }

      if (requesterOwner) {
        const aOwnerRank = a.owner === requesterOwner ? 0 : 1;
        const bOwnerRank = b.owner === requesterOwner ? 0 : 1;
        if (aOwnerRank !== bOwnerRank) {
          return aOwnerRank - bOwnerRank;
        }
      }

      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }

      return b.registeredAt - a.registeredAt;
    });

    return sorted[0]?.implementation as T | undefined;
  }

  unregister(key: string, owner?: string): boolean {
    const entries = this.services.get(key);
    if (!entries || entries.length === 0) {
      return false;
    }

    if (!owner) {
      this.services.delete(key);
      return true;
    }

    const filtered = entries.filter((entry) => entry.owner !== owner);
    if (filtered.length === entries.length) {
      return false;
    }

    if (filtered.length === 0) {
      this.services.delete(key);
      return true;
    }

    this.services.set(key, filtered);
    return true;
  }

  unregisterOwner(owner: string): number {
    let removed = 0;

    for (const [key, entries] of this.services.entries()) {
      const filtered = entries.filter((entry) => entry.owner !== owner);
      removed += entries.length - filtered.length;
      if (filtered.length === 0) {
        this.services.delete(key);
      } else if (filtered.length !== entries.length) {
        this.services.set(key, filtered);
      }
    }

    return removed;
  }

  clear(): void {
    this.services.clear();
  }

  createPluginRegistry(owner: string): IChannelPluginServiceRegistry {
    const normalizedOwner = owner.trim();
    if (!normalizedOwner) {
      throw new Error('ChannelServiceRegistry: plugin owner is required');
    }

    return {
      register: (key, implementation, options) =>
        this.register({
          key,
          implementation,
          owner: normalizedOwner,
          scope: options?.scope ?? 'plugin',
          priority: options?.priority ?? 0,
        }),
      resolve: (key, options) =>
        this.resolve(key, {
          requesterOwner: normalizedOwner,
          resolveOrder: options?.resolveOrder,
        }),
      unregister: (key) => this.unregister(key, normalizedOwner),
    };
  }

  private unregisterOne(key: string, owner: string, registeredAt: number): void {
    const entries = this.services.get(key);
    if (!entries || entries.length === 0) {
      return;
    }

    const index = entries.findIndex((entry) => entry.owner === owner && entry.registeredAt === registeredAt);
    if (index < 0) {
      return;
    }

    entries.splice(index, 1);
    if (entries.length === 0) {
      this.services.delete(key);
      return;
    }

    this.services.set(key, entries);
  }
}
