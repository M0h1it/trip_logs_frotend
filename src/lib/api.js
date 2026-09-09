const API_BASE = import.meta.env.VITE_API_URL;

if (!API_BASE) {
  console.warn('VITE_API_URL is not set. Add it to your .env file.');
}

const TOKEN_KEY = 'ct_auth_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      /* ignore parse failure, use default message */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  async login(email, password) {
    const data = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data.user;
  },

  logout() {
    clearToken();
  },

  async listEntries() {
    return request('/api/entries');
  },

  // formData: a FormData instance built by the caller (see sync.js), since
  // this request carries files (photos) alongside text fields.
  async upsertEntry(formData) {
    return request('/api/entries', {
      method: 'POST',
      body: formData, // browser sets multipart Content-Type + boundary automatically
    });
  },

  async deleteEntry(localId) {
    return request(`/api/entries/${localId}`, { method: 'DELETE' });
  },

  photoUrl(relativePath) {
    if (!relativePath) return null;
    return `${API_BASE}/uploads/${relativePath}`;
  },
};
