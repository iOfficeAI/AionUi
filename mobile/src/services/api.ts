import axios from 'axios';

let baseURL = '';
let authToken: string | null = null;

export const api = axios.create({
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Configure the API base URL and auth token.
 * Called when the user provides connection settings.
 */
export const configureApi = (host: string, port: string, token: string) => {
  baseURL = `http://${host}:${port}`;
  authToken = token;
  api.defaults.baseURL = baseURL;
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
};

export const getBaseURL = () => baseURL;
export const getAuthToken = () => authToken;

export const resetApi = () => {
  baseURL = '';
  authToken = null;
  api.defaults.baseURL = '';
  delete api.defaults.headers.common['Authorization'];
};

/**
 * Refresh the auth token by calling POST /api/auth/refresh.
 * Returns the new token string, or null on failure.
 */
export async function refreshToken(currentToken: string): Promise<string | null> {
  try {
    const response = await api.post('/api/auth/refresh', { token: currentToken });
    const newToken = response.data?.token;
    return typeof newToken === 'string' ? newToken : null;
  } catch {
    return null;
  }
}
