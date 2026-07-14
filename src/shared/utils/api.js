const base = import.meta.env.VITE_API_URL ?? ''
export const apiUrl = (path) => `${base}${path}`

let _token = null
export function setToken(t)  { _token = t }
export function clearToken() { _token = null }
export function getToken()   { return _token }

export async function apiFetch(url, opts = {}) {
  const headers = { ...opts.headers }
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  return fetch(url, { ...opts, headers })
}
