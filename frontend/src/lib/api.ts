import axios from 'axios';
import { API_BASE } from './env';

export const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: false
});

export const setApiAuthToken = (token?: string | null) => {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
};
