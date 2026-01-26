const readFromImportMeta = (key: string): string | undefined => {
  try {
    return (import.meta as unknown as { env?: Record<string, string> })?.env?.[key];
  } catch (error) {
    return undefined;
  }
};

const readFromProcess = (key: string): string | undefined => {
  if (typeof process === 'undefined') {
    return undefined;
  }
  return process.env?.[key];
};

export const getEnv = (key: string): string | undefined => readFromImportMeta(key) ?? readFromProcess(key);

export const API_BASE = getEnv('VITE_API_URL') ?? getEnv('REACT_APP_API_URL') ?? '/api';
export const ADMIN_ENABLED = (
  getEnv('VITE_ENABLE_ADMIN_DASH') ?? getEnv('REACT_APP_ENABLE_ADMIN_DASH') ?? 'false'
).toLowerCase() === 'true';
