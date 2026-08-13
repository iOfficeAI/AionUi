/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AIPaaS 后端服务的基础地址。
 * 多个业务模块（登录、注销、共享知识库等）共享该前缀，集中改动便于切换环境。
 */
export const AIPAAS_BASE_URL = 'http://devops.badousoft.com/aipaas-service';

const DEFAULT_EXTERNAL_LOGIN_URL = 'http://devops.badousoft.com/external-login';
const DEFAULT_EXTERNAL_LOGIN_ALLOWED_ORIGIN = 'http://devops.badousoft.com';

export const EXTERNAL_LOGIN_URL = DEFAULT_EXTERNAL_LOGIN_URL;

export const EXTERNAL_LOGIN_ALLOWED_ORIGINS: readonly string[] = [DEFAULT_EXTERNAL_LOGIN_ALLOWED_ORIGIN];
