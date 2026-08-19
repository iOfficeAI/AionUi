/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PM center (badou PM) base URL. Hard-coded per project preference.
 * Independent domain from AIPAAS — no shared auth, but the renderer reuses
 * its `useAuth().user.token` as the bearer/header for read access.
 */
export const PM_CENTER_BASE_URL = 'http://pm.badousoft.com/';

/** Endpoint path for the user's task list. */
export const TASK_CENTER_LIST_PATH = '/platform/jdbc/common/basecommonlist/listJSON.do';

/** Query param identifying the dataset. */
export const TASK_CENTER_MD_CODE = 'y_project_task_mine';

/** Total timeout for the list request, in ms. */
export const TASK_CENTER_TIMEOUT_MS = 15_000;

/** Default page size. */
export const TASK_CENTER_DEFAULT_PER_PAGE_SIZE = 30;

/** Build the full list URL with query params appended. */
export const buildTaskCenterListUrl = (params: {
  urgency: number | 'all';
  projectId: string | 'all';
  type: number | 'all';
  keyword: string;
}): string => {
  const search = new URLSearchParams({ mdCode: TASK_CENTER_MD_CODE });
  if (params.urgency !== 'all') search.set('urgency', String(params.urgency));
  if (params.projectId !== 'all') search.set('projectId', params.projectId);
  if (params.type !== 'all') search.set('type', String(params.type));
  if (params.keyword) search.set('keyword', params.keyword);
  return `${PM_CENTER_BASE_URL}${TASK_CENTER_LIST_PATH}?${search.toString()}`;
};
