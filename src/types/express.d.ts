/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AuthUser } from '../auth/repository/UserRepository';

declare global {
  namespace Express {
    interface Request {
      user?: Pick<AuthUser, 'id' | 'username'>;
      cookies?: Record<string, string>;
    }
  }
}
