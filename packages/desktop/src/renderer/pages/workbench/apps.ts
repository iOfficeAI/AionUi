/**
 * Workbench application list.
 *
 * Edit this file to add or remove applications shown in the workbench page.
 * To switch to dynamic loading later (e.g. from a JSON file in the user data
 * directory), replace the `WORKBENCH_APPS` export with a loader that returns
 * the same `WorkbenchApp` shape.
 */

export interface WorkbenchApp {
  /** Unique stable id used as the React key. */
  id: string;
  /** Display name (English fallback). Localize via `workbench.apps.<id>` keys when needed. */
  name: string;
  /** Optional one-line description shown under the name. */
  description?: string;
  /** Base URL opened when the user clicks the app card. The current token is appended as `?Token=...`. */
  url: string;
  /**
   * Extra query params appended to `url` before the token. Values are URL-encoded automatically.
   * Use this when an app needs a stable identifier alongside the token (e.g. tenant, source).
   */
  extraParams?: Record<string, string>;
}

export const WORKBENCH_APPS: WorkbenchApp[] = [
  {
    id: 'badou-cloud',
    name: '八斗云',
    description: '八斗云项目管理中心',
    url: 'http://pm.badousoft.com/center',
  },
  {
    id: 'ksp',
    name: 'KSP',
    description: 'KSP 协同平台',
    url: 'http://ksp.badousoft.com/',
  },
  {
    id: 'cas',
    name: '统一认证',
    description: '八斗统一身份认证',
    url: 'https://cloud.badousoft.com/cas/login',
  },
  {
    id: 'aipaas',
    name: 'aiPass 平台',
    description: '本地 aiPass 服务',
    url: 'http://localhost:8910/',
  },
];
