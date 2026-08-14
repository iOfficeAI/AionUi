/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AIPaaS 后端服务的基础地址。
 * 多个业务模块（登录、注销、共享知识库等）共享此前缀，集中改动便于切换环境。
 */
export const AIPAAS_BASE_URL = 'http://devops.badousoft.com/aipaas-service';

/** External login page URL base. The system browser loads this URL during
 *  the external login flow. `aipaas-front` reads the `from` query flag and
 *  redirects to the deep link below on SSO success. */
export const EXTERNAL_LOGIN_URL_BASE = 'http://devops.badousoft.com/aipaas-front/';

/** Query string appended to the external login URL so `aipaas-front` knows
 *  to deep-link back to AionUi after SSO instead of staying on its own
 *  success page. */
export const EXTERNAL_LOGIN_FLAG = 'from=aionui';

/** Deep-link action for the auth callback. `aipaas-front` redirects here:
 *   aionui://auth/callback?token=<token>&userId=<id>&username=<name> */
export const EXTERNAL_LOGIN_DEEPLINK_PATH = 'auth/callback';

/** Maximum time (ms) the renderer waits for the deep-link callback before
 *  showing a timeout error. */
export const EXTERNAL_LOGIN_TIMEOUT_MS = 5 * 60_000;

/** Build the URL passed to shell.openExternal(). */
export function getExternalLoginUrl(): string {
  return `${EXTERNAL_LOGIN_URL_BASE}?${EXTERNAL_LOGIN_FLAG}`;
}
