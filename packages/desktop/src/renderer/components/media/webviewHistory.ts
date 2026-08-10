/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 记录最近由 WebviewHost 内部触发的导航地址，用来识别 url prop 的「回声」。
 *
 * 背景：浏览器 tab 会把「当前地址」当作 url prop 回传给 WebviewHost，于是每次内部
 * 导航都会形成回环（内部导航 → onUrlChange → 父组件更新 prop → 重置）。如果无条件
 * 重置，每次导航后都会被当成「换了预览目标」而重新加载，页面状态全丢。
 *
 * 为什么要记「一组」而不是「最后一个」：重定向链会连续触发多次 did-navigate，
 * A→B 之后只记得 B，此时 A 的回声才姗姗来迟，就会被误判成外部换址而把地址设回 A，
 * 于是 A→B→A 无限跳转，直到渲染进程崩溃。
 *
 * Remembers addresses recently navigated to from inside WebviewHost so the `url`
 * prop's echo can be recognised.
 *
 * Context: a browser tab feeds its current address back down to WebviewHost as the
 * `url` prop, so every internal navigation forms a loop (internal nav → onUrlChange
 * → parent updates prop → reset). Resetting unconditionally would treat each of its
 * own navigations as "the preview target changed" and reload, losing page state.
 *
 * Why a *set* rather than just the last target: a redirect chain fires did-navigate
 * several times in a row. After A→B only B is remembered, so when A's echo finally
 * arrives it looks external, the address is set back to A, the redirect runs again,
 * and A→B→A ping-pongs until the renderer process dies.
 */
export class InternalNavTracker {
  private readonly recent: string[] = [];

  /** 同时在途的回声不会太多，够覆盖一条重定向链即可 / plenty for one redirect chain */
  private static readonly MAX_TRACKED = 10;

  /** 记录一次内部导航 / record a navigation initiated from inside the host */
  record(url: string): void {
    if (!url) return;
    const existing = this.recent.indexOf(url);
    if (existing !== -1) this.recent.splice(existing, 1);
    this.recent.push(url);
    if (this.recent.length > InternalNavTracker.MAX_TRACKED) this.recent.shift();
  }

  /**
   * 这个 url prop 是内部导航的回声吗？是则消耗掉该记录并返回 true。
   *
   * Is this `url` prop the echo of an internal navigation? Consumes the entry and
   * returns true when so.
   */
  consumeEcho(url: string): boolean {
    const index = this.recent.indexOf(url);
    if (index === -1) return false;
    this.recent.splice(index, 1);
    return true;
  }

  /** 外部换址（换 tab / 换预览文件）后清空 / clear after an external address change */
  clear(): void {
    this.recent.length = 0;
  }
}

/**
 * 判断 url prop 的变化是否应该清空自管的前进/后退历史。
 *
 * Decide whether a change to the `url` prop should clear the self-managed
 * back/forward history.
 *
 * @param incomingUrl 新的 url prop 值 / the new `url` prop value
 * @param tracker 内部导航记录 / the internal-navigation tracker
 * @returns true 表示这是外部换址、应当重置 / true when this is an external change and a reset is due
 */
export const shouldResetHistoryForUrlProp = (incomingUrl: string, tracker: InternalNavTracker): boolean => {
  // prop 只是内部导航绕回来的回声 → 保留历史
  // The prop is merely the echo of an internal navigation → keep history.
  return !tracker.consumeEcho(incomingUrl);
};
