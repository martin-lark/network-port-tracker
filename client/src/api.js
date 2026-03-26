const API = '/api';

async function request(url, options = {}) {
  const res = await fetch(API + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  if (res.status === 204) return null;
  const data = res.headers.get('content-type')?.includes('json')
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const err = typeof data === 'object' ? data : { error: data };
    err.status = res.status;
    throw err;
  }
  return data;
}

export const getHosts = () => request('/hosts');
export const getHost = (id) => request(`/hosts/${id}`);
export const createHost = (data) => request('/hosts', { method: 'POST', body: JSON.stringify(data) });
export const updateHost = (id, data) => request(`/hosts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteHost = (id) => request(`/hosts/${id}`, { method: 'DELETE' });

export const getPorts = (hostId, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/hosts/${hostId}/ports${qs ? '?' + qs : ''}`);
};
export const createPort = (hostId, data) => request(`/hosts/${hostId}/ports`, { method: 'POST', body: JSON.stringify(data) });
export const updatePort = (id, data) => request(`/ports/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deletePort = (id) => request(`/ports/${id}`, { method: 'DELETE' });

export const getNotes = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/notes${qs ? '?' + qs : ''}`);
};
export const createNote = (data) => request('/notes', { method: 'POST', body: JSON.stringify(data) });
export const updateNote = (id, data) => request(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteNote = (id) => request(`/notes/${id}`, { method: 'DELETE' });

export const search = (q) => request(`/search?q=${encodeURIComponent(q)}`);

export const exportData = (format, params = {}) => {
  const qs = new URLSearchParams({ format, ...params }).toString();
  return request(`/export?${qs}`);
};
