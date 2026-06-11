/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@office-ai/platform';
import { buildCommandCenterReadModel } from '@process/commandEve/commandCenterReadModelCore';
import { buildConnectorCatalog } from '@process/commandEve/connectorCatalogCore';
import { runConnectorPreflight } from '@process/commandEve/connectorPreflightCore';
import {
  buildKanbanMarketingBoard,
  createKanbanMarketingProofCard,
  runKanbanPreflight,
} from '@process/commandEve/kanbanPreflightCore';
import { buildLocalRuntimeStatus } from '@process/commandEve/localRuntimeStatusCore';
import { buildSkillLibrary } from '@process/commandEve/skillLibraryCore';
import { getDataPath } from '@process/utils/utils';

export function initCommandEveBridge(): void {
  bridge.buildProvider('command-eve.command-center-read-model').provider(async (request?: { maxRuns?: number }) => {
    try {
      const result = await buildCommandCenterReadModel({ maxRuns: request?.maxRuns });
      return {
        success: result.ok,
        msg: result.ok ? undefined : result.reason_code || result.message,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE read-model bridge failed.',
        data: {
          version: 'command-eve-command-center-read-model/v0',
          ok: false,
          status: 'failed',
          reason_code: 'COMMAND_CENTER_BRIDGE_FAILED',
          message: error instanceof Error ? error.message : 'Command EVE read-model bridge failed.',
          source: {
            generated_by: 'company-os-read-model-cli',
          },
        },
      };
    }
  });

  bridge.buildProvider('command-eve.connector-catalog').provider(async (request?: { manifestPath?: string }) => {
    try {
      const result = buildConnectorCatalog({ manifestPath: request?.manifestPath });
      return {
        success: result.ok,
        msg: result.ok ? undefined : result.reason_code || result.message,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE connector catalog bridge failed.',
        data: {
          version: 'command-eve-connector-catalog/v0',
          ok: false,
          status: 'failed',
          reason_code: 'CONNECTOR_CATALOG_BRIDGE_FAILED',
          message: error instanceof Error ? error.message : 'Command EVE connector catalog bridge failed.',
          source: {
            generated_by: 'command-eve-connector-catalog-core',
          },
        },
      };
    }
  });

  bridge
    .buildProvider('command-eve.connector-preflight')
    .provider(async (request?: { connectorId?: string; manifestPath?: string }) => {
      try {
        const result = runConnectorPreflight({
          connectorId: request?.connectorId || '',
          manifestPath: request?.manifestPath,
        });
        return {
          success: result.ok,
          msg: result.ok ? undefined : result.reason_code || result.message,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE connector preflight bridge failed.',
          data: {
            version: 'command-eve-connector-preflight/v0',
            ok: false,
            status: 'failed',
            reason_code: 'CONNECTOR_PREFLIGHT_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : 'Command EVE connector preflight bridge failed.',
          },
        };
      }
    });

  bridge
    .buildProvider('command-eve.skill-library')
    .provider(async (request?: { runtimeReconciliationPath?: string; capabilityPackPath?: string }) => {
      try {
        const result = buildSkillLibrary({
          userDataPath: getDataPath(),
          runtimeReconciliationPath: request?.runtimeReconciliationPath,
          capabilityPackPath: request?.capabilityPackPath,
        });
        return {
          success: result.ok,
          msg: result.ok ? undefined : result.reason_code || result.message,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE skill library bridge failed.',
          data: {
            version: 'command-eve-skill-library/v0',
            ok: false,
            status: 'failed',
            reason_code: 'SKILL_LIBRARY_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : 'Command EVE skill library bridge failed.',
            source: {
              generated_by: 'command-eve-skill-library-core',
            },
          },
        };
      }
    });

  bridge
    .buildProvider('command-eve.local-runtime-status')
    .provider(async (request?: { manifestPath?: string; receiptPath?: string }) => {
      try {
        const result = buildLocalRuntimeStatus({
          userDataPath: getDataPath(),
          manifestPath: request?.manifestPath,
          receiptPath: request?.receiptPath,
        });
        return {
          success: result.ok,
          msg: result.ok ? undefined : result.reason_code || result.message,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE local runtime status bridge failed.',
          data: {
            version: 'command-eve-local-runtime-status/v0',
            ok: false,
            status: 'failed',
            reason_code: 'LOCAL_RUNTIME_STATUS_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : 'Command EVE local runtime status bridge failed.',
            source: {
              generated_by: 'command-eve-local-runtime-status-core',
            },
          },
        };
      }
    });

  bridge.buildProvider('command-eve.kanban-preflight').provider(async (request?: { boardSlug?: string }) => {
    try {
      const result = runKanbanPreflight({
        userDataPath: getDataPath(),
        boardSlug: request?.boardSlug,
      });
      return {
        success: result.ok,
        msg: result.ok ? undefined : result.reason_code || result.message,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE Kanban preflight bridge failed.',
        data: {
          version: 'command-eve-kanban-preflight/v0',
          ok: false,
          status: 'failed',
          reason_code: 'KANBAN_PREFLIGHT_BRIDGE_FAILED',
          message: error instanceof Error ? error.message : 'Command EVE Kanban preflight bridge failed.',
          source: {
            generated_by: 'command-eve-kanban-preflight-core',
          },
        },
      };
    }
  });

  bridge.buildProvider('command-eve.kanban-marketing-board').provider(async (request?: { boardSlug?: string }) => {
    try {
      const result = buildKanbanMarketingBoard({
        userDataPath: getDataPath(),
        boardSlug: request?.boardSlug,
      });
      return {
        success: result.ok,
        msg: result.ok ? undefined : result.reason_code || result.message,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE marketing Kanban bridge failed.',
        data: {
          version: 'command-eve-kanban-marketing-board/v0',
          ok: false,
          status: 'failed',
          reason_code: 'KANBAN_MARKETING_BOARD_BRIDGE_FAILED',
          message: error instanceof Error ? error.message : 'Command EVE marketing Kanban bridge failed.',
          source: {
            generated_by: 'command-eve-kanban-marketing-board-core',
            hermes_home: '',
          },
        },
      };
    }
  });

  bridge
    .buildProvider('command-eve.kanban-marketing-proof-card')
    .provider(async (request?: { boardSlug?: string; eventLedgerPath?: string }) => {
      try {
        const result = createKanbanMarketingProofCard({
          userDataPath: getDataPath(),
          boardSlug: request?.boardSlug,
          eventLedgerPath: request?.eventLedgerPath,
        });
        return {
          success: result.ok,
          msg: result.ok ? undefined : result.reason_code || result.message,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE marketing proof-card bridge failed.',
          data: {
            version: 'command-eve-kanban-marketing-proof-card/v0',
            ok: false,
            status: 'failed',
            reason_code: 'KANBAN_MARKETING_PROOF_CARD_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : 'Command EVE marketing proof-card bridge failed.',
            source: {
              generated_by: 'command-eve-kanban-marketing-board-core',
              hermes_home: '',
            },
          },
        };
      }
    });
}
