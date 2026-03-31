const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

async function request<T = any>(method: string, path: string, body?: any, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) || {}),
    },
    ...options,
  };

  if (body !== undefined && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  return response.json();
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: any) => request<T>('POST', path, body),
  put: <T = any>(path: string, body?: any) => request<T>('PUT', path, body),
  delete: <T = any>(path: string) => request<T>('DELETE', path),

  // Upload file (FormData - don't set Content-Type, let browser set it)
  upload: async <T = any>(path: string, formData: FormData): Promise<T> => {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }
    return response.json();
  },
};
