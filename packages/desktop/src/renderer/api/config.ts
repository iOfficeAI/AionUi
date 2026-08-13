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

/**
 * External login page URL. The hidden BrowserWindow loads this URL during
 * the external login flow. The deployed external system is at
 * http://localhost:8910/ in this environment.
 */
export const EXTERNAL_LOGIN_URL = 'http://localhost:8910/';

/**
 * Maximum time (ms) we wait for the external page to call
 * window.aionuiAuth.postToken() before destroying the login window and
 * rejecting the in-flight login Promise.
 */
export const EXTERNAL_LOGIN_TIMEOUT_MS = 5 * 60_000;
