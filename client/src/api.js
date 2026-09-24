// One axios instance for every call to the backend.
// It adds the login token to each request and turns error responses into readable messages.
import axios from 'axios';

const TOKEN_KEY = 'ks_token';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 20000,
});

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be blocked (e.g. private browsing); the user just stays logged in for this tab
  }
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Session expired or invalid: tell the app to log out (AuthContext listens for this)
    if (error.response?.status === 401 && getToken()) {
      window.dispatchEvent(new Event('ks:logout'));
    }
    return Promise.reject(error);
  }
);

/** Best human-readable message from an API error. */
export function errorMessage(error, fallback = 'Something went wrong') {
  return (
    error?.response?.data?.error ||
    (error?.code === 'ECONNABORTED' ? 'The server took too long to respond' : null) ||
    error?.message ||
    fallback
  );
}

/** Field-level errors from the API: { fieldName: message } */
export function fieldErrors(error) {
  const details = error?.response?.data?.details;
  if (!Array.isArray(details)) return {};
  return Object.fromEntries(details.map((d) => [d.field, d.message]));
}
