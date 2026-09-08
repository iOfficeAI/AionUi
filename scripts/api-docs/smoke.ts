import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { chromium, expect } from '@playwright/test';

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    channel: { type: 'string' },
    out: { type: 'string', default: '.workspace/api-docs-smoke' },
  },
  strict: true,
});
if (!values.url) throw new Error('--url is required (the local api:docs --serve URL)');
const url = new URL(values.url);
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Use the loopback documentation server');
await mkdir(values.out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(values.channel ? { channel: values.channel } : {}) });
try {
  const page = await browser.newPage();
  const pageErrors: string[] = [];
  const unexpectedRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const target = new URL(request.url());
    if (target.origin !== url.origin || target.pathname.startsWith('/api/')) unexpectedRequests.push(request.url());
  });
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /AionUi 客户端接口参考/ }).first()).toBeVisible();
  await expect(page.getByText('Ask AI', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Developer Tools', { exact: true })).toHaveCount(0);
  const documentResponse = await page.request.get(new URL('openapi.json', url).toString());
  expect(documentResponse.status()).toBe(200);
  const document = await documentResponse.json();
  const firstPath = Object.keys(document.paths)[0];
  if (firstPath) await expect(page.getByText(firstPath, { exact: false }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
  await page.screenshot({ path: path.join(values.out, 'scalar.png'), fullPage: false });
  console.log(
    JSON.stringify({
      url: url.toString(),
      operations: Object.keys(document.paths).length,
      pageErrors,
      unexpectedRequests,
      screenshot: path.resolve(values.out, 'scalar.png'),
    })
  );
} finally {
  await browser.close();
}
