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
  registerTenant,
  COMMAND_EVE_ENTITLEMENT_BRIDGE_VERSION,
} from '@process/commandEve/entitlementCore';
import {
  applyKanbanMarketingCardAction,
  buildKanbanMarketingBoard,
  createKanbanMarketingCard,
  createKanbanMarketingProofCard,
  moveKanbanMarketingCard,
  planKanbanMarketingCardDispatch,
  recordKanbanMarketingDispatchApproval,
  runKanbanPreflight,
} from '@process/commandEve/kanbanPreflightCore';
import { buildLocalRuntimeStatus } from '@process/commandEve/localRuntimeStatusCore';
import { buildSkillLibrary } from '@process/commandEve/skillLibraryCore';
import { buildCommandEveStatusSurface } from '@process/commandEve/statusSurfaceCore';
import { getDataPath } from '@process/utils/utils';

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

  bridge.buildProvider('command-eve.crm-consent-local').provider(async (request?: { dealId?: string; eventLedgerPath?: string }) => {
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
      const result = activateEntitlement({ code: request?.code || '' }, { userDataPath: getDataPath() });
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
}
