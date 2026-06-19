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
  buildCrmOverlay,
  captureCrmConsentLocal,
  changeCrmDealStageLocal,
  createCrmDraftDeal,
  initializeCrmOverlay,
} from '@process/commandEve/crmOverlayCore';
import {
  activateEntitlement,
  getEntitlementStatus,
  readRegistration,
  registerTenant,
  COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
} from '@process/commandEve/entitlementCore';
import { runDesktopAuthLoopback, type DesktopAuthIntent } from '@process/commandEve/desktopAuthLoopback';
import {
  hasAccountSession,
  readAccountSession,
  revokeAndClearSession,
} from '@process/commandEve/accountSessionAtRest';
import {
  activateEntitlementFromSession,
  silentResumeAccountAuth,
} from '@process/commandEve/accountAuthOrchestratorCore';
import {
  applyKanbanMarketingCardAction,
  approveKanbanMarketingOutput,
  buildKanbanMarketingBoard,
  checkKanbanMarketingWorkerStartGate,
  createKanbanMarketingCard,
  createKanbanMarketingProofCard,
  generateKanbanMarketingDraft,
  moveKanbanMarketingCard,
  planKanbanMarketingCardDispatch,
  prepareKanbanMarketingWorkerDispatcher,
  promoteKanbanMarketingWorkerExecutor,
  recordKanbanMarketingDispatchApproval,
  recordKanbanMarketingDispatchDecision,
  requestKanbanMarketingWorkerDispatch,
  runKanbanMarketingWorkerObserved,
  runKanbanPreflight,
} from '@process/commandEve/kanbanPreflightCore';
import { buildLocalRuntimeStatus } from '@process/commandEve/localRuntimeStatusCore';
import { buildSkillLibrary } from '@process/commandEve/skillLibraryCore';
import { buildCommandEveStatusSurface } from '@process/commandEve/statusSurfaceCore';
import { hasLicenseWire, readLicenseWire, storeLicenseWire } from '@/common/config/licenseWireAtRest';
import {
  buildEveInferenceProvider,
  isEveInferenceSelection,
  parseEveTierIdFromSelection,
  type EveInferenceTierId,
} from '@/common/config/eveInferenceCore';
import { getCommandEveLocalRuntimeProvider } from '@/common/config/commandEveShell';
import { CREDITS_STATUS_FUNCTION_URL, type CreditsTier } from '@/common/config/creditsCore';
import { ProcessConfig } from '@process/utils/initStorage';
import { getDataPath } from '@process/utils/utils';

/** Version tag mirrored onto every credits bridge result (ipcBridge contract). */
const COMMAND_EVE_CREDITS_BRIDGE_VERSION = 'command-eve-credits/v0' as const;

/**
 * A SELF-QUIET zero-status returned when the credits-status backend is not
 * reachable pre-deploy (no license wire, or the Edge Function is absent / errors).
 * `ok:false` keeps the renderer meter quiet (it renders nothing) instead of
 * crashing the chrome. The persisted spend cap is still merged in so a cap the
 * user already set survives an offline read.
 */
function quietCreditsStatus(spendCapEurCents: number, reasonCode: string, message?: string) {
  return {
    version: COMMAND_EVE_CREDITS_BRIDGE_VERSION,
    ok: false,
    reason_code: reasonCode,
    message,
    tier: 'free' as CreditsTier,
    included_allowance_credits_remaining: 0,
    purchased_credits_remaining: 0,
    spend_cap_eur_cents: Math.max(0, spendCapEurCents),
    free_actions_used_this_period: 0,
    free_cap: 0,
    period_start: '',
  };
}

type CommandEveStatusSurfaceRequest = { maxRuns?: number; companyOsRoot?: string; eventLedgerPath?: string };
type CommandEveBridgeEnvelope<T> = { data?: T };

function unwrapBridgeRequest<T>(request?: T | CommandEveBridgeEnvelope<T>): T | undefined {
  if (request && typeof request === 'object' && 'data' in request) {
    return (request as CommandEveBridgeEnvelope<T>).data;
  }
  return request as T | undefined;
}

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

  bridge
    .buildProvider('command-eve.status-surface')
    .provider(
      async (request?: CommandEveStatusSurfaceRequest | CommandEveBridgeEnvelope<CommandEveStatusSurfaceRequest>) => {
        const payload = unwrapBridgeRequest<CommandEveStatusSurfaceRequest>(request);
        try {
          const result = await buildCommandEveStatusSurface({
            maxRuns: payload?.maxRuns,
            companyOsRoot: payload?.companyOsRoot,
            eventLedgerPath: payload?.eventLedgerPath,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg: error instanceof Error ? error.message : 'Command EVE status surface bridge failed.',
            data: {
              version: 'command-eve-status-surface-bridge/v0',
              ok: false,
              status: 'failed',
              reason_code: 'STATUS_SURFACE_BRIDGE_FAILED',
              message: error instanceof Error ? error.message : 'Command EVE status surface bridge failed.',
              source: {
                generated_by: 'company-os-status-surface-cli',
              },
            },
          };
        }
      }
    );

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

  bridge
    .buildProvider('command-eve.kanban-marketing-card-create')
    .provider(
      async (request?: {
        title?: string;
        description?: string;
        lane_key?: string;
        client_token?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
      }) => {
        try {
          const result = createKanbanMarketingCard({
            userDataPath: getDataPath(),
            title: request?.title || '',
            description: request?.description,
            lane_key: request?.lane_key || '',
            client_token: request?.client_token || '',
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
            msg: error instanceof Error ? error.message : 'Command EVE marketing card-create bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-card-create/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_CARD_CREATE_BRIDGE_FAILED',
              message: error instanceof Error ? error.message : 'Command EVE marketing card-create bridge failed.',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-card-move')
    .provider(
      async (request?: { task_id?: string; to_lane_key?: string; boardSlug?: string; eventLedgerPath?: string }) => {
        try {
          const result = moveKanbanMarketingCard({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            to_lane_key: request?.to_lane_key || '',
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
            msg: error instanceof Error ? error.message : 'Command EVE marketing card-move bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-card-move/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_CARD_MOVE_BRIDGE_FAILED',
              message: error instanceof Error ? error.message : 'Command EVE marketing card-move bridge failed.',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-card-action')
    .provider(
      async (request?: {
        task_id?: string;
        action?: 'comment' | 'block' | 'unblock' | 'complete';
        comment?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
      }) => {
        try {
          const result = applyKanbanMarketingCardAction({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            action: request?.action || 'comment',
            comment: request?.comment,
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
            msg: error instanceof Error ? error.message : 'Command EVE marketing card-action bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-card-action/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_CARD_ACTION_BRIDGE_FAILED',
              message: error instanceof Error ? error.message : 'Command EVE marketing card-action bridge failed.',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-dispatch-plan')
    .provider(
      async (request?: {
        task_id?: string;
        command?: 'decompose' | 'specify';
        boardSlug?: string;
        eventLedgerPath?: string;
      }) => {
        try {
          const result = planKanbanMarketingCardDispatch({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            command: request?.command,
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
            msg: error instanceof Error ? error.message : 'Command EVE marketing dispatch-plan bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-dispatch-plan/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_DISPATCH_PLAN_BRIDGE_FAILED',
              reason_codes: ['KANBAN_MARKETING_DISPATCH_PLAN_BRIDGE_FAILED'],
              message: error instanceof Error ? error.message : 'Command EVE marketing dispatch-plan bridge failed.',
              subprocess_spawned: false,
              data_boundary_checked: false,
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-dispatch-approval')
    .provider(
      async (request?: {
        task_id?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        review_note?: string;
      }) => {
        try {
          const result = recordKanbanMarketingDispatchApproval({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            review_note: request?.review_note,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg: error instanceof Error ? error.message : 'Command EVE marketing dispatch-approval bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-dispatch-approval/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_DISPATCH_APPROVAL_BRIDGE_FAILED',
              message:
                error instanceof Error ? error.message : 'Command EVE marketing dispatch-approval bridge failed.',
              subprocess_spawned: false,
              release_blocked: true,
              human_gate: 'HG-2.5',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-dispatch-decision')
    .provider(
      async (request?: {
        task_id?: string;
        decision?: 'approved' | 'rejected';
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        decision_note?: string;
      }) => {
        try {
          const result = recordKanbanMarketingDispatchDecision({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            decision: request?.decision === 'rejected' ? 'rejected' : 'approved',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            decision_note: request?.decision_note,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg: error instanceof Error ? error.message : 'Command EVE marketing dispatch-decision bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-dispatch-decision/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_DISPATCH_DECISION_BRIDGE_FAILED',
              message:
                error instanceof Error ? error.message : 'Command EVE marketing dispatch-decision bridge failed.',
              controller_approved: false,
              subprocess_spawned: false,
              release_blocked: true,
              human_gate: 'HG-2.5',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-draft-generate')
    .provider(
      async (request?: {
        task_id?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        generation_note?: string;
      }) => {
        try {
          const result = generateKanbanMarketingDraft({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            generation_note: request?.generation_note,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg: error instanceof Error ? error.message : 'Command EVE marketing draft-generate bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-draft-generate/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_DRAFT_GENERATE_BRIDGE_FAILED',
              reason_codes: ['KANBAN_MARKETING_DRAFT_GENERATE_BRIDGE_FAILED'],
              message: error instanceof Error ? error.message : 'Command EVE marketing draft-generate bridge failed.',
              subprocess_spawned: false,
              data_boundary_checked: false,
              controller_approved: false,
              release_blocked: true,
              human_gate: 'HG-2.5',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  // v15 gated marketing-executor LADDER handlers (additive, fail-closed)
  bridge
    .buildProvider('command-eve.kanban-marketing-output-approve')
    .provider(
      async (request?: {
        task_id?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        approval_note?: string;
      }) => {
        try {
          const result = approveKanbanMarketingOutput({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            approval_note: request?.approval_note,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg: error instanceof Error ? error.message : 'Command EVE marketing output-approve bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-output-approve/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_OUTPUT_APPROVE_BRIDGE_FAILED',
              reason_codes: ['KANBAN_MARKETING_OUTPUT_APPROVE_BRIDGE_FAILED'],
              message: error instanceof Error ? error.message : 'Command EVE marketing output-approve bridge failed.',
              subprocess_spawned: false,
              data_boundary_checked: false,
              controller_approved: false,
              release_blocked: true,
              human_gate: 'HG-2.5',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-worker-dispatch-request')
    .provider(
      async (request?: {
        task_id?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        request_note?: string;
      }) => {
        try {
          const result = requestKanbanMarketingWorkerDispatch({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            request_note: request?.request_note,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg:
              error instanceof Error ? error.message : 'Command EVE marketing worker-dispatch-request bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-worker-dispatch-request/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_BRIDGE_FAILED',
              reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCH_REQUEST_BRIDGE_FAILED'],
              message:
                error instanceof Error ? error.message : 'Command EVE marketing worker-dispatch-request bridge failed.',
              subprocess_spawned: false,
              data_boundary_checked: false,
              controller_approved: false,
              release_blocked: true,
              human_gate: 'HG-2.5',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-worker-observed-run')
    .provider(
      async (request?: {
        task_id?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        observed_note?: string;
      }) => {
        try {
          const result = runKanbanMarketingWorkerObserved({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            observed_note: request?.observed_note,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg: error instanceof Error ? error.message : 'Command EVE marketing worker-observed-run bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-worker-observed-run/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_WORKER_OBSERVED_RUN_BRIDGE_FAILED',
              reason_codes: ['KANBAN_MARKETING_WORKER_OBSERVED_RUN_BRIDGE_FAILED'],
              message:
                error instanceof Error ? error.message : 'Command EVE marketing worker-observed-run bridge failed.',
              subprocess_spawned: false,
              external_calls: false,
              data_boundary_checked: false,
              controller_approved: false,
              release_blocked: true,
              human_gate: 'HG-2.5',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-worker-start-gate')
    .provider(
      async (request?: {
        task_id?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        gate_note?: string;
        executor_enabled?: boolean;
        executor_profile?: Record<string, unknown>;
      }) => {
        try {
          const result = checkKanbanMarketingWorkerStartGate({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            gate_note: request?.gate_note,
            executor_enabled: request?.executor_enabled === true,
            executor_profile: request?.executor_profile,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg: error instanceof Error ? error.message : 'Command EVE marketing worker-start-gate bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-worker-start-gate/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_WORKER_START_GATE_BRIDGE_FAILED',
              reason_codes: ['KANBAN_MARKETING_WORKER_START_GATE_BRIDGE_FAILED'],
              message:
                error instanceof Error ? error.message : 'Command EVE marketing worker-start-gate bridge failed.',
              subprocess_spawned: false,
              external_calls: false,
              data_boundary_checked: false,
              controller_approved: false,
              release_blocked: true,
              human_gate: 'HG-3',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-worker-dispatcher-prepare')
    .provider(
      async (request?: {
        task_id?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        prepare_note?: string;
      }) => {
        try {
          const result = prepareKanbanMarketingWorkerDispatcher({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            prepare_note: request?.prepare_note,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg:
              error instanceof Error ? error.message : 'Command EVE marketing worker-dispatcher-prepare bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-worker-dispatcher-prepare/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_BRIDGE_FAILED',
              reason_codes: ['KANBAN_MARKETING_WORKER_DISPATCHER_PREPARE_BRIDGE_FAILED'],
              message:
                error instanceof Error
                  ? error.message
                  : 'Command EVE marketing worker-dispatcher-prepare bridge failed.',
              subprocess_spawned: false,
              external_calls: false,
              data_boundary_checked: false,
              controller_approved: false,
              release_blocked: true,
              human_gate: 'HG-3.5',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge
    .buildProvider('command-eve.kanban-marketing-worker-executor-promotion')
    .provider(
      async (request?: {
        task_id?: string;
        boardSlug?: string;
        eventLedgerPath?: string;
        dispatch_handoff_packet?: Record<string, unknown>;
        promotion_note?: string;
        cao_gate_approved?: boolean;
      }) => {
        try {
          const result = promoteKanbanMarketingWorkerExecutor({
            userDataPath: getDataPath(),
            task_id: request?.task_id || '',
            boardSlug: request?.boardSlug,
            eventLedgerPath: request?.eventLedgerPath,
            dispatch_handoff_packet: request?.dispatch_handoff_packet,
            promotion_note: request?.promotion_note,
            cao_gate_approved: request?.cao_gate_approved === true,
          });
          return {
            success: result.ok,
            msg: result.ok ? undefined : result.reason_code || result.message,
            data: result,
          };
        } catch (error) {
          return {
            success: false,
            msg:
              error instanceof Error ? error.message : 'Command EVE marketing worker-executor-promotion bridge failed.',
            data: {
              version: 'command-eve-kanban-marketing-worker-executor-promotion/v0',
              ok: false,
              status: 'failed',
              reason_code: 'KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_BRIDGE_FAILED',
              reason_codes: ['KANBAN_MARKETING_WORKER_EXECUTOR_PROMOTION_BRIDGE_FAILED'],
              message:
                error instanceof Error
                  ? error.message
                  : 'Command EVE marketing worker-executor-promotion bridge failed.',
              subprocess_spawned: false,
              external_calls: false,
              data_boundary_checked: false,
              controller_approved: false,
              release_blocked: true,
              human_gate: 'HG-3.5',
              source: {
                generated_by: 'command-eve-kanban-marketing-board-core',
                hermes_home: '',
              },
            },
          };
        }
      }
    );

  bridge.buildProvider('command-eve.crm-overlay').provider(async (request?: { eventLedgerPath?: string }) => {
    try {
      const result = buildCrmOverlay({
        userDataPath: getDataPath(),
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
        msg: error instanceof Error ? error.message : 'Command EVE CRM overlay bridge failed.',
        data: {
          version: 'command-eve-crm-overlay/v0',
          ok: false,
          status: 'failed',
          reason_code: 'CRM_OVERLAY_BRIDGE_FAILED',
          message: error instanceof Error ? error.message : 'Command EVE CRM overlay bridge failed.',
          source: {
            generated_by: 'command-eve-crm-overlay-core',
            hermes_home: '',
          },
        },
      };
    }
  });

  bridge
    .buildProvider('command-eve.crm-overlay-initialize')
    .provider(async (request?: { eventLedgerPath?: string }) => {
      try {
        const result = initializeCrmOverlay({
          userDataPath: getDataPath(),
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
          msg: error instanceof Error ? error.message : 'Command EVE CRM overlay initialize bridge failed.',
          data: {
            version: 'command-eve-crm-overlay-initialize/v0',
            ok: false,
            status: 'failed',
            reason_code: 'CRM_OVERLAY_INITIALIZE_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : 'Command EVE CRM overlay initialize bridge failed.',
            source: {
              generated_by: 'command-eve-crm-overlay-core',
              hermes_home: '',
            },
          },
        };
      }
    });

  bridge.buildProvider('command-eve.crm-draft-create').provider(async (request?: { eventLedgerPath?: string }) => {
    try {
      const result = createCrmDraftDeal({
        userDataPath: getDataPath(),
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
        msg: error instanceof Error ? error.message : 'Command EVE CRM draft create bridge failed.',
        data: {
          version: 'command-eve-crm-draft-create/v0',
          ok: false,
          status: 'failed',
          reason_code: 'CRM_DRAFT_CREATE_BRIDGE_FAILED',
          message: error instanceof Error ? error.message : 'Command EVE CRM draft create bridge failed.',
          source: {
            generated_by: 'command-eve-crm-overlay-core',
            hermes_home: '',
          },
        },
      };
    }
  });

  bridge
    .buildProvider('command-eve.crm-stage-local')
    .provider(async (request?: { dealId?: string; targetStage?: 'qualified'; eventLedgerPath?: string }) => {
      try {
        const result = changeCrmDealStageLocal(
          {
            userDataPath: getDataPath(),
            eventLedgerPath: request?.eventLedgerPath,
          },
          {
            dealId: request?.dealId || '',
            targetStage: request?.targetStage || 'qualified',
          }
        );
        return {
          success: result.ok,
          msg: result.ok ? undefined : result.reason_code || result.message,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE CRM local stage bridge failed.',
          data: {
            version: 'command-eve-crm-stage-local/v0',
            ok: false,
            status: 'failed',
            reason_code: 'CRM_STAGE_LOCAL_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : 'Command EVE CRM local stage bridge failed.',
            source: {
              generated_by: 'command-eve-crm-overlay-core',
              hermes_home: '',
            },
          },
        };
      }
    });

  bridge
    .buildProvider('command-eve.crm-consent-local')
    .provider(async (request?: { dealId?: string; eventLedgerPath?: string }) => {
      try {
        const result = captureCrmConsentLocal(
          {
            userDataPath: getDataPath(),
            eventLedgerPath: request?.eventLedgerPath,
          },
          {
            dealId: request?.dealId || '',
          }
        );
        return {
          success: result.ok,
          msg: result.ok ? undefined : result.reason_code || result.message,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE CRM local consent bridge failed.',
          data: {
            version: 'command-eve-crm-consent-local/v0',
            ok: false,
            status: 'failed',
            reason_code: 'CRM_CONSENT_LOCAL_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : 'Command EVE CRM local consent bridge failed.',
            source: {
              generated_by: 'command-eve-crm-overlay-core',
              hermes_home: '',
            },
          },
        };
      }
    });

  // -------------------------------------------------------------------------
  // Registration + license gate (W11). Registration PII is S2, stored LOCAL
  // ONLY in userData and never returned beyond the renderer that submitted it.
  // -------------------------------------------------------------------------

  bridge.buildProvider('command-eve.entitlement-status').provider(async () => {
    try {
      const result = getEntitlementStatus({ userDataPath: getDataPath() });
      return {
        success: result.ok,
        msg: result.ok ? undefined : result.reason_code || result.message,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE entitlement status bridge failed.',
        data: {
          version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
          ok: false,
          required: true,
          state: 'unconfigured',
          reason_code: 'ENTITLEMENT_STATUS_BRIDGE_FAILED',
          message: error instanceof Error ? error.message : 'Command EVE entitlement status bridge failed.',
        },
      };
    }
  });

  bridge
    .buildProvider('command-eve.entitlement-register')
    .provider(async (request?: { name?: string; company?: string; email?: string; consent?: boolean }) => {
      try {
        const result = registerTenant(
          {
            name: request?.name || '',
            company: request?.company || '',
            email: request?.email || '',
            consent: request?.consent === true,
          },
          { userDataPath: getDataPath() }
        );
        return {
          success: result.ok,
          msg: result.ok ? undefined : result.reason_code || result.message,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE entitlement register bridge failed.',
          data: {
            version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
            ok: false,
            reason_code: 'ENTITLEMENT_REGISTER_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : 'Command EVE entitlement register bridge failed.',
          },
        };
      }
    });

  bridge.buildProvider('command-eve.entitlement-activate').provider(async (request?: { code?: string }) => {
    try {
      const code = request?.code || '';
      const result = activateEntitlement({ code }, { userDataPath: getDataPath() });
      // On a successful activation, persist the RAW wire string (keychain at
      // rest, fail-closed) so the EVE Inference cloud lane has a bearer
      // credential. We never return the raw wire to the renderer. A keychain
      // failure here does not fail the activation (the gate already unlocked on
      // the verified payload) — it just means EVE Inference cloud is
      // unavailable until re-activation on a keychain-capable host.
      if (result.ok) {
        try {
          storeLicenseWire(getDataPath(), code);
        } catch {
          // Non-fatal: never let wire persistence break the gate.
        }
      }
      return {
        success: result.ok,
        msg: result.ok ? undefined : (result.reason_code as string) || result.message,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE entitlement activate bridge failed.',
        data: {
          version: COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
          ok: false,
          reason_code: 'ENTITLEMENT_ACTIVATE_BRIDGE_FAILED',
          message: error instanceof Error ? error.message : 'Command EVE entitlement activate bridge failed.',
        },
      };
    }
  });

  // Presence-only: tells the renderer whether the EVE Inference cloud lane has
  // a usable bearer credential. NEVER returns the raw wire string — the EVE
  // Inference client is built in the main process (see eveInferenceCore +
  // ClientFactory), so the renderer only needs to know "available or not".
  bridge.buildProvider('command-eve.license-wire-status').provider(async () => {
    try {
      const available = hasLicenseWire(getDataPath());
      return { success: true, data: { available } };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE license-wire status bridge failed.',
        data: { available: false },
      };
    }
  });

  // -------------------------------------------------------------------------
  // Account auth (browser-loopback, P1). The whole PKCE/loopback/token exchange
  // + post-session orchestration runs HERE in the main process; the renderer
  // only triggers it and reads back the gate status. Tokens never cross the
  // bridge. PREPARED: the web /auth/desktop page + desktop-auth-broker are not
  // live yet, so a real login returns a typed BROKER_HTTP_*/OPEN failure and the
  // UI keeps the paste fallback — this handler is safe to ship now.
  // -------------------------------------------------------------------------
  bridge
    .buildProvider('command-eve.auth-web-login')
    .provider(async (request?: { intent?: DesktopAuthIntent }) => {
      const version = 'command-eve-account-auth/v0' as const;
      try {
        const intent: DesktopAuthIntent = request?.intent === 'register' ? 'register' : 'login';
        const userDataPath = getDataPath();

        // Open the system browser via Electron shell (lazy require so this module
        // stays importable in non-Electron/test contexts).
        const openExternal = (url: string): Promise<void> => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { shell } = require('electron') as { shell?: { openExternal(u: string): Promise<void> } };
          if (!shell?.openExternal) return Promise.reject(new Error('shell.openExternal unavailable'));
          return shell.openExternal(url);
        };

        const loopback = await runDesktopAuthLoopback(intent, { openExternal });
        if (!loopback.ok || !loopback.session) {
          return {
            success: false,
            msg: loopback.reason_code || 'AUTH_FAILED',
            data: {
              version,
              ok: false,
              entitled: false,
              // The user has no session ⇒ no automatic activation possible; offer
              // the manual paste path so a pre-broker build is still usable.
              needs_paste: true,
              reason_code: loopback.reason_code,
              message: loopback.message,
            },
          };
        }

        const session = loopback.session;
        // Persist the session at rest (keychain, fail-closed) so silent resume
        // works on next launch.
        const { storeAccountSession } = await import('@process/commandEve/accountSessionAtRest');
        storeAccountSession(userDataPath, session);

        const result = await activateEntitlementFromSession(userDataPath, session, {
          storeLicenseWire: (p, wire) => {
            try {
              storeLicenseWire(p, wire);
            } catch {
              // non-fatal
            }
          },
        });

        return {
          success: result.activated,
          msg: result.activated ? undefined : result.reason_code,
          data: {
            version,
            ok: result.activated,
            entitled: result.status.state === 'entitled',
            needs_paste: result.needsPaste,
            reason_code: result.reason_code,
            status: result.status,
            account: { name: session.user.name, email: session.user.email, company: session.user.company },
          },
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE auth-web-login bridge failed.',
          data: {
            version,
            ok: false,
            entitled: false,
            needs_paste: true,
            reason_code: 'AUTH_WEB_LOGIN_BRIDGE_FAILED',
            message: error instanceof Error ? error.message : undefined,
          },
        };
      }
    });

  // Logout: revoke the GoTrue session + delete session.enc + clear memory. Per
  // founder decision the entitlement.json + license-wire are KEPT so the app
  // stays offline-usable after logout.
  bridge.buildProvider('command-eve.auth-logout').provider(async () => {
    const version = 'command-eve-account-auth/v0' as const;
    try {
      await revokeAndClearSession(getDataPath());
      return { success: true, data: { version, ok: true } };
    } catch (error) {
      // Even on error the local session file is best-effort cleared inside
      // revokeAndClearSession; report ok:false but never throw the chrome.
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE auth-logout bridge failed.',
        data: { version, ok: false, reason_code: 'AUTH_LOGOUT_BRIDGE_FAILED' },
      };
    }
  });

  // Local registration/session readout for the avatar + account panel. NEVER
  // returns tokens — only the locally-stored name/email/company + presence flags.
  bridge.buildProvider('command-eve.registration-status').provider(async () => {
    const version = 'command-eve-account-auth/v0' as const;
    try {
      const userDataPath = getDataPath();
      const registration = readRegistration(userDataPath);
      const hasSession = hasAccountSession(userDataPath);
      // Prefer the session's user identity when present (it is the source of
      // truth for the logged-in account); fall back to the local registration.
      let name = registration?.name;
      let email = registration?.email;
      let company = registration?.company;
      if (hasSession) {
        const read = readAccountSession(userDataPath);
        if (read.ok && read.session) {
          email = read.session.user.email || email;
          name = read.session.user.name || name;
          company = read.session.user.company || company;
        }
      }
      return {
        success: true,
        data: {
          version,
          ok: true,
          registered: Boolean(registration),
          has_session: hasSession,
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          ...(company ? { company } : {}),
        },
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE registration-status bridge failed.',
        data: { version, ok: false, registered: false, has_session: false },
      };
    }
  });

  // Resolve a picker selection ("Privat lokal" tier OR "EVE Inference" tier)
  // into the full TProviderWithModel used as the conversation `model`. For an
  // EVE tier we inject the stored CEVE license WIRE STRING here in the MAIN
  // process (the renderer never asks for the raw wire — it only knows the
  // selection value). The returned provider does carry the wire as `api_key`
  // because the conversation `model` is POSTed to the backend over the local
  // loopback HTTP bridge (same lifecycle as the local-runtime loopback key).
  // Fail-closed: an EVE selection with no usable wire returns an error result,
  // never a provider with an empty bearer.
  bridge
    .buildProvider('command-eve.resolve-inference-provider')
    .provider(async (request?: { selection?: string; localTierId?: string }) => {
      try {
        const selection = request?.selection || '';

        // EVE Inference (cloud) lane.
        const eveTierId: EveInferenceTierId | undefined = parseEveTierIdFromSelection(selection);
        if (isEveInferenceSelection(selection)) {
          if (!eveTierId) {
            return { success: false, msg: 'EVE_INFERENCE_UNKNOWN_TIER', data: undefined };
          }
          const wireResult = readLicenseWire(getDataPath());
          if (!wireResult.ok || !wireResult.wire) {
            return {
              success: false,
              msg: wireResult.reason_code || 'EVE_INFERENCE_NO_BEARER',
              data: undefined,
            };
          }
          const provider = buildEveInferenceProvider({ tierId: eveTierId, licenseWire: wireResult.wire });
          return { success: true, data: { provider, lane: 'eve' as const, tierId: eveTierId } };
        }

        // Privat (lokal) lane — reuse the bundled local-runtime provider. The
        // local tier id rides either in the selection ("command-eve-local:<id>")
        // mapped by the renderer, or as an explicit localTierId for the
        // commandEveShell tier.
        const provider = getCommandEveLocalRuntimeProvider(request?.localTierId);
        return { success: true, data: { provider, lane: 'local' as const } };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE resolve-inference-provider bridge failed.',
          data: undefined,
        };
      }
    });

  // -------------------------------------------------------------------------
  // Credits / billing (Lane 3). The main process holds the CEVE bearer and is
  // the ONLY side that calls the credits-status Edge Function — the renderer
  // never sees the wire. SELF-QUIET: when there is no license wire OR no
  // function URL OR the call fails, we return an `ok:false` zero-status (the
  // meter renders nothing) instead of throwing. This handler is therefore safe
  // to ship BEFORE the Lane-1+2 backend exists (PREPARED).
  // -------------------------------------------------------------------------
  bridge.buildProvider('command-eve.credits-status').provider(async () => {
    // Read the user's persisted spend cap up-front so it rides on every result
    // (even the quiet pre-deploy one) — the meter/wall reflect a cap the user
    // set locally before the server round-trips it back.
    let spendCapEurCents = 0;
    try {
      const stored = await ProcessConfig.get('commandEve.spendCapEurCents');
      if (typeof stored === 'number' && stored > 0) spendCapEurCents = stored;
    } catch {
      // A config read failure must not break the status read.
    }

    try {
      // No Edge Function URL configured ⇒ nothing to call. Quiet, not a crash.
      if (!CREDITS_STATUS_FUNCTION_URL) {
        return { success: false, msg: 'CREDITS_STATUS_NO_URL', data: quietCreditsStatus(spendCapEurCents, 'CREDITS_STATUS_NO_URL') };
      }

      // No usable CEVE bearer ⇒ the user is not yet licensed / activated. Quiet.
      const wireResult = readLicenseWire(getDataPath());
      if (!wireResult.ok || !wireResult.wire) {
        return {
          success: false,
          msg: wireResult.reason_code || 'CREDITS_STATUS_NO_BEARER',
          data: quietCreditsStatus(spendCapEurCents, wireResult.reason_code || 'CREDITS_STATUS_NO_BEARER'),
        };
      }

      // Proxy GET to the credits-status Edge Function with the CEVE license as a
      // bearer. The wire is sent only in the Authorization HEADER (never logged,
      // never returned to the renderer).
      let response: Response;
      try {
        response = await fetch(CREDITS_STATUS_FUNCTION_URL, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${wireResult.wire}`,
            Accept: 'application/json',
          },
        });
      } catch (networkError) {
        // Network failure (offline / function not deployed) — stay quiet.
        return {
          success: false,
          msg: networkError instanceof Error ? networkError.message : 'CREDITS_STATUS_NETWORK',
          data: quietCreditsStatus(spendCapEurCents, 'CREDITS_STATUS_NETWORK'),
        };
      }

      if (!response.ok) {
        return {
          success: false,
          msg: `CREDITS_STATUS_HTTP_${response.status}`,
          data: quietCreditsStatus(spendCapEurCents, `CREDITS_STATUS_HTTP_${response.status}`),
        };
      }

      const raw = (await response.json().catch((): null => null)) as Record<string, unknown> | null;
      if (!raw || typeof raw !== 'object') {
        return { success: false, msg: 'CREDITS_STATUS_BAD_BODY', data: quietCreditsStatus(spendCapEurCents, 'CREDITS_STATUS_BAD_BODY') };
      }

      const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
      const tier = (raw.tier === 'solo' || raw.tier === 'starter' ? raw.tier : 'free') as CreditsTier;
      // The user-set local cap takes precedence when present; otherwise honour
      // whatever the server reports.
      const serverCap = num(raw.spend_cap_eur_cents, 0);
      const effectiveCap = spendCapEurCents > 0 ? spendCapEurCents : serverCap;

      return {
        success: true,
        data: {
          version: COMMAND_EVE_CREDITS_BRIDGE_VERSION,
          ok: true,
          tier,
          included_allowance_credits_remaining: num(raw.included_allowance_credits_remaining),
          purchased_credits_remaining: num(raw.purchased_credits_remaining),
          spend_cap_eur_cents: Math.max(0, effectiveCap),
          free_actions_used_this_period: num(raw.free_actions_used_this_period),
          free_cap: num(raw.free_cap),
          period_start: typeof raw.period_start === 'string' ? raw.period_start : '',
        },
      };
    } catch (error) {
      // Any unexpected failure: never crash the renderer chrome — go quiet.
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Command EVE credits-status bridge failed.',
        data: quietCreditsStatus(spendCapEurCents, 'CREDITS_STATUS_BRIDGE_FAILED'),
      };
    }
  });

  // Persist the user's hard spend cap (EUR cents; 0 ⇒ uncapped) via ProcessConfig.
  // This is a LOCAL persistence write — the binding enforcement is the backend's
  // (Lane-2 debit refuses past the cap); the desktop carries the intent so the
  // meter + a future checkout reflect it. SELF-QUIET on a bad/absent value.
  bridge
    .buildProvider('command-eve.credits-set-spend-cap')
    .provider(async (request?: { spend_cap_eur_cents?: number } | CommandEveBridgeEnvelope<{ spend_cap_eur_cents?: number }>) => {
      try {
        const payload = unwrapBridgeRequest<{ spend_cap_eur_cents?: number }>(request);
        const requested = payload?.spend_cap_eur_cents;
        if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 0) {
          return {
            success: false,
            msg: 'CREDITS_SPEND_CAP_INVALID',
            data: {
              version: COMMAND_EVE_CREDITS_BRIDGE_VERSION,
              ok: false,
              reason_code: 'CREDITS_SPEND_CAP_INVALID',
              spend_cap_eur_cents: 0,
            },
          };
        }
        const normalized = Math.round(requested);
        await ProcessConfig.set('commandEve.spendCapEurCents', normalized);
        return {
          success: true,
          data: {
            version: COMMAND_EVE_CREDITS_BRIDGE_VERSION,
            ok: true,
            spend_cap_eur_cents: normalized,
          },
        };
      } catch (error) {
        return {
          success: false,
          msg: error instanceof Error ? error.message : 'Command EVE credits-set-spend-cap bridge failed.',
          data: {
            version: COMMAND_EVE_CREDITS_BRIDGE_VERSION,
            ok: false,
            reason_code: 'CREDITS_SPEND_CAP_BRIDGE_FAILED',
            spend_cap_eur_cents: 0,
          },
        };
      }
    });

  // SILENT REINSTALL / relaunch RESUME (no browser): on bridge init, if a
  // session.enc decrypts AND its refresh token is valid, refresh → register-
  // profile → my-license → activateEntitlement WITHOUT any browser. The renderer
  // gate re-reads entitlement-status on mount, so a resumed entitlement opens the
  // gate automatically. Fire-and-forget + a no-op when no session is stored;
  // never blocks bridge init and never throws the chrome.
  void (async () => {
    try {
      await silentResumeAccountAuth(getDataPath(), {
        storeLicenseWire: (p, wire) => {
          try {
            storeLicenseWire(p, wire);
          } catch {
            // non-fatal
          }
        },
      });
    } catch {
      // A dead refresh / network failure just leaves the gate on Login.
    }
  })();
}
