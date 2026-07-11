const base = import.meta.env.VITE_API_URL ?? ''
export const apiUrl = (path) => `${base}${path}`
