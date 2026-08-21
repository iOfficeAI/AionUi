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
//export const AIPAAS_BASE_URL = 'http://localhost:8081';

/** External login page URL base. The system browser loads this URL during
 *  the external login flow. `aipaas-front` reads the `from` query flag and
 *  redirects to the deep link below on SSO success. */
export const EXTERNAL_LOGIN_URL_BASE = 'http://devops.badousoft.com/aipaas-front/';
//export const EXTERNAL_LOGIN_URL_BASE = 'http://localhost:8910/';

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

/** Hash-route prefix for the external "new knowledge base" page.
 *  Path and query string are vendor-defined; only the host (EXTERNAL_LOGIN_URL_BASE)
 *  needs to vary between environments. */
const KNOWLEDGE_BASE_CREATE_PATH = '/#/module/tree/edit/ai_knowledge_user/add';
const KNOWLEDGE_BASE_CREATE_PARENT_NAME = '知识库目录';
const KNOWLEDGE_BASE_CREATE_PARENT_ID = 'ROOT';

function encodeQueryParam(value: string): string {
  return encodeURIComponent(encodeURIComponent(JSON.stringify(JSON.parse(value))));
}

function encodeRawQueryParam(rawJson: string): string {
  return encodeURIComponent(encodeURIComponent(rawJson));
}

/** Build the external URL for creating a personal knowledge base.
 *  Mirrors the query shape used by the vendor's create page; values are
 *  double-encoded JSON so the receiving app can decode them once and parse. */
export function getKnowledgeBaseCreateUrl(): string {
  return buildKnowledgeBaseEditUrl(null);
}

/** Build the external URL for editing an existing personal knowledge base.
 *  The vendor route embeds the base id in the path segment; query params
 *  mirror the create page so the parent-node context is preserved. */
export function getKnowledgeBaseEditUrl(id: string): string {
  return buildKnowledgeBaseEditUrl(id);
}

function buildKnowledgeBaseEditUrl(id: string | null): string {
  const addFormData = JSON.stringify({
    parentId: KNOWLEDGE_BASE_CREATE_PARENT_ID,
    parentName: KNOWLEDGE_BASE_CREATE_PARENT_NAME,
  });
  const backParams = '{}';
  const currentTreeNodeData = JSON.stringify({
    code: null,
    treeLevel: 0,
    name: KNOWLEDGE_BASE_CREATE_PARENT_NAME,
    type: null,
    id: KNOWLEDGE_BASE_CREATE_PARENT_ID,
    pid: null,
    children: null,
    hasChild: false,
    priority: 0,
    isexpand: true,
  });
  const params = [
    `addFormData=${encodeQueryParam(addFormData)}`,
    `backParams=${encodeRawQueryParam(backParams)}`,
    `currentTreeNodeData=${encodeRawQueryParam(currentTreeNodeData)}`,
  ].join('&');
  const pathSuffix = id ? `/${id}` : '';
  return `${EXTERNAL_LOGIN_URL_BASE.replace(/\/$/, '')}${KNOWLEDGE_BASE_CREATE_PATH}${pathSuffix}?${params}`;
}
