import { describe, expect, it } from 'vitest';
import { buildNovaHealthContract } from '@process/webserver/healthContract';

describe('buildNovaHealthContract', () => {
  it('reports a reachable 2xx endpoint as live without claiming readiness', () => {
    const health = buildNovaHealthContract({ status: 'online', httpStatus: 200 });

    expect(health.stage).toBe('live');
    expect(health.checks).toEqual({ live: 'pass', ready: 'unknown', functional: 'unknown' });
  });

  it('reports explicit readiness from a health payload', () => {
    const health = buildNovaHealthContract({
      status: 'online',
      httpStatus: 200,
      detail: { healthy: true },
    });

    expect(health.stage).toBe('ready');
    expect(health.checks.ready).toBe('pass');
  });

  it('reports explicit functional proof as functional', () => {
    const health = buildNovaHealthContract({
      status: 'online',
      httpStatus: 200,
      detail: { ready: true, functional: true },
    });

    expect(health.stage).toBe('functional');
    expect(health.checks.functional).toBe('pass');
  });

  it('keeps liveness evidence when an HTTP service is degraded', () => {
    const health = buildNovaHealthContract({
      status: 'degraded',
      httpStatus: 503,
      error: 'dependency unavailable',
    });

    expect(health.stage).toBe('degraded');
    expect(health.checks).toEqual({ live: 'pass', ready: 'fail', functional: 'unknown' });
  });

  it('does not let a payload override a failing HTTP readiness result', () => {
    const health = buildNovaHealthContract({
      status: 'degraded',
      httpStatus: 503,
      detail: { healthy: true },
    });

    expect(health.stage).toBe('degraded');
    expect(health.checks.ready).toBe('fail');
  });

  it('reports an unreachable service as offline', () => {
    const health = buildNovaHealthContract({
      status: 'offline',
      httpStatus: null,
      error: 'connection refused',
    });

    expect(health.stage).toBe('offline');
    expect(health.checks.live).toBe('fail');
  });

  it('does not promote a TCP connection beyond liveness', () => {
    const health = buildNovaHealthContract({ kind: 'tcp', status: 'online', httpStatus: null });

    expect(health.stage).toBe('live');
    expect(health.checks.ready).toBe('unknown');
  });

  it('treats accessible local tooling as ready but not running', () => {
    const health = buildNovaHealthContract({ kind: 'local', status: 'online', httpStatus: null });

    expect(health.stage).toBe('ready');
    expect(health.checks.live).toBe('unknown');
  });
});
