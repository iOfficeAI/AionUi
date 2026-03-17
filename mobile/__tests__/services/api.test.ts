import { api, configureApi, getBaseURL, getAuthToken, resetApi } from '@/src/services/api';

describe('api service', () => {
  afterEach(() => {
    resetApi();
  });

  describe('configureApi', () => {
    it('sets baseURL from host and port', () => {
      configureApi('192.168.1.1', '8080', 'my-token');
      expect(getBaseURL()).toBe('http://192.168.1.1:8080');
      expect(api.defaults.baseURL).toBe('http://192.168.1.1:8080');
    });

    it('sets auth token', () => {
      configureApi('localhost', '3000', 'secret-token');
      expect(getAuthToken()).toBe('secret-token');
      expect(api.defaults.headers.common['Authorization']).toBe('Bearer secret-token');
    });

    it('overwrites previous configuration', () => {
      configureApi('host-a', '1111', 'token-a');
      configureApi('host-b', '2222', 'token-b');
      expect(getBaseURL()).toBe('http://host-b:2222');
      expect(getAuthToken()).toBe('token-b');
    });
  });

  describe('resetApi', () => {
    it('clears baseURL and token', () => {
      configureApi('localhost', '3000', 'token');
      resetApi();
      expect(getBaseURL()).toBe('');
      expect(getAuthToken()).toBeNull();
      expect(api.defaults.baseURL).toBe('');
      expect(api.defaults.headers.common['Authorization']).toBeUndefined();
    });
  });
});
