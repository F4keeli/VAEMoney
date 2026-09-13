const headers = { 'content-type': 'application/json', 'x-vae-app': '1' };

export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.status = status;
    this.field = field || null;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (_) {
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  const text = await res.text();
  let data = {};
  if (text) { try { data = JSON.parse(text); } catch (_) { data = {}; } }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data.field);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  del: (p) => request('DELETE', p)
};

export const qs = (obj) => {
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};
