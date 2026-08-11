// src/process/acp/session/AuthNegotiator.ts

import type { AuthMethod } from '@agentclientprotocol/sdk';
import { AcpError } from '@process/acp/errors/AcpError';
import type { AuthRequiredData } from '@process/acp/types';

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
   * Select the best auth method and authenticate via protocol.
   *
   * Follows the ACP protocol: credentials are in the child process env (set
   * during spawn), so authenticate() only sends the selected methodId.
   * If no matching credentials are found, skip authenticate entirely —
   * the agent may handle auth internally.
   */
  async authenticate(
    protocol: { authenticate(methodId: string): Promise<unknown> },
    authMethods?: AuthMethod[]
  ): Promise<void> {
    const methods = authMethods ?? [];
    if (methods.length === 0) return;

    const selected = this.selectAuthMethod(methods);
    if (!selected) {
      console.log(
        `[AuthNegotiator] No matching credentials for methods [${methods.map((m) => m.id).join(', ')}] — skipping`
      );
      return;
    }

    try {
      await protocol.authenticate(selected.id);
      console.log(`[AuthNegotiator] Authenticated with method ${selected.id}`);
    } catch (err) {
      throw new AcpError('AUTH_REQUIRED', 'Authentication required', {
        cause: err,
        retryable: true,
      });
    }
  }

  /**
   * Select the first env_var auth method whose required vars are all
   * present in the stored credentials.
   */
  private selectAuthMethod(methods: AuthMethod[]): AuthMethod | null {
    for (const method of methods) {
      if (!('type' in method) || method.type !== 'env_var') continue;
      if (!method.vars || method.vars.length === 0) continue;

      const allPresent = method.vars.every((v) => this.credentials?.[v.name]);
      if (allPresent) return method;
    }
    return null;
  }

  buildAuthRequiredData(authMethods?: AuthMethod[]): AuthRequiredData {
    return {
      agentBackend: this.agentBackend,
      methods: authMethods ?? [],
    };
  }
}
