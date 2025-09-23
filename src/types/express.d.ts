/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { User } from '../database';

declare global {
  namespace Express {
    interface Request {
      user?: Pick<User, 'id' | 'username'>;
    }
  }
}
