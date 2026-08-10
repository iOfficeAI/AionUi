//! Process-wide snapshot of the `agent_metadata` catalog.
//!
//! The table is the single source of truth for every agent the user can
//! spawn — builtin vendor rows, extension-installed rows, and custom
//! rows all live there. The registry:
//!
//! - hydrates `select *` into memory at startup;
//! - projects startup availability from the latest persisted snapshot
//!   without probing PATH;
//! - exposes lookups the factory and routes use (`get`,
//!   `find_by_backend`, `list_by_agent_type`, etc.);
//! - writes ACP handshake payloads back to the row through
//!   [`AgentRegistry::catalog_sender`] (serialised through a single
//!   consumer task, see [`CatalogSender`]).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use aionui_api_types::{
    AgentEnvEntry, AgentHandshake, AgentManagementRow, AgentManagementStatus, AgentMetadata, AgentSnapshotCheckKind,
    AgentSnapshotCheckStatus, AgentSource, AgentSourceInfo, BehaviorPolicy,
};
use aionui_common::AgentType;
use aionui_db::{AgentMetadataRow, IAgentMetadataRepository, UpdateAgentHandshakeParams};
use aionui_runtime::{RuntimeCommandProbe, probe_node_runtime_supported, probe_runtime_command, resolve_command_path};
use futures_util::StreamExt;
use serde_json::{Value, json};
use tokio::sync::{RwLock, mpsc};
use tracing::{debug, info, warn};

use crate::error::AgentError;
use crate::manager::acp::config_option_catalog::{
    enrich_handshake_with_config_option_catalog, merge_config_option_values,
};

/// Capacity of the catalog-sync MPSC channel. A single writer thread
/// drains it serially, so the bound just sizes the burst we can absorb
/// before producers start to back off.
const CATALOG_SYNC_CHANNEL_CAPACITY: usize = 256;
const CLI_PROBE_CONCURRENCY: usize = 8;

/// One unit of work submitted to the catalog sync consumer task.
#[derive(Debug)]
struct CatalogSyncMessage {
    agent_metadata_id: String,
    handshake: AgentHandshake,
}

#[cfg(test)]
#[path = "registry_config_option_tests.rs"]
mod registry_config_option_tests;

#[cfg(test)]
#[path = "registry_tests.rs"]
mod registry_tests;

pub struct AgentRegistry {
    repo: Arc<dyn IAgentMetadataRepository>,
    by_id: RwLock<HashMap<String, AgentMetadata>>,
    unavailable_reasons: RwLock<HashMap<String, UnavailableReason>>,
    /// MPSC sender shared with every forwarder in every `AcpAgentManager`.
    /// Draining happens in a single background task owned by this
    /// registry, so DB writes for the same (id, field) serialize.
    catalog_tx: mpsc::Sender<CatalogSyncMessage>,
}

impl AgentRegistry {
    pub fn new(repo: Arc<dyn IAgentMetadataRepository>) -> Arc<Self> {
        let (tx, rx) = mpsc::channel::<CatalogSyncMessage>(CATALOG_SYNC_CHANNEL_CAPACITY);
        let this = Arc::new(Self {
            repo,
            by_id: RwLock::new(HashMap::new()),
            unavailable_reasons: RwLock::new(HashMap::new()),
            catalog_tx: tx,
        });

        this.clone().spawn_catalog_consumer(rx);
        this
    }

    /// Drive the single consumer task. Runs until every sender (including
    /// the one held by the registry itself) has been dropped — which only
    /// happens at process shutdown because the registry lives as long as
    /// `AppServices`.
    fn spawn_catalog_consumer(self: Arc<Self>, mut rx: mpsc::Receiver<CatalogSyncMessage>) {
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if let Err(err) = self.apply_handshake_inner(&msg.agent_metadata_id, &msg.handshake).await {
                    warn!(
                        agent_metadata_id = %msg.agent_metadata_id,
                        error = %err,
                        "Catalog sync: apply_handshake failed"
                    );
                }
            }
            debug!("Catalog sync consumer task exiting — all senders dropped");
        });
    }

    /// Persist handshake snapshot fields onto the row and refresh the
    /// cached copy. Internal — production code writes through
    /// [`AgentRegistry::catalog_sender`] so every write is serialized
    /// through the single consumer task. Direct calls exist only for
    /// tests and the consumer itself.
    ///
    /// `None` fields are left untouched (partial update).
    async fn apply_handshake_inner(&self, id: &str, snapshot: &AgentHandshake) -> Result<(), AgentError> {
        let mut snapshot = snapshot.clone();
        if let Some(incoming_config_options) = snapshot.config_options.as_ref() {
            let existing_config_options = {
                let guard = self.by_id.read().await;
                guard.get(id).and_then(|meta| meta.handshake.config_options.clone())
            };
            if let Some(merged_config_options) =
                merge_config_option_values(existing_config_options.as_ref(), incoming_config_options)
            {
                snapshot.config_options = Some(merged_config_options);
            }
        }

        let snapshot = enrich_handshake_with_config_option_catalog(&snapshot);
        let agent_capabilities = encode_optional(&snapshot.agent_capabilities, "agent_capabilities")?;
        let auth_methods = encode_optional(&snapshot.auth_methods, "auth_methods")?;
        let config_options = encode_optional(&snapshot.config_options, "config_options")?;
        let available_modes = encode_optional(&snapshot.available_modes, "available_modes")?;
        let available_models = encode_optional(&snapshot.available_models, "available_models")?;
        let available_commands = encode_optional(&snapshot.available_commands, "available_commands")?;

        let params = UpdateAgentHandshakeParams {
            agent_capabilities: agent_capabilities.as_deref().map(Some),
            auth_methods: auth_methods.as_deref().map(Some),
            config_options: config_options.as_deref().map(Some),
            available_modes: available_modes.as_deref().map(Some),
            available_models: available_models.as_deref().map(Some),
            available_commands: available_commands.as_deref().map(Some),
        };

        let Some(row) = self
            .repo
            .apply_handshake(id, &params)
            .await
            .map_err(|e| AgentError::internal(format!("apply_handshake: {e}")))?
        else {
            return Ok(());
        };

        if let Some((mut meta, reason)) = decode_row(row, AvailabilityProjection::Cached) {
            let existing_availability = self
                .by_id
                .read()
                .await
                .get(&meta.id)
                .map(|existing| (existing.available, existing.resolved_command.clone()));
            let reason = if let Some((available, resolved_command)) = existing_availability {
                meta.available = available;
                meta.resolved_command = resolved_command;
                if meta.available {
                    None
                } else {
                    self.unavailable_reasons.read().await.get(&meta.id).cloned().or(reason)
                }
            } else {
                reason
            };
            self.update_cached_unavailable_reason(&meta.id, reason).await;
            self.by_id.write().await.insert(meta.id.clone(), meta);
        }
        Ok(())
    }

    async fn update_cached_unavailable_reason(&self, id: &str, reason: Option<UnavailableReason>) {
        let mut guard = self.unavailable_reasons.write().await;
        if let Some(reason) = reason {
            guard.insert(id.to_owned(), reason);
        } else {
            guard.remove(id);
        }
    }
}

impl AgentRegistry {
    /// Sender end of the catalog-sync MPSC, cloned by each
    /// `AcpAgentManager` forwarder.
    pub fn catalog_sender(&self) -> CatalogSender {
        CatalogSender {
            tx: self.catalog_tx.clone(),
        }
    }
    /// Reload every row from the database and refresh installation state.
    ///
    /// Startup checks whether required commands / managed runtimes resolve and
    /// runs a bounded `<primary-cli> --version` probe for builtin agents. It does not start sessions,
    /// perform handshakes, fetch models, or overwrite persisted health-check
    /// snapshots. User-facing health checks stay explicit.
    pub async fn hydrate(&self) -> Result<(), AgentError> {
        let rows = self
            .repo
            .list_all()
            .await
            .map_err(|e| AgentError::internal(format!("load agent_metadata: {e}")))?;

        let candidates: Vec<_> = rows
            .into_iter()
            .filter_map(|row| decode_row(row, AvailabilityProjection::Probe))
            .collect();
        let validated = validate_cli_candidates(candidates).await;

        let mut map = HashMap::with_capacity(validated.len());
        let mut reasons = HashMap::new();
        for (meta, reason) in validated {
            if let Some(reason) = reason {
                reasons.insert(meta.id.clone(), reason);
            }
            map.insert(meta.id.clone(), meta);
        }
        // Snapshot the summary off the local map before transferring it
        // into the lock — `log_availability_summary` borrows the values
        // and we don't want that borrow to outlive the move.
        log_availability_summary(map.values(), "AgentRegistry hydrated");
        *self.by_id.write().await = map;
        *self.unavailable_reasons.write().await = reasons;
        Ok(())
    }

    /// Re-probe every row's command without refetching from the DB.
    /// Useful after PATH has changed (e.g. `launchctl setenv`).
    pub async fn refresh_availability(&self) {
        let snapshot: Vec<AgentMetadata> = self.by_id.read().await.values().cloned().collect();
        let candidates: Vec<_> = snapshot
            .into_iter()
            .map(|mut meta| {
                let (path, reason) = probe_with_reason(&meta);
                meta.resolved_command = path;
                meta.available = meta.resolved_command.is_some() || is_internal_commandless_agent(&meta);
                let reason = if meta.available { None } else { reason };
                (meta, reason)
            })
            .collect();
        let validated = validate_cli_candidates(candidates).await;

        let mut results = Vec::with_capacity(validated.len());
        let mut reasons = HashMap::new();
        for (meta, reason) in validated {
            log_probe_result(&meta, &reason);
            results.push((meta.id.clone(), meta.available, meta.resolved_command.clone()));
            if let Some(reason) = reason {
                reasons.insert(meta.id.clone(), reason);
            }
        }
        let mut guard = self.by_id.write().await;
        for (id, available, resolved_command) in results {
            if let Some(meta) = guard.get_mut(&id) {
                meta.available = available;
                meta.resolved_command = resolved_command;
            }
        }
        log_availability_summary(guard.values(), "AgentRegistry refresh_availability complete");
        *self.unavailable_reasons.write().await = reasons;
    }

    /// Refetch and re-probe one row from the repository, leaving the rest of
    /// the in-memory availability snapshot untouched.
    pub async fn reload_one(&self, id: &str) -> Result<Option<AgentMetadata>, AgentError> {
        let row = self
            .repo
            .get(id)
            .await
            .map_err(|e| AgentError::internal(format!("load agent_metadata '{id}': {e}")))?;
        let Some(row) = row else {
            self.by_id.write().await.remove(id);
            self.unavailable_reasons.write().await.remove(id);
            return Ok(None);
        };
        let Some((meta, reason)) = decode_row(row, AvailabilityProjection::Probe) else {
            self.by_id.write().await.remove(id);
            self.unavailable_reasons.write().await.remove(id);
            return Ok(None);
        };
        let (meta, reason) = validate_cli_availability(meta, reason).await;
        log_probe_result(&meta, &reason);
        self.update_cached_unavailable_reason(&meta.id, reason).await;
        self.by_id.write().await.insert(meta.id.clone(), meta.clone());
        Ok(Some(meta))
    }

    pub async fn get(&self, id: &str) -> Option<AgentMetadata> {
        self.by_id.read().await.get(id).cloned()
    }

    /// First row whose vendor label matches, among `agent_source = 'builtin'`.
    pub async fn find_builtin_by_backend(&self, vendor: &str) -> Option<AgentMetadata> {
        self.by_id
            .read()
            .await
            .values()
            .find(|m| m.backend.as_deref() == Some(vendor) && m.agent_source == AgentSource::Builtin)
            .cloned()
    }

    /// Every enabled, installed row whose `agent_type` matches,
    /// sorted by `sort_order`. See [`Self::list_all`] for the filter
    /// semantics.
    pub async fn list_by_agent_type(&self, agent_type: AgentType) -> Vec<AgentMetadata> {
        let guard = self.by_id.read().await;
        let mut rows: Vec<AgentMetadata> = guard
            .values()
            .filter(|m| m.agent_type == agent_type && is_visible(m))
            .cloned()
            .collect();
        rows.sort_by(|a, b| a.sort_order.cmp(&b.sort_order).then_with(|| a.name.cmp(&b.name)));
        rows
    }

    /// Snapshot of every visible row — rows that are user-disabled
    /// (`enabled = 0`) or whose spawn command could not be located on
    /// `$PATH` (`available = false`) are filtered out. Callers that
    /// still need a legacy "available agents only" read model (for
    /// example refresh responses) should use this rather than the
    /// diagnostics-first management list.
    pub async fn list_all(&self) -> Vec<AgentMetadata> {
        let mut rows: Vec<AgentMetadata> = self
            .by_id
            .read()
            .await
            .values()
            .filter(|m| is_visible(m))
            .cloned()
            .collect();
        rows.sort_by(|a, b| a.sort_order.cmp(&b.sort_order).then_with(|| a.name.cmp(&b.name)));
        rows
    }

    /// Unfiltered snapshot — used by internal paths that legitimately
    /// need to see user-disabled or missing rows (e.g. the UI's
    /// "manage agents" surface). Keep external API handlers on
    /// [`Self::list_all`].
    pub async fn list_all_including_hidden(&self) -> Vec<AgentMetadata> {
        let mut rows: Vec<AgentMetadata> = self.by_id.read().await.values().cloned().collect();
        rows.sort_by(|a, b| a.sort_order.cmp(&b.sort_order).then_with(|| a.name.cmp(&b.name)));
        rows
    }

    /// Management read model for settings surfaces that need to show
    /// official/custom rows even when unavailable.
    pub async fn list_management_rows(&self) -> Vec<AgentManagementRow> {
        let reasons = self.unavailable_reasons.read().await.clone();
        let mut rows: Vec<AgentManagementRow> = self
            .by_id
            .read()
            .await
            .values()
            .cloned()
            .map(|meta| {
                let reason = reasons.get(&meta.id);
                let status = derive_management_status(&meta, reason);
                let diagnostics = derive_management_diagnostics(&meta, status, reason);
                let handshake = meta.handshake;
                AgentManagementRow {
                    id: meta.id,
                    icon: meta.icon,
                    name: meta.name,
                    name_i18n: meta.name_i18n,
                    description: meta.description,
                    description_i18n: meta.description_i18n,
                    backend: meta.backend,
                    agent_type: meta.agent_type,
                    agent_source: meta.agent_source,
                    agent_source_info: meta.agent_source_info,
                    enabled: meta.enabled,
                    installed: meta.available,
                    command: meta.command,
                    args: meta.args,
                    env: Vec::new(),
                    native_skills_dirs: meta.native_skills_dirs,
                    behavior_policy: meta.behavior_policy,
                    yolo_id: meta.yolo_id,
                    config_options: handshake.config_options.clone(),
                    available_modes: handshake.available_modes.clone(),
                    available_models: handshake.available_models.clone(),
                    available_commands: handshake.available_commands.clone(),
                    sort_order: meta.sort_order,
                    team_capable: meta.team_capable,
                    status,
                    last_check_status: meta.last_check_status,
                    last_check_kind: meta.last_check_kind,
                    last_check_error_code: diagnostics.error_code,
                    last_check_error_message: diagnostics.error_message,
                    last_check_error_details: diagnostics.details,
                    last_check_guidance: diagnostics.guidance,
                    last_check_latency_ms: meta.last_check_latency_ms,
                    last_check_at: meta.last_check_at,
                    last_success_at: meta.last_success_at,
                    last_failure_at: meta.last_failure_at,
                    has_command_override: meta.has_command_override,
                    env_override_key_count: meta.env_override_key_count,
                }
            })
            .collect();
        rows.sort_by(|a, b| a.sort_order.cmp(&b.sort_order).then_with(|| a.name.cmp(&b.name)));
        rows
    }

    pub async fn management_row_by_id(&self, id: &str) -> Option<AgentManagementRow> {
        let reason = self.unavailable_reasons.read().await.get(id).cloned();
        let meta = self.by_id.read().await.get(id).cloned()?;
        let status = derive_management_status(&meta, reason.as_ref());
        let diagnostics = derive_management_diagnostics(&meta, status, reason.as_ref());
        let handshake = meta.handshake.clone();
        Some(AgentManagementRow {
            id: meta.id,
            icon: meta.icon,
            name: meta.name,
            name_i18n: meta.name_i18n,
            description: meta.description,
            description_i18n: meta.description_i18n,
            backend: meta.backend,
            agent_type: meta.agent_type,
            agent_source: meta.agent_source,
            agent_source_info: meta.agent_source_info,
            enabled: meta.enabled,
            installed: meta.available,
            command: meta.command,
            args: meta.args,
            env: Vec::new(),
            native_skills_dirs: meta.native_skills_dirs,
            behavior_policy: meta.behavior_policy,
            yolo_id: meta.yolo_id,
            config_options: handshake.config_options.clone(),
            available_modes: handshake.available_modes.clone(),
            available_models: handshake.available_models.clone(),
            available_commands: handshake.available_commands.clone(),
            sort_order: meta.sort_order,
            team_capable: meta.team_capable,
            status,
            last_check_status: meta.last_check_status,
            last_check_kind: meta.last_check_kind,
            last_check_error_code: diagnostics.error_code,
            last_check_error_message: diagnostics.error_message,
            last_check_error_details: diagnostics.details,
            last_check_guidance: diagnostics.guidance,
            last_check_latency_ms: meta.last_check_latency_ms,
            last_check_at: meta.last_check_at,
            last_success_at: meta.last_success_at,
            last_failure_at: meta.last_failure_at,
            has_command_override: meta.has_command_override,
            env_override_key_count: meta.env_override_key_count,
        })
    }

    /// Like [`Self::list_all_including_hidden`] but pairs every row
    /// with a freshly-computed availability reason so callers (the
    /// `doctor` command, diagnostic UIs) can explain *why* a row is
    /// unavailable without depending on logs or re-implementing the
    /// probe rules.
    ///
    /// Reasons are only attached to rows whose `available` flag is
    /// `false`. Internal rows (e.g. the aionrs row) intentionally
    /// have an empty `command`, so the underlying probe always
    /// reports `NoCommand` for them — surfacing that as a "reason"
    /// when `available = true` would just confuse the caller, so we
    /// suppress it here.
    pub async fn diagnostic_snapshot(&self) -> Vec<(AgentMetadata, Option<UnavailableReason>)> {
        let reasons = self.unavailable_reasons.read().await.clone();
        let mut rows: Vec<(AgentMetadata, Option<UnavailableReason>)> = self
            .by_id
            .read()
            .await
            .values()
            .map(|m| {
                let reason = if m.available { None } else { reasons.get(&m.id).cloned() };
                (m.clone(), reason)
            })
            .collect();
        rows.sort_by(|(a, _), (b, _)| a.sort_order.cmp(&b.sort_order).then_with(|| a.name.cmp(&b.name)));
        rows
    }

    /// Clone-cheap handle to the underlying repo, for service-layer
    /// helpers that need direct CRUD access without going through the
    /// registry cache.
    pub fn repo_handle(&self) -> &Arc<dyn IAgentMetadataRepository> {
        &self.repo
    }
}

/// A catalog row is visible when the user has it enabled, the spawn
/// command was resolved at hydrate/refresh time, and the latest known
/// availability snapshot does not already mark it unavailable. This
/// keeps both uninstalled CLIs and rows that most recently failed
/// ACP/session admission out of visible legacy catalog reads.
fn is_visible(meta: &AgentMetadata) -> bool {
    meta.enabled && matches!(derive_management_status(meta, None), AgentManagementStatus::Online)
}

/// Extract and trim a command override, filtering out empty strings.
fn meta_command_override(raw: &Option<String>) -> Option<String> {
    raw.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// Parse env_override JSON string into a vector of AgentEnvEntry.
fn parse_env_override(raw: &Option<String>) -> Option<Vec<AgentEnvEntry>> {
    let s = raw.as_deref()?.trim();
    if s.is_empty() {
        return None;
    }
    serde_json::from_str::<Vec<AgentEnvEntry>>(s).ok()
}

#[derive(Clone, Copy)]
enum AvailabilityProjection {
    /// Use only deterministic row state plus persisted health snapshots.
    Cached,
    /// Resolve the spawn command against the current runtime environment.
    Probe,
}

/// Turn a DB row into the public `AgentMetadata`.
///
/// Callers choose whether availability should come from persisted snapshots
/// or from a live command probe. Startup hydration uses cached projection;
/// explicit refresh and single-agent health-check reloads use probe.
fn decode_row(
    row: AgentMetadataRow,
    availability: AvailabilityProjection,
) -> Option<(AgentMetadata, Option<UnavailableReason>)> {
    // Extract override fields before row is partially moved
    let command_override_raw = row.command_override.clone();
    let env_override_raw = row.env_override.clone();

    let agent_type = parse_agent_type(&row.agent_type)?;
    let agent_source = parse_agent_source(&row.agent_source)?;
    let agent_source_info = decode_json_field(row.agent_source_info.as_deref(), "agent_source_info")
        .unwrap_or_else(AgentSourceInfo::default);
    let args = decode_json_field::<Vec<String>>(row.args.as_deref(), "args").unwrap_or_default();
    let env = decode_json_field::<Vec<AgentEnvEntry>>(row.env.as_deref(), "env").unwrap_or_default();
    let native_skills_dirs = decode_json_field::<Vec<String>>(row.native_skills_dirs.as_deref(), "native_skills_dirs");
    let behavior_policy =
        decode_json_field(row.behavior_policy.as_deref(), "behavior_policy").unwrap_or_else(BehaviorPolicy::default);

    let handshake = AgentHandshake {
        agent_capabilities: parse_json(row.agent_capabilities.as_deref(), "agent_capabilities"),
        auth_methods: parse_json(row.auth_methods.as_deref(), "auth_methods"),
        config_options: parse_json(row.config_options.as_deref(), "config_options"),
        available_modes: parse_json(row.available_modes.as_deref(), "available_modes"),
        available_models: parse_json(row.available_models.as_deref(), "available_models"),
        available_commands: parse_json(row.available_commands.as_deref(), "available_commands"),
    };

    let backend_str = row.backend.as_deref().unwrap_or("");
    let inferred_team_capable = behavior_policy.supports_team
        || aionui_common::constants::is_team_capable(backend_str, handshake.agent_capabilities.as_ref());
    let team_capable = behavior_policy.team_capable_override.unwrap_or(inferred_team_capable);

    let mut meta = AgentMetadata {
        id: row.id,
        icon: row.icon,
        name: row.name,
        name_i18n: parse_json(row.name_i18n.as_deref(), "name_i18n"),
        description: row.description,
        description_i18n: parse_json(row.description_i18n.as_deref(), "description_i18n"),
        backend: row.backend,
        agent_type,
        agent_source,
        agent_source_info,
        enabled: row.enabled,
        available: false,
        command: row.command,
        resolved_command: None,
        args,
        env,
        native_skills_dirs,
        behavior_policy,
        yolo_id: row.yolo_id,
        sort_order: row.sort_order,
        team_capable,
        last_check_status: parse_last_check_status(row.last_check_status.as_deref()),
        last_check_kind: parse_last_check_kind(row.last_check_kind.as_deref()),
        last_check_error_code: row.last_check_error_code,
        last_check_error_message: row.last_check_error_message,
        last_check_error_details: None,
        last_check_guidance: row.last_check_guidance,
        last_check_latency_ms: row.last_check_latency_ms,
        last_check_at: row.last_check_at,
        last_success_at: row.last_success_at,
        last_failure_at: row.last_failure_at,
        handshake,
        has_command_override: false,
        env_override_key_count: 0,
    };

    // ── Self-repair overrides ──────────────────────────────────────
    // Layered on top of seed truth at this single projection point so both
    // the runtime spawn (factory) and the probe (availability) observe the
    // same merged command/env without either needing extra plumbing.
    let command_override = meta_command_override(&command_override_raw);
    let is_internal_aion_cli = is_internal_aion_cli(&meta);
    if is_internal_aion_cli && command_override.is_some() {
        warn!(
            id = %meta.id,
            name = %meta.name,
            "Ignoring command override for internal Aion CLI agent"
        );
    }
    let env_override = parse_env_override(&env_override_raw);
    if is_internal_aion_cli && env_override.as_ref().is_some_and(|entries| !entries.is_empty()) {
        warn!(
            id = %meta.id,
            name = %meta.name,
            "Ignoring environment overrides for internal Aion CLI agent"
        );
    }

    meta.has_command_override = command_override.is_some() && !is_internal_aion_cli;
    meta.env_override_key_count = env_override
        .as_ref()
        .filter(|_| !is_internal_aion_cli)
        .map(|v| v.iter().filter(|e| !is_blocked_override_env_key(&e.name)).count())
        .unwrap_or(0);

    if is_internal_aion_cli {
        meta.command = None;
    } else if let Some(path) = command_override {
        meta.command = Some(path);
    }
    if !is_internal_aion_cli && let Some(extra) = env_override {
        for entry in extra {
            if is_blocked_override_env_key(&entry.name) {
                tracing::warn!(key = %entry.name, "env override: blocked key skipped");
                continue;
            }
            meta.env.push(entry);
        }
    }

    let reason = match availability {
        AvailabilityProjection::Cached => apply_cached_availability(&mut meta),
        AvailabilityProjection::Probe => apply_probe_availability(&mut meta),
    };
    Some((meta, reason))
}

fn is_internal_aion_cli(meta: &AgentMetadata) -> bool {
    meta.agent_type == AgentType::Aionrs && meta.agent_source == AgentSource::Internal
}

fn is_internal_commandless_agent(meta: &AgentMetadata) -> bool {
    meta.enabled && meta.command.is_none() && meta.agent_source == AgentSource::Internal
}

fn apply_probe_availability(meta: &mut AgentMetadata) -> Option<UnavailableReason> {
    let (path, reason) = probe_with_reason(meta);
    meta.resolved_command = path;
    meta.available = meta.resolved_command.is_some() || is_internal_commandless_agent(meta);
    if meta.available { None } else { reason }
}

async fn validate_cli_availability(
    mut meta: AgentMetadata,
    reason: Option<UnavailableReason>,
) -> (AgentMetadata, Option<UnavailableReason>) {
    if !meta.available || meta.agent_source != AgentSource::Builtin {
        return (meta, reason);
    }

    let Some(binary) = crate::cli_probe::command_name(&meta).map(str::to_owned) else {
        return (meta, reason);
    };

    match crate::cli_probe::validate(&meta).await {
        Ok(()) => (meta, None),
        Err(detail) => {
            meta.available = false;
            meta.resolved_command = None;
            (meta, Some(UnavailableReason::PrimaryUnusable { binary, detail }))
        }
    }
}

async fn validate_cli_candidates(
    candidates: Vec<(AgentMetadata, Option<UnavailableReason>)>,
) -> Vec<(AgentMetadata, Option<UnavailableReason>)> {
    futures_util::stream::iter(candidates)
        .map(|(meta, reason)| validate_cli_availability(meta, reason))
        .buffer_unordered(CLI_PROBE_CONCURRENCY)
        .collect()
        .await
}

fn apply_cached_availability(meta: &mut AgentMetadata) -> Option<UnavailableReason> {
    if !meta.enabled {
        meta.available = false;
        return Some(UnavailableReason::Disabled);
    }
    if is_internal_commandless_agent(meta) {
        meta.available = true;
        return None;
    }
    if cached_snapshot_indicates_missing(meta) {
        meta.available = false;
        return cached_unavailable_reason(meta);
    }
    if !has_availability_snapshot(meta) {
        meta.available = false;
        return if is_builtin_managed_agent(meta) {
            None
        } else if meta.command.as_deref().filter(|s| !s.is_empty()).is_none() {
            Some(UnavailableReason::NoCommand)
        } else {
            None
        };
    }
    meta.available = true;
    None
}

fn is_builtin_managed_agent(meta: &AgentMetadata) -> bool {
    meta.agent_source == AgentSource::Builtin && matches!(meta.backend.as_deref(), Some("claude") | Some("codex"))
}

fn has_availability_snapshot(meta: &AgentMetadata) -> bool {
    meta.last_check_status.is_some()
        || meta.last_check_kind.is_some()
        || meta.last_check_error_code.is_some()
        || meta.last_check_at.is_some()
        || meta.last_success_at.is_some()
        || meta.last_failure_at.is_some()
}

fn cached_snapshot_indicates_missing(meta: &AgentMetadata) -> bool {
    matches!(
        meta.last_check_error_code.as_deref(),
        Some(
            "command_not_found"
                | "command_missing"
                | "primary_missing"
                | "bridge_missing"
                | "managed_runtime_unavailable"
                | "no_command"
                | "disabled"
        )
    )
}

fn cached_unavailable_reason(meta: &AgentMetadata) -> Option<UnavailableReason> {
    match meta.last_check_error_code.as_deref()? {
        "disabled" => Some(UnavailableReason::Disabled),
        "no_command" => Some(UnavailableReason::NoCommand),
        "bridge_missing" => meta
            .agent_source_info
            .bridge_binary
            .clone()
            .map(|bridge| UnavailableReason::BridgeMissing { bridge }),
        "primary_missing" => meta
            .agent_source_info
            .binary_name
            .clone()
            .map(|binary| UnavailableReason::PrimaryMissing { binary }),
        "command_not_found" | "command_missing" => Some(UnavailableReason::CommandMissing {
            command: meta
                .agent_source_info
                .binary_name
                .clone()
                .or_else(|| meta.command.clone())
                .unwrap_or_else(|| "command".to_owned()),
        }),
        "managed_runtime_unavailable" => Some(UnavailableReason::ManagedRuntimeUnavailable {
            resource: meta.backend.clone().unwrap_or_else(|| "runtime".to_owned()),
            detail: meta
                .last_check_error_message
                .clone()
                .unwrap_or_else(|| "managed runtime was unavailable during the last health check".to_owned()),
        }),
        _ => None,
    }
}

/// Wrapper around [`probe_resolved_command`] that returns both the
/// resolved path (if any) and the failure reason as a tuple, so the
/// hydrate / refresh loops can persist the path and emit a single
/// uniform log line per row.
fn probe_with_reason(meta: &AgentMetadata) -> (Option<PathBuf>, Option<UnavailableReason>) {
    match probe_resolved_command(meta) {
        Ok(path) => (Some(path), None),
        Err(reason) => (None, Some(reason)),
    }
}

/// Emit a single per-row line summarizing the probe outcome. Available
/// rows go to `debug!` (one per startup × N agents is noisy at info);
/// unavailable rows go to `info!` so the default aioncore.log surfaces
/// the reason without needing `--log-level debug` after a user
/// reports "no agent works".
fn log_probe_result(meta: &AgentMetadata, reason: &Option<UnavailableReason>) {
    let backend = meta.backend.as_deref().unwrap_or("-");
    let source = format!("{:?}", meta.agent_source);
    match (meta.available, reason) {
        (true, _) => {
            debug!(
                id = %meta.id,
                name = %meta.name,
                backend,
                source = %source,
                command = meta.command.as_deref().unwrap_or("-"),
                resolved = %meta
                    .resolved_command
                    .as_deref()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|| "<internal>".to_owned()),
                "agent   available"
            );
        }
        (false, Some(reason)) => {
            info!(
                id = %meta.id,
                name = %meta.name,
                backend,
                source = %source,
                command = meta.command.as_deref().unwrap_or("-"),
                reason = %reason,
                "agent unavailable"
            );
        }
        (false, None) => {
            // Probe succeeded internally but `available` still false —
            // shouldn't happen given current rules, but we'd want to
            // know if it does.
            warn!(
                id = %meta.id,
                name = %meta.name,
                backend,
                source = %source,
                "agent marked unavailable without a probe reason — registry invariant violated"
            );
        }
    }
}

/// One-line summary at the end of hydrate / refresh: total / available
/// / unavailable counts plus a comma-joined list of unavailable
/// `id:reason` pairs (truncated to the first 12 to keep log lines
/// bounded). Goes to `info!` so it's visible at the default level.
fn log_availability_summary<'a, I>(rows: I, message: &'static str)
where
    I: IntoIterator<Item = &'a AgentMetadata>,
{
    let mut total = 0usize;
    let mut available = 0usize;
    let mut unavailable_ids: Vec<String> = Vec::new();
    for meta in rows {
        total += 1;
        if meta.available {
            available += 1;
        } else {
            unavailable_ids.push(meta.id.clone());
        }
    }
    let unavailable = total - available;
    let preview: String = if unavailable_ids.is_empty() {
        String::new()
    } else {
        let cap = unavailable_ids.len().min(12);
        let mut joined = unavailable_ids[..cap].join(", ");
        if unavailable_ids.len() > cap {
            joined.push_str(&format!(", … (+{} more)", unavailable_ids.len() - cap));
        }
        joined
    };
    info!(total, available, unavailable, unavailable_ids = %preview, "{}", message);
}

fn parse_agent_type(raw: &str) -> Option<AgentType> {
    serde_json::from_value(Value::String(raw.to_owned())).ok()
}

fn parse_agent_source(raw: &str) -> Option<AgentSource> {
    serde_json::from_value(Value::String(raw.to_owned())).ok()
}

fn parse_last_check_status(raw: Option<&str>) -> Option<AgentSnapshotCheckStatus> {
    raw.and_then(|value| match value {
        "online" => Some(AgentSnapshotCheckStatus::Online),
        "offline" => Some(AgentSnapshotCheckStatus::Offline),
        _ => {
            warn!(value, "agent_metadata: unknown last_check_status");
            None
        }
    })
}

fn parse_last_check_kind(raw: Option<&str>) -> Option<AgentSnapshotCheckKind> {
    raw.and_then(|value| match value {
        "startup" => Some(AgentSnapshotCheckKind::Startup),
        "scheduled" => Some(AgentSnapshotCheckKind::Scheduled),
        "manual" => Some(AgentSnapshotCheckKind::Manual),
        "session" => Some(AgentSnapshotCheckKind::Session),
        _ => {
            warn!(value, "agent_metadata: unknown last_check_kind");
            None
        }
    })
}

fn derive_management_status(meta: &AgentMetadata, reason: Option<&UnavailableReason>) -> AgentManagementStatus {
    if !meta.available {
        if reason.is_some() || has_availability_snapshot(meta) {
            return AgentManagementStatus::Missing;
        }
        return AgentManagementStatus::Unchecked;
    }
    if is_internal_commandless_agent(meta) {
        return AgentManagementStatus::Online;
    }

    match meta.last_check_status {
        Some(AgentSnapshotCheckStatus::Offline) => AgentManagementStatus::Offline,
        Some(AgentSnapshotCheckStatus::Online) => AgentManagementStatus::Online,
        None => AgentManagementStatus::Unchecked,
    }
}

struct ManagementDiagnostics {
    error_code: Option<String>,
    error_message: Option<String>,
    details: Option<Value>,
    guidance: Option<String>,
}

fn derive_management_diagnostics(
    meta: &AgentMetadata,
    status: AgentManagementStatus,
    reason: Option<&UnavailableReason>,
) -> ManagementDiagnostics {
    let derived_reason = if matches!(status, AgentManagementStatus::Missing) {
        reason.cloned()
    } else {
        None
    };

    let error_code = meta
        .last_check_error_code
        .clone()
        .or_else(|| derived_reason.as_ref().map(unavailable_reason_code));
    let error_message = meta
        .last_check_error_message
        .clone()
        .or_else(|| derived_reason.as_ref().map(|reason| reason.to_string()));
    let details = derived_reason
        .as_ref()
        .and_then(diagnostic_details_for_unavailable_reason)
        .or_else(|| {
            error_code
                .as_deref()
                .and_then(|code| diagnostic_details_for_snapshot_code(meta, code))
        });
    let guidance = meta.last_check_guidance.clone().or_else(|| {
        if let Some(reason) = derived_reason.as_ref() {
            Some(guidance_for_unavailable_reason(reason))
        } else {
            error_code
                .as_deref()
                .map(guidance_for_snapshot_error_code)
                .filter(|guidance| !guidance.is_empty())
                .map(str::to_owned)
        }
    });

    ManagementDiagnostics {
        error_code,
        error_message,
        details,
        guidance,
    }
}

fn diagnostic_details_for_snapshot_code(meta: &AgentMetadata, error_code: &str) -> Option<Value> {
    match error_code {
        "command_not_found" => Some(json!({
            "code": error_code,
            "command": meta
                .agent_source_info
                .binary_name
                .as_deref()
                .or(meta.command.as_deref())
                .unwrap_or("command"),
        })),
        "acp_init_failed" | "health_check_failed" | "session_send_failed" => Some(json!({
            "code": error_code,
            "agent_name": meta.name,
            "backend": meta.backend,
        })),
        _ => Some(json!({ "code": error_code })),
    }
}

fn diagnostic_details_for_unavailable_reason(reason: &UnavailableReason) -> Option<Value> {
    match reason {
        UnavailableReason::Disabled => Some(json!({ "code": "disabled" })),
        UnavailableReason::NoCommand => Some(json!({ "code": "no_command" })),
        UnavailableReason::BridgeMissing { bridge } => Some(json!({
            "code": "bridge_missing",
            "command": bridge,
        })),
        UnavailableReason::PrimaryMissing { binary } => Some(json!({
            "code": "primary_missing",
            "command": binary,
        })),
        UnavailableReason::PrimaryUnusable { binary, .. } => Some(json!({
            "code": "primary_unusable",
            "command": binary,
        })),
        UnavailableReason::CommandMissing { command } => Some(json!({
            "code": "command_missing",
            "command": command,
        })),
        UnavailableReason::ManagedRuntimeUnavailable { resource, .. } => Some(json!({
            "code": "managed_runtime_unavailable",
            "resource": resource,
        })),
    }
}

fn unavailable_reason_code(reason: &UnavailableReason) -> String {
    match reason {
        UnavailableReason::Disabled => "disabled",
        UnavailableReason::NoCommand => "no_command",
        UnavailableReason::BridgeMissing { .. } => "bridge_missing",
        UnavailableReason::PrimaryMissing { .. } => "primary_missing",
        UnavailableReason::PrimaryUnusable { .. } => "primary_unusable",
        UnavailableReason::CommandMissing { .. } => "command_missing",
        UnavailableReason::ManagedRuntimeUnavailable { .. } => "managed_runtime_unavailable",
    }
    .to_owned()
}

fn guidance_for_unavailable_reason(reason: &UnavailableReason) -> String {
    match reason {
        UnavailableReason::Disabled => "Enable this agent to make it available again.".to_owned(),
        UnavailableReason::NoCommand => {
            "Configure a spawn command for this agent, then run Test Connection again.".to_owned()
        }
        UnavailableReason::BridgeMissing { bridge } => {
            format!("Install `{bridge}` and make sure it is available on PATH, then run Test Connection again.")
        }
        UnavailableReason::PrimaryMissing { binary } => {
            format!("Install `{binary}` and make sure it is available on PATH, then run Test Connection again.")
        }
        UnavailableReason::PrimaryUnusable { binary, .. } => {
            format!("Repair or reinstall `{binary}`, then run Test Connection again.")
        }
        UnavailableReason::CommandMissing { command } => {
            format!("Install `{command}` and make sure it is available on PATH, then run Test Connection again.")
        }
        UnavailableReason::ManagedRuntimeUnavailable { resource, .. } => {
            format!("Repair or reinstall the managed `{resource}` runtime, then run Test Connection again.")
        }
    }
}

/// Keys a user-supplied env override must never set — they would corrupt the
/// agent's runtime environment or AionUi-internal wiring. Case-insensitive.
pub(crate) fn is_blocked_override_env_key(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();
    if upper.starts_with("AIONUI_") {
        return true;
    }
    matches!(
        upper.as_str(),
        "HOME" | "PATH" | "USER" | "SHELL" | "TERM" | "CODEX_HOME"
    )
}

pub(crate) fn guidance_for_snapshot_error_code(error_code: &str) -> &'static str {
    match error_code {
        "command_not_found" => {
            "Install the required CLI and make sure it is available on PATH, then run Test Connection again."
        }
        "acp_init_failed" => {
            "The CLI was found, but ACP initialization failed. Complete sign-in or setup in the CLI, then run Test Connection again."
        }
        "auth_required" => {
            "The agent is reachable but requires sign-in. Log in via the CLI (or add the required API key under Environment Variables), then run Test Connection again."
        }
        "health_check_failed" => {
            "Open the CLI once to finish any first-run setup or sign-in flow, then run Test Connection again."
        }
        "session_send_failed" => {
            "Fix the provider credentials or network issue that caused the last session failure, then start a new conversation."
        }
        "no_provider" => "Add and enable a model provider in Settings, then run Test Connection again.",
        _ => "",
    }
}

fn decode_json_field<T: serde::de::DeserializeOwned>(raw: Option<&str>, field: &str) -> Option<T> {
    raw.and_then(|s| match serde_json::from_str(s) {
        Ok(v) => Some(v),
        Err(err) => {
            warn!(field, error = %err, "agent_metadata: failed to decode JSON column");
            None
        }
    })
}

fn parse_json(raw: Option<&str>, field: &str) -> Option<Value> {
    raw.and_then(|s| match serde_json::from_str::<Value>(s) {
        Ok(v) => Some(v),
        Err(err) => {
            warn!(field, error = %err, "agent_metadata: failed to parse JSON");
            None
        }
    })
}

fn encode_optional(value: &Option<Value>, field: &str) -> Result<Option<String>, AgentError> {
    match value {
        Some(v) => serde_json::to_string(v)
            .map(Some)
            .map_err(|e| AgentError::internal(format!("encode {field}: {e}"))),
        None => Ok(None),
    }
}

/// Cloneable handle each `AcpAgentManager` holds to forward ACP events
/// into the registry's background consumer task. Dropping it is cheap
/// and does not affect the consumer — the registry itself keeps one
/// sender alive for the life of the process.
#[derive(Clone)]
pub struct CatalogSender {
    tx: mpsc::Sender<CatalogSyncMessage>,
}

impl CatalogSender {
    /// Submit a partial handshake update. Returns without error when the
    /// channel is closed (only happens at shutdown) or full — callers do
    /// not need to care because the consumer is best-effort.
    pub fn send_partial(&self, agent_metadata_id: String, handshake: AgentHandshake) {
        let msg = CatalogSyncMessage {
            agent_metadata_id,
            handshake,
        };
        if let Err(err) = self.tx.try_send(msg) {
            use mpsc::error::TrySendError;
            match err {
                TrySendError::Full(_) => {
                    warn!("Catalog sync channel full; dropping handshake update");
                }
                TrySendError::Closed(_) => {
                    debug!("Catalog sync channel closed; consumer already shut down");
                }
            }
        }
    }
}

/// Why a row's spawn command failed to resolve at hydrate/refresh time.
/// Carried alongside the resolved path so callers (logging, the
/// `doctor` command) can explain availability without re-running the
/// probe themselves. The variants line up 1:1 with the early-return
/// branches in [`probe_resolved_command`].
#[derive(Debug, Clone)]
pub enum UnavailableReason {
    /// Row is user-disabled (`enabled = 0`). The probe short-circuits
    /// without touching `$PATH`.
    Disabled,
    /// Row has no `command` set. Internal rows legitimately fall in
    /// this bucket (handled in `decode_row`); for everyone else this
    /// is a seed-data bug.
    NoCommand,
    /// Bridge binary (`agent_source_info.bridge_binary`, e.g. `npx`
    /// for `npx --yes @pkg`) is not on `$PATH`.
    BridgeMissing { bridge: String },
    /// Primary CLI (`agent_source_info.binary_name`, e.g. `claude`
    /// for the bridged Claude row) is not on `$PATH`.
    PrimaryMissing { binary: String },
    /// Primary CLI resolves on `$PATH`, but its lightweight version probe
    /// failed, so the wrapper cannot be treated as runnable.
    PrimaryUnusable { binary: String, detail: String },
    /// Spawn command itself (`command` field) is not on `$PATH`. For
    /// direct-CLI rows this is the same binary as `binary_name`; for
    /// bridge rows it's the bridge.
    CommandMissing { command: String },
    /// Managed runtime/tool support is unavailable even though the row
    /// itself is builtin and no ambient PATH lookup should be required.
    ManagedRuntimeUnavailable { resource: String, detail: String },
}

impl std::fmt::Display for UnavailableReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Disabled => f.write_str("row disabled by user"),
            Self::NoCommand => f.write_str("no spawn command configured"),
            Self::BridgeMissing { bridge } => write!(f, "bridge binary `{bridge}` not on $PATH"),
            Self::PrimaryMissing { binary } => write!(f, "primary binary `{binary}` not on $PATH"),
            Self::PrimaryUnusable { binary, detail } => {
                write!(f, "primary binary `{binary}` is not runnable: {detail}")
            }
            Self::CommandMissing { command } => write!(f, "spawn command `{command}` not on $PATH"),
            Self::ManagedRuntimeUnavailable { resource, detail } => {
                write!(f, "managed `{resource}` unavailable: {detail}")
            }
        }
    }
}

/// Resolve the spawn command to an absolute path via `$PATH`. Returns
/// `Ok(path)` when every required binary is present, or `Err(reason)`
/// pinpointing the first missing piece. The value is the single
/// source of truth for `available` — callers never re-run `which()`
/// themselves.
///
/// Bridge-based rows (e.g. `npx --yes @pkg`) require both `npx` (the
/// spawn command) and the wrapped CLI (`claude`, recorded in
/// `agent_source_info.binary_name`) to be present. Direct-CLI rows
/// have `spawn command == primary binary`, so the primary-binary check
/// is a no-op for them.
fn probe_resolved_command(meta: &AgentMetadata) -> Result<PathBuf, UnavailableReason> {
    if !meta.enabled {
        return Err(UnavailableReason::Disabled);
    }

    // Builtin claude/codex run as direct CLIs now: availability is a PATH-only
    // probe of the primary command (packaged app ships the binary, but PATH
    // presence is our proxy for "user installed + authenticated" — see
    // managed_cli / cli_probe). No node/ACP-tool preparation is involved.
    if is_builtin_managed_agent(meta) {
        let primary = crate::cli_probe::command_name(meta).ok_or(UnavailableReason::NoCommand)?;
        return probe_command_candidate(primary).ok_or_else(|| UnavailableReason::PrimaryMissing {
            binary: primary.to_owned(),
        });
    }

    let Some(cmd) = meta.command.as_deref().filter(|s| !s.is_empty()) else {
        return Err(UnavailableReason::NoCommand);
    };

    if let Some(bridge) = meta.agent_source_info.bridge_binary.as_deref()
        && bridge != cmd
        && probe_command_candidate(bridge).is_none()
    {
        return Err(UnavailableReason::BridgeMissing {
            bridge: bridge.to_owned(),
        });
    }
    if let Some(primary) = meta.agent_source_info.binary_name.as_deref()
        && primary != cmd
        && meta.agent_source_info.bridge_binary.as_deref() != Some(primary)
        && probe_command_candidate(primary).is_none()
    {
        return Err(UnavailableReason::PrimaryMissing {
            binary: primary.to_owned(),
        });
    }

    probe_command_candidate(cmd).ok_or_else(|| UnavailableReason::CommandMissing {
        command: cmd.to_owned(),
    })
}

fn probe_command_candidate(command: &str) -> Option<PathBuf> {
    match probe_runtime_command(command) {
        RuntimeCommandProbe::ExplicitPath { path } => path.exists().then_some(path),
        RuntimeCommandProbe::PathLookup { command } => resolve_command_path(&command),
        RuntimeCommandProbe::NodeTool { command, .. } => probe_node_runtime_supported()
            .is_supported()
            .then(|| PathBuf::from(command)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aionui_db::{SqliteAgentMetadataRepository, init_database_memory};

    async fn registry() -> Arc<AgentRegistry> {
        let db = init_database_memory().await.unwrap();
        let repo = Arc::new(SqliteAgentMetadataRepository::new(db.pool().clone()));
        let reg = AgentRegistry::new(repo);
        reg.hydrate().await.unwrap();
        reg
    }

    #[tokio::test]
    async fn hydrate_loads_seed_rows() {
        // `list_all_including_hidden` bypasses the available/enabled
        // filter so this assertion keeps counting the seed rows even
        // when none of the CLIs are installed on the test host.
        let reg = registry().await;
        let all = reg.list_all_including_hidden().await;
        assert_eq!(all.len(), 40);
    }

    #[tokio::test]
    async fn find_builtin_claude_uses_managed_acp_runtime_metadata() {
        let reg = registry().await;
        let m = reg.find_builtin_by_backend("claude").await.unwrap();
        assert!(m.command.is_none());
        assert!(m.args.is_empty());
        assert!(m.agent_source_info.bridge_binary.is_none());
        assert!(m.behavior_policy.supports_side_question);
        assert_eq!(
            m.native_skills_dirs.as_deref(),
            Some(&[".claude/skills".to_string()][..])
        );
    }

    #[tokio::test]
    async fn codex_yolo_id_maps_to_agent_full_access() {
        let reg = registry().await;
        let codex = reg.find_builtin_by_backend("codex").await.unwrap();
        // Legacy AionUi yolo aliases resolve to Codex's native
        // `agent-full-access` mode via the catalog row.
        assert_eq!(codex.yolo_id.as_deref(), Some("agent-full-access"));
    }

    #[tokio::test]
    async fn claude_yolo_id_maps_to_bypass_permissions() {
        let reg = registry().await;
        let claude = reg.find_builtin_by_backend("claude").await.unwrap();
        assert_eq!(claude.yolo_id.as_deref(), Some("bypassPermissions"));
    }

    #[tokio::test]
    async fn hermes_builtin_does_not_advertise_a_yolo_id() {
        let reg = registry().await;
        let hermes = reg.find_builtin_by_backend("hermes").await.unwrap();
        assert_eq!(hermes.yolo_id, None);
    }

    #[tokio::test]
    async fn pi_builtin_uses_stable_acp_adapter_and_requires_pi_cli() {
        let reg = registry().await;
        let pi = reg.find_builtin_by_backend("pi").await.unwrap();

        assert_eq!(pi.command.as_deref(), Some("npx"));
        assert_eq!(pi.args, ["-y", "pi-acp"]);
        assert_eq!(pi.agent_source_info.binary_name.as_deref(), Some("pi"));
        assert_eq!(pi.agent_source_info.bridge_binary.as_deref(), Some("npx"));
        assert_eq!(pi.native_skills_dirs.as_deref(), Some(&[".pi/skills".to_owned()][..]));
        assert!(!pi.team_capable);
        assert_eq!(pi.yolo_id, None);
        assert_eq!(
            pi.handshake
                .agent_capabilities
                .as_ref()
                .and_then(|capabilities| capabilities.get("load_session"))
                .and_then(serde_json::Value::as_bool),
            Some(true)
        );
    }

    #[tokio::test]
    async fn grok_build_builtin_is_team_capable() {
        let reg = registry().await;
        let grok = reg.find_builtin_by_backend("grok").await.unwrap();

        assert_eq!(grok.command.as_deref(), Some("npx"));
        assert_eq!(grok.args, ["-y", "@xai-official/grok", "agent", "stdio"]);
        assert_eq!(grok.agent_source_info.binary_name.as_deref(), Some("grok"));
        assert_eq!(grok.agent_source_info.bridge_binary.as_deref(), Some("npx"));
        // Migration 037 clears the hard team disable and sets supports_team so
        // agent.team_capable → assistant.team_selectable can become true.
        assert!(grok.behavior_policy.supports_team);
        assert_eq!(grok.behavior_policy.team_capable_override, None);
        assert!(grok.team_capable, "Grok Build must be team_capable for Team picker");
    }

    #[tokio::test]
    async fn every_builtin_npx_agent_has_a_release_lock() {
        let reg = registry().await;
        let all = reg.list_all_including_hidden().await;
        let mut locked = 0;
        for meta in all
            .iter()
            .filter(|meta| meta.agent_source == AgentSource::Builtin && meta.command.as_deref() == Some("npx"))
        {
            let backend = meta.backend.as_deref().expect("builtin npx backend");
            aionui_runtime::pin_registry_npx_args(backend, &meta.args)
                .unwrap_or_else(|error| panic!("missing release lock for {backend}: {error}"));
            locked += 1;
        }
        assert_eq!(locked, 11);
    }

    /// On a host that has *none* of the seeded CLIs installed, the
    /// public listing collapses to the rows that don't need one
    /// (Aion CLI is `agent_source = internal` with no `command`).
    /// This guards the pill-bar contract: never show an unusable
    /// vendor.
    #[tokio::test]
    async fn list_all_filters_out_unavailable_rows() {
        let reg = registry().await;
        let visible = reg.list_all().await;
        assert!(
            visible.iter().all(|m| m.enabled && m.available),
            "list_all must only return enabled + available rows, got: {:?}",
            visible
                .iter()
                .map(|m| (&m.id, m.enabled, m.available))
                .collect::<Vec<_>>()
        );
        // Aion CLI (internal, no spawn command) is always available.
        assert!(
            visible.iter().any(|m| m.agent_type == AgentType::Aionrs),
            "internal aionrs row should survive the filter"
        );
    }

    #[tokio::test]
    async fn list_by_agent_type_counts_seed_rows() {
        // Seed counts — exercised against the unfiltered view because
        // on CI hosts the CLIs aren't installed, so `list_by_agent_type`
        // (which applies the visibility filter) would report zero.
        let reg = registry().await;
        let all = reg.list_all_including_hidden().await;
        let count = |t: AgentType| all.iter().filter(|m| m.agent_type == t).count();
        assert_eq!(count(AgentType::Acp), 37);
        assert_eq!(count(AgentType::Nanobot), 1);
        assert_eq!(count(AgentType::OpenclawGateway), 1);
        assert_eq!(count(AgentType::Aionrs), 1);
    }

    #[tokio::test]
    async fn aionrs_internal_row_is_available_without_command() {
        let reg = registry().await;
        let aionrs = reg
            .list_by_agent_type(AgentType::Aionrs)
            .await
            .into_iter()
            .next()
            .unwrap();
        assert_eq!(aionrs.agent_source, AgentSource::Internal);
        assert!(aionrs.command.is_none());
        assert!(aionrs.available);
    }

    #[tokio::test]
    async fn apply_handshake_persists_json_payload() {
        let reg = registry().await;
        let claude = reg.find_builtin_by_backend("claude").await.unwrap();

        let snapshot = AgentHandshake {
            auth_methods: Some(serde_json::json!([
                {"type":"agent","id":"oauth","name":"OAuth"}
            ])),
            ..Default::default()
        };
        reg.apply_handshake_inner(&claude.id, &snapshot).await.unwrap();

        let refreshed = reg.get(&claude.id).await.unwrap();
        let methods = refreshed.handshake.auth_methods.unwrap();
        assert_eq!(methods.as_array().unwrap().len(), 1);
    }

    /// Partial updates must leave unrelated columns untouched.
    ///
    /// Three consecutive writes target three different columns — each
    /// later write only carries one `Some(..)` field, the rest are
    /// `None`. After all three land, every earlier value must still be
    /// readable. This locks the contract that `None` means "don't
    /// touch" (as opposed to "clear to null"), which is what the
    /// `initialize` / `session/new` / `AvailableCommandsUpdate` write
    /// sites rely on.
    #[tokio::test]
    async fn apply_handshake_is_partial_does_not_clobber_siblings() {
        let reg = registry().await;
        let claude = reg.find_builtin_by_backend("claude").await.unwrap();

        // Write #1: agent_capabilities only.
        reg.apply_handshake_inner(
            &claude.id,
            &AgentHandshake {
                agent_capabilities: Some(serde_json::json!({"load_session": true})),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        // Write #2: auth_methods only. Capabilities must survive.
        reg.apply_handshake_inner(
            &claude.id,
            &AgentHandshake {
                auth_methods: Some(serde_json::json!([{"type": "agent", "id": "oauth"}])),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        // Write #3: available_modes only. Capabilities + auth_methods must survive.
        reg.apply_handshake_inner(
            &claude.id,
            &AgentHandshake {
                available_modes: Some(serde_json::json!([{"id": "code", "name": "Code"}])),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let refreshed = reg.get(&claude.id).await.unwrap();
        assert_eq!(
            refreshed.handshake.agent_capabilities,
            Some(serde_json::json!({"load_session": true})),
            "agent_capabilities must survive later partial writes"
        );
        assert!(
            refreshed.handshake.auth_methods.is_some(),
            "auth_methods must survive the later available_modes write"
        );
        assert!(refreshed.handshake.available_modes.is_some());
        // The untouched fields stay untouched (still None from seed).
        assert!(refreshed.handshake.available_models.is_none());
        assert!(refreshed.handshake.config_options.is_none());
        assert!(refreshed.handshake.available_commands.is_none());
    }

    /// `diagnostic_snapshot` returns one entry per row, populates a
    /// reason for rows known unavailable by probe/cache, and leaves
    /// available or unchecked rows without one. Unchecked rows are
    /// expected after startup hydration avoids live probing.
    #[tokio::test]
    async fn diagnostic_snapshot_pairs_rows_with_reasons() {
        let reg = registry().await;
        let snapshot = reg.diagnostic_snapshot().await;
        assert_eq!(snapshot.len(), 40, "every row appears once");

        for (meta, reason) in &snapshot {
            match (meta.available, reason) {
                (true, None) => {}
                (false, Some(_)) => {}
                (false, None) if matches!(derive_management_status(meta, None), AgentManagementStatus::Unchecked) => {}
                (true, Some(r)) => panic!("available row {} has unexpected reason {:?}", meta.id, r),
                (false, None) => panic!(
                    "unavailable row {} (source={:?}) is missing a reason",
                    meta.id, meta.agent_source
                ),
            }
        }

        // The internal aionrs row is always available — its reason
        // slot must be None (sanity check that "available" doesn't
        // accidentally co-occur with a reason).
        let aionrs = snapshot
            .iter()
            .find(|(m, _)| m.agent_type == AgentType::Aionrs)
            .expect("aionrs seed row");
        assert!(aionrs.0.available);
        assert!(aionrs.1.is_none());
    }

    /// An empty snapshot is a no-op — no column gets overwritten.
    #[tokio::test]
    async fn apply_handshake_with_empty_snapshot_is_noop() {
        let reg = registry().await;
        let claude = reg.find_builtin_by_backend("claude").await.unwrap();

        reg.apply_handshake_inner(
            &claude.id,
            &AgentHandshake {
                agent_capabilities: Some(serde_json::json!({"x": 1})),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        reg.apply_handshake_inner(&claude.id, &AgentHandshake::default())
            .await
            .unwrap();

        let refreshed = reg.get(&claude.id).await.unwrap();
        assert_eq!(
            refreshed.handshake.agent_capabilities,
            Some(serde_json::json!({"x": 1}))
        );
    }

    #[test]
    fn blocked_override_env_keys() {
        for k in [
            "HOME",
            "PATH",
            "USER",
            "SHELL",
            "TERM",
            "CODEX_HOME",
            "AIONUI_FOO",
            "aionui_bar",
            "path",
        ] {
            assert!(super::is_blocked_override_env_key(k), "{k} should be blocked");
        }
        for k in ["ANTHROPIC_API_KEY", "FACTORY_API_KEY", "MY_VAR"] {
            assert!(!super::is_blocked_override_env_key(k), "{k} should be allowed");
        }
    }

    #[test]
    fn decode_row_applies_command_override() {
        use aionui_db::AgentMetadataRow;
        let row = AgentMetadataRow {
            id: "test-agent".to_string(),
            icon: None,
            name: "Test Agent".to_string(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            backend: Some("test".to_string()),
            agent_type: "acp".to_string(),
            agent_source: "builtin".to_string(),
            agent_source_info: None,
            enabled: true,
            command: Some("droid".to_string()),
            command_override: Some("/opt/factory/bin/droid".to_string()),
            args: None,
            env: None,
            native_skills_dirs: None,
            behavior_policy: None,
            yolo_id: None,
            agent_capabilities: None,
            auth_methods: None,
            config_options: None,
            available_modes: None,
            available_models: None,
            available_commands: None,
            sort_order: 0,
            last_check_status: None,
            last_check_kind: None,
            last_check_error_code: None,
            last_check_error_message: None,
            last_check_guidance: None,
            last_check_latency_ms: None,
            last_check_at: None,
            last_success_at: None,
            last_failure_at: None,
            env_override: None,
            created_at: 0,
            updated_at: 0,
        };
        let (meta, _) = super::decode_row(row, super::AvailabilityProjection::Cached).expect("decodes");
        assert_eq!(meta.command.as_deref(), Some("/opt/factory/bin/droid"));
    }

    #[test]
    fn decode_row_ignores_internal_aion_cli_overrides() {
        use aionui_db::AgentMetadataRow;
        let row = AgentMetadataRow {
            id: "632f31d2".to_string(),
            icon: None,
            name: "Aion CLI".to_string(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            backend: None,
            agent_type: "aionrs".to_string(),
            agent_source: "internal".to_string(),
            agent_source_info: None,
            enabled: true,
            command: None,
            command_override: Some("irm https://claude.ai/install.ps1 | iex".to_string()),
            args: None,
            env: None,
            native_skills_dirs: None,
            behavior_policy: None,
            yolo_id: None,
            agent_capabilities: None,
            auth_methods: None,
            config_options: None,
            available_modes: None,
            available_models: None,
            available_commands: None,
            sort_order: 0,
            last_check_status: None,
            last_check_kind: None,
            last_check_error_code: None,
            last_check_error_message: None,
            last_check_guidance: None,
            last_check_latency_ms: None,
            last_check_at: None,
            last_success_at: None,
            last_failure_at: None,
            env_override: Some(
                r#"[{"name":"ANTHROPIC_API_KEY","value":"sk-x"},{"name":"PATH","value":"/evil"}]"#.to_string(),
            ),
            created_at: 0,
            updated_at: 0,
        };
        let (meta, reason) = super::decode_row(row, super::AvailabilityProjection::Cached).expect("decodes");
        assert_eq!(meta.agent_type, AgentType::Aionrs);
        assert_eq!(meta.agent_source, AgentSource::Internal);
        assert_eq!(meta.command, None);
        assert!(!meta.has_command_override);
        assert_eq!(meta.env_override_key_count, 0);
        assert!(meta.env.is_empty());
        assert!(meta.available);
        assert!(reason.is_none());
    }

    #[test]
    fn decode_row_appends_env_override_and_skips_blocked() {
        use aionui_db::AgentMetadataRow;
        let row = AgentMetadataRow {
            id: "test-agent-2".to_string(),
            icon: None,
            name: "Test Agent 2".to_string(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            backend: Some("test".to_string()),
            agent_type: "acp".to_string(),
            agent_source: "builtin".to_string(),
            agent_source_info: None,
            enabled: true,
            command: Some("test-cmd".to_string()),
            command_override: None,
            args: None,
            env: Some(r#"[{"name":"BASE","value":"seed","description":""}]"#.to_string()),
            native_skills_dirs: None,
            behavior_policy: None,
            yolo_id: None,
            agent_capabilities: None,
            auth_methods: None,
            config_options: None,
            available_modes: None,
            available_models: None,
            available_commands: None,
            sort_order: 0,
            last_check_status: None,
            last_check_kind: None,
            last_check_error_code: None,
            last_check_error_message: None,
            last_check_guidance: None,
            last_check_latency_ms: None,
            last_check_at: None,
            last_success_at: None,
            last_failure_at: None,
            env_override: Some(
                r#"[{"name":"ANTHROPIC_API_KEY","value":"sk-x","description":""},{"name":"PATH","value":"/evil","description":""}]"#.to_string(),
            ),
            created_at: 0,
            updated_at: 0,
        };
        let (meta, _) = super::decode_row(row, super::AvailabilityProjection::Cached).expect("decodes");
        let names: Vec<&str> = meta.env.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"BASE"));
        assert!(names.contains(&"ANTHROPIC_API_KEY"));
        assert!(!names.contains(&"PATH"), "blocked key must be skipped");
    }
}
