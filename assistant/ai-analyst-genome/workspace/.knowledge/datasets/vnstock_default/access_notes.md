# Access Notes — vnstock API

## API Limits

### Rate Limits (Per Source)

- **KBS:** 100 requests/minute, 10,000/day
- **VCI:** 50 requests/minute, 5,000/day
- **TCBS:** 50 requests/minute, 5,000/day

### Retry Policy

- **Max Retries:** 3
- **Backoff:** 5s, 10s, 20s (exponential)
- **Cache Fallback:** Yes (if retries exhausted)

## Credential Management

- **Type:** Library-managed (vnstock handles internally)
- **No API keys required** for basic access
- **Premium features:** May require registration (not yet implemented)

## Connection Health

- **Status:** Pending validation (first Wave 0 build)
- **Last Check:** N/A
- **Next Check:** After Wave 0 completion

## Known Issues

- None yet (new installation)

---

**Last Updated:** 2026-02-21
