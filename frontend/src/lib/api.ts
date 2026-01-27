import axios from 'axios';
import { API_BASE } from './env';

const AUTH_STORAGE_KEY = 'tenax.auth';

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: false
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch (storageError) {
        // Ignore storage errors (e.g., non-browser env).
      }
      delete apiClient.defaults.headers.common.Authorization;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tenax:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export const setApiAuthToken = (token?: string | null) => {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
};
