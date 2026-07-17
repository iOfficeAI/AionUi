export type NovaHealthStage = 'unknown' | 'offline' | 'live' | 'ready' | 'functional' | 'degraded';

export type NovaHealthCheckResult = 'pass' | 'fail' | 'unknown';

export type NovaHealthContract = {
  stage: NovaHealthStage;
  checks: {
    live: NovaHealthCheckResult;
    ready: NovaHealthCheckResult;
    functional: NovaHealthCheckResult;
  };
  verifiedAt: string;
  evidence: string[];
};

type NovaHealthObservation = {
  kind?: 'http' | 'tcp' | 'local';
  status: 'online' | 'degraded' | 'offline';
  httpStatus: number | null;
  detail?: Record<string, unknown>;
  error?: string;
  verifiedAt?: string;
};

const PASS_VALUES = new Set(['ok', 'online', 'ready', 'healthy', 'pass', 'passed', 'available']);
const FAIL_VALUES = new Set(['error', 'failed', 'fail', 'offline', 'down', 'unhealthy', 'unavailable']);

function readHealthSignal(detail: Record<string, unknown> | undefined, keys: string[]): NovaHealthCheckResult {
  if (!detail) {
    return 'unknown';
  }

  for (const key of keys) {
    const value = detail[key];
    if (typeof value === 'boolean') {
      return value ? 'pass' : 'fail';
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (PASS_VALUES.has(normalized)) {
        return 'pass';
      }
      if (FAIL_VALUES.has(normalized)) {
        return 'fail';
      }
    }
  }

  return 'unknown';
}

function getStage(
  status: NovaHealthObservation['status'],
  live: NovaHealthCheckResult,
  ready: NovaHealthCheckResult,
  functional: NovaHealthCheckResult
): NovaHealthStage {
  if (status === 'offline' || live === 'fail') {
    return 'offline';
  }
  if (status === 'degraded' || ready === 'fail' || functional === 'fail') {
    return 'degraded';
  }
  if (functional === 'pass') {
    return 'functional';
  }
  if (ready === 'pass') {
    return 'ready';
  }
  if (live === 'pass') {
    return 'live';
  }
  return 'unknown';
}

/**
 * Convert a low-level service probe into an evidence-based health contract.
 * A reachable endpoint proves liveness only; readiness and functionality need
 * explicit signals from the service payload or a separate functional probe.
 */
export function buildNovaHealthContract(observation: NovaHealthObservation): NovaHealthContract {
  const kind = observation.kind ?? 'http';
  const evidence: string[] = [];
  let live: NovaHealthCheckResult = 'unknown';
  let ready: NovaHealthCheckResult = 'unknown';

  if (kind === 'local') {
    ready = observation.status === 'online' ? 'pass' : 'fail';
    evidence.push(ready === 'pass' ? 'local-assets-accessible' : 'local-assets-unavailable');
  } else if (kind === 'tcp') {
    live = observation.status === 'online' ? 'pass' : 'fail';
    evidence.push(live === 'pass' ? 'tcp-connect-ok' : 'tcp-connect-failed');
  } else if (observation.httpStatus !== null) {
    live = 'pass';
    evidence.push(`http:${observation.httpStatus}`);
    if (observation.httpStatus < 200 || observation.httpStatus >= 300) {
      ready = 'fail';
    }
  } else if (observation.status === 'offline') {
    live = 'fail';
    evidence.push('http-unreachable');
  }

  const explicitReady = readHealthSignal(observation.detail, ['ready', 'healthy', 'ok', 'status']);
  if (explicitReady !== 'unknown' && ready !== 'fail') {
    ready = explicitReady;
    evidence.push(`ready:${explicitReady}`);
  }

  const functional = readHealthSignal(observation.detail, ['functional']);
  if (functional !== 'unknown') {
    evidence.push(`functional:${functional}`);
  }

  if (observation.error) {
    evidence.push('probe-error');
  }

  return {
    stage: getStage(observation.status, live, ready, functional),
    checks: { live, ready, functional },
    verifiedAt: observation.verifiedAt ?? new Date().toISOString(),
    evidence,
  };
}
