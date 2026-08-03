/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Message anchor rail — E2E tests on a real conversation page.
 *
 * The rail pins one tick per user message to the chat area's left edge. The whole
 * rail is one hover target: the pointer only needs to enter the column and the
 * nearest tick is selected, so these tests drive the real DOM — seed a multi-turn
 * history through the test-only stream injector, then assert ticks render, that
 * hovering *anywhere* in the rail selects a tick, and that clicking jumps.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { findAssistantIdForBackend, goToGuid } from '../../helpers';

type StreamRegistry = {
  controllers: Record<
    string,
    {
      runScenario: (options?: { historyPairs?: number; lines?: number; seedHistoryOnly?: boolean }) => Promise<void>;
    }
  >;
};

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';
const SEEDED_HISTORY_PAIRS = 6;
/**
 * Long enough to overflow the rail on the short window these tests use, so the
 * scroll-instead-of-compress behaviour is exercised for real.
 */
const LONG_HISTORY_PAIRS = 50;
/**
 * Wide enough that the chat column clears the gutter threshold even after the app
 * sidebar takes its share — the default E2E window does not.
 */
const WIDE_VIEWPORT_WIDTH = 1500;

function createFakeClaudeConversation(id: string, assistantId: string) {
  return {
    id,
    name: `E2E AnchorRail ${id}`,
    assistant: { id: assistantId },
    extra: {
      workspace: '/tmp',
      custom_workspace: true,
      session_mode: 'default',
    },
  };
}

async function createConversation(page: Page, conversationId: string): Promise<string> {
  await goToGuid(page);
  // The rail renders from injected messages alone, so an installed (not
  // necessarily online) assistant is enough to open a conversation page.
  const assistantId = await findAssistantIdForBackend(page, 'claude');
  test.skip(!assistantId, 'No available Claude assistant for anchor rail conversation');
  if (!assistantId) return '';

  return page.evaluate(
    async ({ conversation }) => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      if (!port) {
        throw new Error('window.__backendPort is not available in renderer context');
      }

      const response = await fetch(`http://127.0.0.1:${port}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversation),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`POST /api/conversations failed (${response.status}): ${body}`);
      }

      const json = (await response.json()) as { data?: { id?: string } };
      const id = json?.data?.id;
      if (!id) {
        throw new Error('POST /api/conversations succeeded but did not return a conversation id');
      }
      return id;
    },
    { conversation: createFakeClaudeConversation(conversationId, assistantId) }
  );
}

async function removeConversation(page: Page, conversationId: string): Promise<void> {
  await page.evaluate(
    async ({ id }) => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      if (!port) return;
      await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    },
    { id: conversationId }
  );
}

async function openConversationPage(page: Page, targetConversationId: string): Promise<void> {
  await page.evaluate(
    ({ conversationId, storageKey }) => {
      window.sessionStorage.setItem(storageKey, conversationId);
    },
    { conversationId: targetConversationId, storageKey: ENABLED_CONVERSATION_KEY }
  );
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/conversation/${targetConversationId}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="message-list-scroller"]', { timeout: 30_000 });
}

async function waitForStreamController(page: Page, targetConversationId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
        .__AIONUI_E2E_MESSAGE_STREAM__;
      return Boolean(registry?.controllers[id]);
    },
    targetConversationId,
    { timeout: 15_000 }
  );
}

async function seedHistory(page: Page, targetConversationId: string, historyPairs: number): Promise<void> {
  await page.evaluate(
    async ({ conversationId, pairs }) => {
      const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
        .__AIONUI_E2E_MESSAGE_STREAM__;
      const controller = registry?.controllers[conversationId];
      if (!controller) {
        throw new Error(`No E2E stream controller registered for conversation ${conversationId}`);
      }
      await controller.runScenario({ historyPairs: pairs, seedHistoryOnly: true });
    },
    { conversationId: targetConversationId, pairs: historyPairs }
  );
}

test.describe('Message anchor rail', () => {
  test.describe.configure({ timeout: 180_000 });

  let conversationId = '';
  let defaultViewport: { width: number; height: number } | null = null;

  test.beforeEach(async ({ page }) => {
    conversationId = await createConversation(page, `e2e-anchor-rail-${Date.now()}`);
    if (!conversationId) return;

    // The rail only exists when the chat column is wide enough to have a side
    // gutter. The default E2E window leaves the column at ~654px — narrower than
    // the gutter threshold — because the app sidebar takes its share, so widen the
    // window for these tests rather than assert against a column that has no
    // gutter to host the rail.
    defaultViewport = page.viewportSize();
    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height: defaultViewport?.height ?? 900 });

    await openConversationPage(page, conversationId);
    await waitForStreamController(page, conversationId);
    await seedHistory(page, conversationId, SEEDED_HISTORY_PAIRS);
  });

  test.afterEach(async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
    }
    if (defaultViewport) {
      await page.setViewportSize(defaultViewport);
      defaultViewport = null;
    }
    if (conversationId) {
      await removeConversation(page, conversationId);
      conversationId = '';
    }
  });

  test('renders one tick per user message on the chat area left edge', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const ticks = page.locator('[data-testid="message-anchor-tick"]');
    // The injector seeds `historyPairs` user/assistant pairs plus one trailing
    // user prompt, so the rail must expose a tick for every user message.
    await expect(ticks).toHaveCount(SEEDED_HISTORY_PAIRS + 1, { timeout: 15_000 });

    // The rail lives on the left edge of the chat column, not the right.
    const railBox = await rail.boundingBox();
    const scrollerBox = await page.locator('[data-testid="message-list-scroller"]').boundingBox();
    expect(railBox).not.toBeNull();
    expect(scrollerBox).not.toBeNull();
    if (railBox && scrollerBox) {
      expect(railBox.x).toBeLessThan(scrollerBox.x + scrollerBox.width / 2);
    }
  });

  test('hovering anywhere in the rail selects the nearest tick and previews it', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const railBox = await rail.boundingBox();
    // Target the first tick's row, but aim at the rail column rather than the tick
    // itself — that is the whole point of the magnet behaviour: a 2px line must not
    // be the hit target.
    const firstTickBox = await page.locator('[data-testid="message-anchor-tick"]').first().boundingBox();
    expect(railBox).not.toBeNull();
    expect(firstTickBox).not.toBeNull();
    if (!railBox || !firstTickBox) return;

    await page.mouse.move(railBox.x + railBox.width / 2, firstTickBox.y + firstTickBox.height / 2);

    const preview = page.locator('[data-testid="message-anchor-preview"]');
    await expect(preview).toBeVisible({ timeout: 10_000 });
    // Exactly one tick is lifted, and it is the selection the card describes.
    const active = page.locator('[data-testid="message-anchor-tick"][data-anchor-active="true"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('data-anchor-index', '1');

    // The card is intentionally spare: the seeded question and its reply, nothing
    // else. No turn counter and no "click to jump" hint.
    await expect(preview).toContainText('User seed message 1');
    await expect(preview).toContainText('Assistant seed reply 1');
  });

  test('selection follows the pointer as it scrubs down the rail', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const railBox = await rail.boundingBox();
    const ticks = page.locator('[data-testid="message-anchor-tick"]');
    const firstTickBox = await ticks.first().boundingBox();
    const lastTickBox = await ticks.last().boundingBox();
    expect(railBox).not.toBeNull();
    expect(firstTickBox).not.toBeNull();
    expect(lastTickBox).not.toBeNull();
    if (!railBox || !firstTickBox || !lastTickBox) return;

    const activeIndexAt = async (clientY: number): Promise<string | null> => {
      await page.mouse.move(railBox.x + railBox.width / 2, clientY);
      const active = page.locator('[data-testid="message-anchor-tick"][data-anchor-active="true"]');
      await expect(active).toHaveCount(1, { timeout: 5_000 });
      return active.getAttribute('data-anchor-index');
    };

    // Near the top of the stack the first turn wins; near the bottom, the last.
    const topIndex = await activeIndexAt(firstTickBox.y + firstTickBox.height / 2);
    const bottomIndex = await activeIndexAt(lastTickBox.y + lastTickBox.height / 2);

    expect(topIndex).toBe('1');
    expect(bottomIndex).toBe(String(SEEDED_HISTORY_PAIRS + 1));
  });

  test('clicking the rail scrolls the chat to the selected message', async ({ page }) => {
    const scroller = page.locator('[data-testid="message-list-scroller"]');
    await expect(scroller).toBeVisible({ timeout: 15_000 });

    // Start from the bottom of a tall conversation so a jump to turn 1 must move.
    await page.evaluate(() => {
      const element = document.querySelector<HTMLDivElement>('[data-testid="message-list-scroller"]');
      if (element) element.scrollTop = element.scrollHeight;
    });
    await page.waitForTimeout(200);

    const scrollTopBefore = await scroller.evaluate((element) => element.scrollTop);
    expect(scrollTopBefore).toBeGreaterThan(0);

    const rail = page.locator('[data-testid="message-anchor-rail"]');
    const firstTickBox = await page.locator('[data-testid="message-anchor-tick"]').first().boundingBox();
    const railBox = await rail.boundingBox();
    expect(railBox).not.toBeNull();
    expect(firstTickBox).not.toBeNull();
    if (!railBox || !firstTickBox) return;

    // Click the rail column beside the first tick, not the tick itself.
    await page.mouse.move(railBox.x + railBox.width / 2, firstTickBox.y + firstTickBox.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    await expect
      .poll(async () => scroller.evaluate((element) => element.scrollTop), { timeout: 10_000 })
      .toBeLessThan(scrollTopBefore);
  });

  test('opens the search panel from the rail', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const search = page.locator('[data-testid="message-anchor-rail-search"]');
    await expect(search).toBeVisible();

    await search.click();

    // The panel is owned by the header but opened by the rail's request.
    await expect(page.locator('.conversation-minimap-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.conversation-minimap-search-input')).toBeVisible();
  });

  test('keeps the header search trigger alongside the rail entry', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    // The rail adds a second, shallower way in; it does not take the header's
    // trigger away. Both entries stay mounted so search is reachable either way.
    await expect(page.locator('[data-testid="message-anchor-rail-search"]')).toBeVisible();
    await expect(page.locator('.conversation-minimap-trigger')).toHaveCount(1);

    const height = page.viewportSize()?.height ?? 900;

    // ...and the header keeps it even once the rail steps aside, so narrowing the
    // column can never leave search unreachable.
    await page.setViewportSize({ width: 900, height });
    await expect(rail).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('.chat-layout-header')).toBeVisible();
    await expect(page.locator('.conversation-minimap-trigger')).toHaveCount(1, { timeout: 10_000 });

    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height });
    await expect(rail).toBeVisible({ timeout: 10_000 });
  });

  test('steps aside when the chat column is too narrow to host it', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const height = page.viewportSize()?.height ?? 900;

    // A preview/workspace split (or just a small window) squeezes the chat column
    // below the width at which it grows a side gutter. With no gutter the rail
    // would sit on top of the message text, so it must disappear instead.
    await page.setViewportSize({ width: 560, height });
    await expect(rail).toBeHidden({ timeout: 10_000 });

    // ...and come back once there is room again.
    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height });
    await expect(rail).toBeVisible({ timeout: 10_000 });
  });

  test('keeps tick spacing comfortable and scrolls a long conversation instead of compressing', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    // Measure the comfortable stride the short seeded history renders at, so the
    // long-conversation assertions compare against the real thing rather than a
    // number copied out of the stylesheet.
    const strideBefore = await page.evaluate(() => {
      const ticks = [...document.querySelectorAll('[data-testid="message-anchor-tick"]')];
      const a = ticks[0]?.getBoundingClientRect();
      const b = ticks[1]?.getBoundingClientRect();
      return a && b ? b.top - a.top : 0;
    });
    expect(strideBefore).toBeGreaterThan(0);

    // Now pile on a long history on a deliberately short window: the old build
    // squeezed the gap to fit and then clipped the overflow, which left the tail
    // of the conversation unreachable.
    const height = 620;
    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height });
    await seedHistory(page, conversationId, LONG_HISTORY_PAIRS);
    // The count is whatever the injector's ids dedupe to; assert it grew well past
    // what the rail can show rather than predicting an exact total.
    const ticks = page.locator('[data-testid="message-anchor-tick"]');
    await expect.poll(async () => ticks.count(), { timeout: 20_000 }).toBeGreaterThan(SEEDED_HISTORY_PAIRS + 1);

    const viewport = page.locator('[data-testid="message-anchor-rail-zone"]');
    await expect(viewport).toHaveAttribute('data-scrollable', 'true', { timeout: 10_000 });

    const geometry = await page.evaluate(() => {
      const zone = document.querySelector('[data-testid="message-anchor-rail-zone"]') as HTMLElement | null;
      const ticks = [...document.querySelectorAll('[data-testid="message-anchor-tick"]')];
      const a = ticks[0]?.getBoundingClientRect();
      const b = ticks[1]?.getBoundingClientRect();
      return {
        stride: a && b ? b.top - a.top : 0,
        canScroll: zone ? zone.scrollHeight > zone.clientHeight : false,
        // The stack must not spill out of its own scroll host.
        overflows: zone ? zone.scrollWidth > zone.clientWidth + 1 : false,
      };
    });

    // Spacing is fixed: a long conversation must not squeeze the ticks together.
    expect(geometry.stride).toBeCloseTo(strideBefore, 1);
    expect(geometry.canScroll).toBe(true);
    expect(geometry.overflows).toBe(false);
  });

  test('keeps the last tick of a long conversation reachable by scrolling the rail', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    const height = 620;
    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height });
    await seedHistory(page, conversationId, LONG_HISTORY_PAIRS);

    const ticks = page.locator('[data-testid="message-anchor-tick"]');
    await expect.poll(async () => ticks.count(), { timeout: 20_000 }).toBeGreaterThan(SEEDED_HISTORY_PAIRS + 1);

    const viewport = page.locator('[data-testid="message-anchor-rail-zone"]');
    await expect(viewport).toHaveAttribute('data-scrollable', 'true', { timeout: 10_000 });

    const total = await ticks.count();

    // Scroll the rail to its end, the way a user reaching for an early message would.
    await viewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    // The very last tick must now be inside the viewport and hoverable — this is
    // the regression: it used to be painted outside the rail and unselectable.
    const lastTick = ticks.nth(total - 1);
    const inView = await lastTick.evaluate((tick) => {
      const zone = tick.closest('[data-testid="message-anchor-rail-zone"]') as HTMLElement;
      const t = tick.getBoundingClientRect();
      const z = zone.getBoundingClientRect();
      return t.top >= z.top - 1 && t.bottom <= z.bottom + 1;
    });
    expect(inView).toBe(true);

    // Aim at the rail column on the last tick's row, not the tick itself: ticks are
    // deliberately not pointer targets — the magnet is what makes a 2px line usable.
    const railBox = await rail.boundingBox();
    const lastBox = await lastTick.boundingBox();
    expect(railBox).not.toBeNull();
    expect(lastBox).not.toBeNull();
    if (!railBox || !lastBox) return;

    await page.mouse.move(railBox.x + railBox.width / 2, lastBox.y + lastBox.height / 2);

    await expect(page.locator('[data-testid="message-anchor-preview"]')).toBeVisible({ timeout: 10_000 });
    await expect(lastTick).toHaveAttribute('data-anchor-active', 'true', { timeout: 10_000 });
  });

  test('shows a "more this way" hint only while that direction has anchors left', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height: 620 });
    await seedHistory(page, conversationId, LONG_HISTORY_PAIRS);

    const viewport = page.locator('[data-testid="message-anchor-rail-zone"]');
    await expect(viewport).toHaveAttribute('data-scrollable', 'true', { timeout: 20_000 });

    const upHint = page.locator('[data-testid="message-anchor-rail-more-up"]');
    const downHint = page.locator('[data-testid="message-anchor-rail-more-down"]');

    // Pinned to the top: nothing above, more below.
    await viewport.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(upHint).toHaveCount(0, { timeout: 10_000 });
    await expect(downHint).toBeVisible();

    // Somewhere in the middle: both directions have anchors left.
    await viewport.evaluate((element) => {
      element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) / 2);
    });
    await expect(upHint).toBeVisible({ timeout: 10_000 });
    await expect(downHint).toBeVisible();

    // Scrolled to the end: the "down" hint must disappear rather than lie.
    await viewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(downHint).toHaveCount(0, { timeout: 10_000 });
    await expect(upHint).toBeVisible();
  });

  test('keeps hover selection under a stationary pointer while the rail scrolls', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height: 620 });
    await seedHistory(page, conversationId, LONG_HISTORY_PAIRS);

    const viewport = page.locator('[data-testid="message-anchor-rail-zone"]');
    await expect(viewport).toHaveAttribute('data-scrollable', 'true', { timeout: 20_000 });

    const zoneBox = await viewport.boundingBox();
    expect(zoneBox).not.toBeNull();
    if (!zoneBox) return;

    // Start from the top so there is room to scroll down. The rail auto-follows the
    // newest turn, which otherwise leaves it pinned at the bottom with nowhere to go.
    await viewport.evaluate((element) => {
      element.scrollTop = 0;
    });

    // Park the pointer mid-rail and confirm something is selected.
    const pointerX = zoneBox.x + zoneBox.width / 2;
    const pointerY = zoneBox.y + zoneBox.height / 2;
    await page.mouse.move(pointerX, pointerY);

    const active = page.locator('[data-testid="message-anchor-tick"][data-anchor-active="true"]');
    await expect(active).toHaveCount(1, { timeout: 10_000 });
    const before = await active.getAttribute('data-anchor-index');
    await expect(page.locator('[data-testid="message-anchor-preview"]')).toBeVisible();

    // Scroll without moving the pointer. A different tick is now underneath it, so
    // the selection must move to that tick instead of scrolling out of view.
    const scrolled = await viewport.evaluate((element) => {
      const start = element.scrollTop;
      element.scrollBy({ top: 160 });
      return element.scrollTop !== start;
    });
    expect(scrolled).toBe(true);

    await expect(active).toHaveCount(1, { timeout: 10_000 });
    await expect.poll(async () => active.getAttribute('data-anchor-index'), { timeout: 10_000 }).not.toBe(before);

    // The preview card stays on screen, describing the newly-selected anchor.
    const card = page.locator('[data-testid="message-anchor-preview"]');
    await expect(card).toBeVisible();
    const cardVisible = await card.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    });
    expect(cardVisible).toBe(true);
  });

  test('keeps the search button clear of the scroll hint and aligned to the tick column', async ({ page }) => {
    const rail = page.locator('[data-testid="message-anchor-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: WIDE_VIEWPORT_WIDTH, height: 620 });
    await seedHistory(page, conversationId, LONG_HISTORY_PAIRS);

    const viewport = page.locator('[data-testid="message-anchor-rail-zone"]');
    await expect(viewport).toHaveAttribute('data-scrollable', 'true', { timeout: 20_000 });

    // Mid-scroll is the only state where the "more above" hint renders, and that is
    // exactly where it used to collide with the magnifier.
    await viewport.evaluate((element) => {
      element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) / 2);
    });
    await expect(page.locator('[data-testid="message-anchor-rail-more-up"]')).toBeVisible({ timeout: 10_000 });

    const geometry = await page.evaluate(() => {
      const railEl = document.querySelector('[data-testid="message-anchor-rail"]');
      const buttonEl = document.querySelector('[data-testid="message-anchor-rail-search"]');
      const glyphEl = buttonEl?.querySelector('svg');
      const hintDotEl = document.querySelector('[data-testid="message-anchor-rail-more-up"] span');
      const tickEl = document.querySelector('[data-testid="message-anchor-tick"]');
      if (!railEl || !buttonEl || !glyphEl || !hintDotEl || !tickEl) return null;

      const button = buttonEl.getBoundingClientRect();
      const glyph = glyphEl.getBoundingClientRect();
      const hint = hintDotEl.getBoundingClientRect();
      const tick = tickEl.getBoundingClientRect();
      const centre = (box: DOMRect) => (box.left + box.right) / 2;

      return {
        // Vertical: the hint must start below the button, not on top of it.
        gapButtonToHint: hint.top - button.bottom,
        // Horizontal: glyph and ticks must share one axis.
        glyphOffsetFromTicks: centre(glyph) - centre(tick),
        hintOffsetFromTicks: centre(hint) - centre(tick),
      };
    });

    expect(geometry).not.toBeNull();
    if (!geometry) return;

    // No overlap, and enough space that they read as separate marks.
    expect(geometry.gapButtonToHint).toBeGreaterThan(0);
    expect(geometry.gapButtonToHint).toBeGreaterThanOrEqual(2);

    // The magnifier sits on the tick column's axis rather than jutting out to the
    // right of the stack. Sub-pixel rounding only.
    expect(Math.abs(geometry.glyphOffsetFromTicks)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.hintOffsetFromTicks)).toBeLessThanOrEqual(1);
  });
});
