import { describe, it, expect } from 'vitest';
import { isQuotaErrorMessage, isApiKeyError, isApiErrorMessage } from '../../src/renderer/utils/model/errorDetection';

describe('isQuotaErrorMessage', () => {
  // Requires BOTH a quota-related keyword AND a limit/exceeded indicator

  it('returns true for "Resource has been exhausted" with quota context', () => {
    expect(isQuotaErrorMessage('quota has been exhausted')).toBe(true);
  });

  it('returns true for resource_exhausted with limit keyword', () => {
    expect(isQuotaErrorMessage('resource_exhausted: limit reached')).toBe(true);
  });

  it('returns true for model_capacity_exhausted with exceed keyword', () => {
    expect(isQuotaErrorMessage('model_capacity_exhausted: capacity exceeded')).toBe(true);
  });

  it('returns true for "no capacity available" with exhaust keyword', () => {
    expect(isQuotaErrorMessage('no capacity available, exhausting retries')).toBe(true);
  });

  it('returns true for quota with 429 status code', () => {
    expect(isQuotaErrorMessage('quota exceeded, status: 429')).toBe(true);
  });

  it('returns true for quota with code 429', () => {
    expect(isQuotaErrorMessage('quota error code 429')).toBe(true);
  });

  it('returns true for quota with ratelimitexceeded', () => {
    expect(isQuotaErrorMessage('quota ratelimitexceeded')).toBe(true);
  });

  it('returns true for case-insensitive match', () => {
    expect(isQuotaErrorMessage('QUOTA has been EXHAUSTED')).toBe(true);
  });

  it('returns false when only quota keyword is present without limit indicator', () => {
    // "quota" alone is not enough - needs a limit/exceeded indicator too
    expect(isQuotaErrorMessage('quota information available')).toBe(false);
  });

  it('returns false when only limit keyword is present without quota keyword', () => {
    expect(isQuotaErrorMessage('rate limit reached')).toBe(false);
  });

  it('returns false for a normal message', () => {
    expect(isQuotaErrorMessage('Hello, how can I help you?')).toBe(false);
  });

  it('returns false for non-string data (number)', () => {
    expect(isQuotaErrorMessage(42)).toBe(false);
  });

  it('returns false for non-string data (object)', () => {
    expect(isQuotaErrorMessage({ error: 'quota exceeded' })).toBe(false);
  });

  it('returns false for non-string data (boolean)', () => {
    expect(isQuotaErrorMessage(true)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isQuotaErrorMessage('')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isQuotaErrorMessage(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isQuotaErrorMessage(undefined)).toBe(false);
  });
});

describe('isApiKeyError', () => {
  it('returns true for "API key not valid"', () => {
    expect(isApiKeyError('API key not valid. Please pass a valid API key.')).toBe(true);
  });

  it('returns true for "API_KEY_INVALID"', () => {
    expect(isApiKeyError('Error: API_KEY_INVALID')).toBe(true);
  });

  it('returns true for "invalid api key"', () => {
    expect(isApiKeyError('The provided invalid api key cannot be used')).toBe(true);
  });

  it('returns true for message containing "google_api_key"', () => {
    expect(isApiKeyError('Please set GOOGLE_API_KEY environment variable')).toBe(true);
  });

  it('returns true for case-insensitive match', () => {
    expect(isApiKeyError('API KEY NOT VALID')).toBe(true);
  });

  it('returns true when data is an object with API key error', () => {
    expect(isApiKeyError({ error: { message: 'API key not valid' } })).toBe(true);
  });

  it('returns false for a normal message', () => {
    expect(isApiKeyError('Hello, how can I help you?')).toBe(false);
  });

  it('returns false for authentication errors that are not API key errors', () => {
    expect(isApiKeyError('authentication failed')).toBe(false);
  });

  it('returns false for non-string/non-object data (number)', () => {
    expect(isApiKeyError(42)).toBe(false);
  });

  it('returns false for non-string/non-object data (boolean)', () => {
    expect(isApiKeyError(true)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isApiKeyError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isApiKeyError(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isApiKeyError('')).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isApiKeyError({})).toBe(false);
  });
});

describe('isApiErrorMessage', () => {
  it('returns true for status 400 error', () => {
    expect(isApiErrorMessage('error status: 400 Bad Request')).toBe(true);
  });

  it('returns true for status 401 error', () => {
    expect(isApiErrorMessage('error code: 401')).toBe(true);
  });

  it('returns true for status 403 error', () => {
    expect(isApiErrorMessage('error status: 403 Forbidden')).toBe(true);
  });

  it('returns true for status 404 error', () => {
    expect(isApiErrorMessage('error status: 404')).toBe(true);
  });

  it('returns true for status 500 error', () => {
    expect(isApiErrorMessage('error status: 500 Internal Server Error')).toBe(true);
  });

  it('returns true for status 502 error', () => {
    expect(isApiErrorMessage('error code: 502')).toBe(true);
  });

  it('returns true for status 503 error', () => {
    expect(isApiErrorMessage('error status: 503')).toBe(true);
  });

  it('returns true for status 504 error', () => {
    expect(isApiErrorMessage('error status: 504 Gateway Timeout')).toBe(true);
  });

  it('returns true for "invalid url" message', () => {
    expect(isApiErrorMessage('invalid url provided')).toBe(true);
  });

  it('returns true for "not found" message', () => {
    expect(isApiErrorMessage('model not found')).toBe(true);
  });

  it('returns true for "notfound" message', () => {
    expect(isApiErrorMessage('notfound error')).toBe(true);
  });

  it('returns true for "unauthorized" message', () => {
    expect(isApiErrorMessage('unauthorized access')).toBe(true);
  });

  it('returns true for "authentication" message', () => {
    expect(isApiErrorMessage('authentication failed')).toBe(true);
  });

  it('returns true for "forbidden" message', () => {
    expect(isApiErrorMessage('forbidden resource')).toBe(true);
  });

  it('returns true for "access denied" message', () => {
    expect(isApiErrorMessage('access denied for this resource')).toBe(true);
  });

  it('returns true for "invalid_argument" message', () => {
    expect(isApiErrorMessage('invalid_argument: bad parameter')).toBe(true);
  });

  it('returns true when data is an object with API error', () => {
    expect(isApiErrorMessage({ error: 'status: 500' })).toBe(true);
  });

  it('returns false for API key errors (excluded by design)', () => {
    expect(isApiErrorMessage('API key not valid')).toBe(false);
  });

  it('returns false for API_KEY_INVALID errors (excluded by design)', () => {
    expect(isApiErrorMessage('API_KEY_INVALID')).toBe(false);
  });

  it('returns false for a normal message', () => {
    expect(isApiErrorMessage('Hello, how can I help you?')).toBe(false);
  });

  it('returns false for non-string/non-object data (number)', () => {
    expect(isApiErrorMessage(42)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isApiErrorMessage(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isApiErrorMessage(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isApiErrorMessage('')).toBe(false);
  });
});
