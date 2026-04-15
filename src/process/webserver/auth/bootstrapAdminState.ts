/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

let initialAdminPassword: string | null = null;

export function getInitialAdminPassword(): string | null {
  return initialAdminPassword;
}

export function setInitialAdminPassword(password: string): void {
  initialAdminPassword = password;
}

export function clearInitialAdminPassword(): void {
  initialAdminPassword = null;
}
