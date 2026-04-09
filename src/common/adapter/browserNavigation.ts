/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type LoginRouteLocation = Pick<Location, 'pathname' | 'hash'>;
type LoginRedirectLocation = Pick<Location, 'origin'>;

export function isLoginRoute(location: LoginRouteLocation): boolean {
  return location.pathname === '/login' || location.hash.includes('/login');
}

export function getLoginRedirectUrl(location: LoginRedirectLocation): string {
  return `${location.origin}/#/login`;
}
