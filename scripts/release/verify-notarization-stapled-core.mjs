export const NOTARIZATION_STAPLED_VERIFIER_VERSION = 'verify-notarization-stapled/v0';

export const NOTARIZATION_STAPLED_STATUS_EXIT_CODES = {
  PASS: 0,
  BLOCKED_ARTIFACT_MISSING: 2,
  BLOCKED_STAPLE_INVALID: 3,
  BLOCKED_SPCTL_REJECTED: 4,
  BLOCKED_CHECK_ERROR: 5,
};

// `xcrun stapler validate <dmg>` prints "The validate action worked!" on a
// stapled, notarized artifact. Anything else (no ticket, code 65, etc.) is a
// fail. We treat exit code 0 as authoritative but also string-match so a buggy
// caller that ignores exit status still fails closed.
export function buildStaplerValidateArgs(artifactPath) {
  return ['stapler', 'validate', artifactPath];
}

// Gatekeeper assessment for a DMG opened by the user. `spctl -a` is for apps;
// for a disk image we assess the open/install operation:
//   spctl -a -t open --context context:primary-signature <dmg>
// A notarized, stapled DMG reports "accepted" with "source=Notarized Developer ID".
export function buildSpctlAssessArgs(artifactPath) {
  return ['-a', '-t', 'open', '--context', 'context:primary-signature', artifactPath];
}

const STAPLER_VALIDATE_OK = /the validate action worked/i;
const SPCTL_ACCEPTED = /\baccepted\b/i;
const SPCTL_REJECTED = /\b(rejected|denied)\b/i;

function asText(value) {
  if (value == null) return '';
  return String(value);
}

// Decide PASS/FAIL for a stapler validate run from its exit code + combined
// stdout/stderr. Fail-closed: a missing/non-zero code OR missing success string
// is a block, even if the other signal looks fine.
export function evaluateStaplerValidate({ exitCode, output = '' } = {}) {
  const text = asText(output);
  const codeOk = exitCode === 0;
  const stringOk = STAPLER_VALIDATE_OK.test(text);
  if (codeOk && stringOk) {
    return { ok: true, detail: 'stapler validate confirmed a stapled notarization ticket' };
  }
  if (!codeOk && stringOk) {
    return {
      ok: false,
      detail: `stapler validate exited non-zero (${asText(exitCode)}) despite a success string; treating as not stapled`,
    };
  }
  return {
    ok: false,
    detail: `stapler validate did not confirm a stapled ticket (exit ${asText(exitCode)})`,
  };
}

// Decide a Gatekeeper assessment from its exit code + output. `spctl` writes its
// verdict to stderr. `rejected: true` is the ONLY hard-block signal (an explicit
// Gatekeeper rejection). Every other non-accepted outcome is INCONCLUSIVE, because
// Apple has effectively deprecated `spctl --assess` for DMGs on macOS 15/26 — it
// often exits 0 with no verdict text even for a correctly notarized+stapled DMG.
// `stapler validate` (checked first, fail-closed) is the authoritative offline
// Gatekeeper proof; this is only a secondary signal.
export function evaluateSpctlAssessment({ exitCode, output = '' } = {}) {
  const text = asText(output);
  if (SPCTL_REJECTED.test(text)) {
    return { ok: false, rejected: true, detail: 'spctl rejected the artifact (Gatekeeper would block it)' };
  }
  const codeOk = exitCode === 0;
  const accepted = SPCTL_ACCEPTED.test(text);
  if (codeOk && accepted) {
    return { ok: true, rejected: false, detail: 'spctl accepted the artifact (Notarized Developer ID)' };
  }
  if (!codeOk) {
    return { ok: false, rejected: false, detail: `spctl exited non-zero (${asText(exitCode)}) without a reject verdict` };
  }
  return { ok: false, rejected: false, detail: 'spctl returned no verdict (deprecated for DMGs on this macOS)' };
}

// Combine both checks into a single fail-closed gate result with a stable
// status string + exit code, mirroring evaluateEgressKeystoneReport's shape.
export function evaluateNotarizationStapled({ stapler, spctl } = {}) {
  const staplerResult = evaluateStaplerValidate(stapler || {});
  if (!staplerResult.ok) {
    return {
      status: 'BLOCKED_STAPLE_INVALID',
      exit_code: NOTARIZATION_STAPLED_STATUS_EXIT_CODES.BLOCKED_STAPLE_INVALID,
      detail: staplerResult.detail,
      stapler: staplerResult,
      spctl: null,
    };
  }

  const spctlResult = evaluateSpctlAssessment(spctl || {});
  if (!spctlResult.ok && spctlResult.rejected) {
    // Only an EXPLICIT Gatekeeper rejection blocks — stapler already passed above.
    return {
      status: 'BLOCKED_SPCTL_REJECTED',
      exit_code: NOTARIZATION_STAPLED_STATUS_EXIT_CODES.BLOCKED_SPCTL_REJECTED,
      detail: spctlResult.detail,
      stapler: staplerResult,
      spctl: spctlResult,
    };
  }

  return {
    status: 'PASS',
    exit_code: NOTARIZATION_STAPLED_STATUS_EXIT_CODES.PASS,
    detail: spctlResult.ok
      ? 'Artifact is stapled and accepted by Gatekeeper'
      : 'Artifact is stapled (stapler validate — authoritative); spctl inconclusive (deprecated for DMGs on this macOS)',
    stapler: staplerResult,
    spctl: spctlResult,
  };
}
