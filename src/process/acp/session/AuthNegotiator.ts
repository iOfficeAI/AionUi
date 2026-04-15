// src/process/acp/session/AuthNegotiator.ts

import type { AuthMethod, AuthRequiredData } from '../types';
import type { RawAuthMethod } from './types';
import { AcpError } from '../errors/AcpError';

export class AuthNegotiator {
  private credentials: Record<string, string> | null = null;

  constructor(private readonly agentBackend: string) {}

  get hasCredentials(): boolean {
    return this.credentials !== null && Object.keys(this.credentials).length > 0;
  }

  mergeCredentials(creds: Record<string, string>): void {
    this.credentials = { ...this.credentials, ...creds };
  }

  getCredentials(): Record<string, string> | undefined {
    return this.credentials ?? undefined;
  }

  /**
   * Attempt authentication via protocol.
   * Throws AcpError('AUTH_REQUIRED') on failure with AuthRequiredData.
   */
  async authenticate(
    protocol: { authenticate(creds?: Record<string, string>): Promise<unknown> },
    authMethods?: RawAuthMethod[],
  ): Promise<void> {
    try {
      await protocol.authenticate(this.credentials ?? undefined);
    } catch (err) {
      const data = this.buildAuthRequiredData(authMethods);
      throw new AcpError('AUTH_REQUIRED', 'Authentication required', {
        cause: err,
        retryable: true,
      });
    }
  }

  buildAuthRequiredData(authMethods?: RawAuthMethod[]): AuthRequiredData {
    return {
      agentBackend: this.agentBackend,
      methods: this.buildAuthMethods(authMethods ?? []),
    };
  }

  buildAuthMethods(raw: RawAuthMethod[]): AuthMethod[] {
    return raw.map((m) => {
      switch (m.type) {
        case 'env_var':
          return {
            type: 'env_var' as const,
            id: m.id,
            name: m.name,
            description: m.description,
            fields: m.fields ?? [],
          };
        case 'terminal':
          return {
            type: 'terminal' as const,
            id: m.id,
            name: m.name,
            description: m.description,
            command: m.command ?? '',
            args: m.args,
            env: m.env,
          };
        case 'agent':
          return {
            type: 'agent' as const,
            id: m.id,
            name: m.name,
            description: m.description,
          };
        default:
          return { type: 'agent' as const, id: m.id, name: m.name };
      }
    });
  }
}
