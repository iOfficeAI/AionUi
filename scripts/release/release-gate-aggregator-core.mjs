export const RELEASE_GATE_AGGREGATOR_VERSION = 'release-gate-aggregator/v0';

export const RELEASE_GATE_AGGREGATOR_STATUS_EXIT_CODES = {
  PASS: 0,
  BLOCKED: 6,
  BLOCKED_CONFIG_ERROR: 7,
};

// The canonical roster of REQUIRED release gates. Each entry names a gate and
// the runner key the caller must supply. Every gate in this list is fail-closed:
// the aggregate cannot PASS unless every required gate returns a PASS result.
//
// notarization-stapled is wired here exactly like egress-keystone: a required,
// fail-closed gate. A non-stapled / spctl-rejected DMG makes its runner report
// a non-PASS status, which blocks the whole release gate.
export const REQUIRED_RELEASE_GATES = [
  {
    id: 'egress-keystone',
    runnerKey: 'egressKeystone',
    description: 'Command EVE egress-boundary Playwright proof passed (no skip, no fail)',
  },
  {
    id: 'notarization-stapled',
    runnerKey: 'notarizationStapled',
    description: 'Release DMG is stapler-valid and accepted by Gatekeeper (spctl)',
  },
];

function asText(value) {
  if (value == null) return '';
  return String(value);
}

// A single gate "passed" only when it returns an object whose status is exactly
// PASS. Anything else — a BLOCKED_* status, a missing status, a thrown runner,
// a non-object — is treated as a fail-closed block.
export function normalizeGateResult(gate, raw) {
  if (raw && raw.__threw) {
    return {
      id: gate.id,
      ok: false,
      status: 'BLOCKED_RUNNER_ERROR',
      detail: `Gate "${gate.id}" runner threw: ${asText(raw.error)}`,
    };
  }
  if (!raw || typeof raw !== 'object') {
    return {
      id: gate.id,
      ok: false,
      status: 'BLOCKED_NO_RESULT',
      detail: `Gate "${gate.id}" produced no result object; failing closed`,
    };
  }
  const status = asText(raw.status);
  const ok = status === 'PASS';
  return {
    id: gate.id,
    ok,
    status: status || 'BLOCKED_NO_STATUS',
    detail: asText(raw.detail) || (ok ? `Gate "${gate.id}" passed` : `Gate "${gate.id}" did not pass`),
    exit_code: raw.exit_code,
  };
}

// Run every REQUIRED gate through caller-supplied runners and aggregate the
// verdict. `runners` maps each gate's runnerKey to a function returning that
// gate's result object (the same shape evaluate*Core functions return). A
// missing runner is a config error (fail closed). A runner that throws is
// caught and treated as a BLOCKED gate so one broken gate cannot let a release
// through. The aggregate PASSes only when every required gate PASSes.
export async function runReleaseGates(runners = {}, gates = REQUIRED_RELEASE_GATES) {
  const missing = gates.filter((gate) => typeof runners[gate.runnerKey] !== 'function');
  if (missing.length > 0) {
    return {
      version: RELEASE_GATE_AGGREGATOR_VERSION,
      status: 'BLOCKED_CONFIG_ERROR',
      exit_code: RELEASE_GATE_AGGREGATOR_STATUS_EXIT_CODES.BLOCKED_CONFIG_ERROR,
      ok: false,
      detail: `No runner wired for required gate(s): ${missing.map((gate) => gate.id).join(', ')}`,
      gates: [],
      blocked_gates: missing.map((gate) => gate.id),
    };
  }

  const results = [];
  for (const gate of gates) {
    let raw;
    try {
      raw = await runners[gate.runnerKey](gate);
    } catch (error) {
      raw = { __threw: true, error: error?.message ?? error };
    }
    results.push(normalizeGateResult(gate, raw));
  }

  const blocked = results.filter((result) => !result.ok);
  if (blocked.length > 0) {
    return {
      version: RELEASE_GATE_AGGREGATOR_VERSION,
      status: 'BLOCKED',
      exit_code: RELEASE_GATE_AGGREGATOR_STATUS_EXIT_CODES.BLOCKED,
      ok: false,
      detail: `Release blocked by ${blocked.length} required gate(s): ${blocked.map((result) => result.id).join(', ')}`,
      gates: results,
      blocked_gates: blocked.map((result) => result.id),
    };
  }

  return {
    version: RELEASE_GATE_AGGREGATOR_VERSION,
    status: 'PASS',
    exit_code: RELEASE_GATE_AGGREGATOR_STATUS_EXIT_CODES.PASS,
    ok: true,
    detail: `All ${results.length} required release gates passed`,
    gates: results,
    blocked_gates: [],
  };
}
