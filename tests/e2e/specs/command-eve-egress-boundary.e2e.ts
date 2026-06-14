/**
 * Command EVE Egress Boundary – packaged GUI E2E.
 *
 * Drives the real Command EVE chat UI and verifies sensitive text sent through
 * the visible EVE path produces a fresh egress-boundary receipt before model
 * egress. This is the native-binding proof: UI → EVE/Hermes path → local
 * runtime shim → receipt.
 */
import { test, expect } from '../fixtures';
import { goToGuid, sendMessageFromGuid } from '../helpers';
import { invokeBridge } from '../helpers/bridge/invoke';

type RuntimeStatusResponse = {
  success?: boolean;
  msg?: string;
  data?: RuntimeStatus;
};

type RuntimeStatus = {
  status?: string;
  default_model?: string;
  next_action?: string;
  model_warmup?: {
    status?: string;
    model?: string;
    error?: string;
  };
  egress_boundary?: {
    decision?: string;
    observed_at?: string;
    finding_count?: number;
    policy_action?: string;
    receipt_path?: string;
  };
};

async function commandEveRuntimeStatus(page: Parameters<typeof invokeBridge>[0]): Promise<RuntimeStatusResponse> {
  const response = await invokeBridge<RuntimeStatusResponse>(page, 'command-eve.runtime-status', undefined, 15_000);
  return response;
}

function isRuntimeReady(status: RuntimeStatus | undefined): boolean {
  return status?.status === 'ready' && Boolean(status.default_model);
}

function isDefaultModelWarm(status: RuntimeStatus | undefined): boolean {
  return Boolean(
    isRuntimeReady(status) &&
    status?.model_warmup?.status === 'ready' &&
    status.model_warmup.model === status.default_model
  );
}

async function ensureCommandEveRuntimeReady(page: Parameters<typeof invokeBridge>[0]): Promise<RuntimeStatus> {
  const initial = await commandEveRuntimeStatus(page);
  if (initial.success && isDefaultModelWarm(initial.data)) return initial.data;

  const ensured = await invokeBridge<RuntimeStatusResponse>(
    page,
    'command-eve.ensure-local-model-tier',
    { tierId: 'e4b' },
    180_000
  );
  const status = ensured.data;
  if (ensured.success && isDefaultModelWarm(status)) return status;

  const warmed = await invokeBridge<RuntimeStatusResponse>(
    page,
    'command-eve.warm-local-model',
    { tierId: 'e4b' },
    180_000
  );
  if (warmed.success && isDefaultModelWarm(warmed.data)) return warmed.data;

  test.skip(
    true,
    `Command EVE runtime not ready: ${
      warmed.msg ||
      warmed.data?.model_warmup?.error ||
      warmed.data?.next_action ||
      ensured.msg ||
      status?.next_action ||
      initial.msg ||
      initial.data?.next_action ||
      'unknown'
    }`
  );
  throw new Error('unreachable after test.skip');
}

test.describe('Command EVE egress boundary', () => {
  test.setTimeout(240_000);

  test('blocks sensitive data from the real EVE GUI chat path and writes a fresh receipt', async ({ page }) => {
    const rendererLogs: string[] = [];
    page.on('console', (message) => {
      rendererLogs.push(`[${message.type()}] ${message.text()}`);
      if (rendererLogs.length > 100) rendererLogs.shift();
    });
    page.on('pageerror', (error) => {
      rendererLogs.push(`[pageerror] ${error.message}`);
      if (rendererLogs.length > 100) rendererLogs.shift();
    });

    await page.waitForSelector('body', { state: 'visible' });
    const readyStatus = await ensureCommandEveRuntimeReady(page);
    const previousObservedAt = readyStatus.egress_boundary?.observed_at ?? '';

    await goToGuid(page);

    const syntheticSecret =
      'E2E boundary proof: api_key=sk-e2etestboundary1234567890 and address Musterstraße 12, phone +49 30 12345678.';
    let conversationId: string;
    try {
      conversationId = await sendMessageFromGuid(page, syntheticSecret);
    } catch (error) {
      console.log(`[Command EVE E2E renderer logs]\n${rendererLogs.join('\n')}`);
      throw error;
    }
    expect(conversationId).toBeTruthy();

    await expect
      .poll(
        async () => {
          const response = await commandEveRuntimeStatus(page);
          const boundary = response.data?.egress_boundary;
          if (!boundary) return null;
          if (!boundary.observed_at || boundary.observed_at === previousObservedAt) return null;
          return boundary;
        },
        {
          timeout: 90_000,
          message: 'Waiting for a fresh Command EVE egress-boundary receipt from the GUI chat path',
        }
      )
      .toMatchObject({
        decision: 'block',
        policy_action: 'block',
      });

    const response = await commandEveRuntimeStatus(page);
    expect(response.success).toBe(true);
    expect(response.data?.egress_boundary?.decision).toBe('block');
    expect(response.data?.egress_boundary?.finding_count ?? 0).toBeGreaterThanOrEqual(2);
    expect(response.data?.egress_boundary?.receipt_path).toContain('last-egress-boundary-receipt.json');
  });
});
