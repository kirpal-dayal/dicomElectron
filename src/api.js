// src/api.js
import axios from 'axios';

/**
 * Base dinámica de la API:
 * - En producción/LAN (cuando el frontend se sirve desde el backend) usa window.location.origin
 * - En desarrollo puedes definir REACT_APP_API_BASE, p.ej. http://192.168.1.50:5000
 */
export const API_BASE = (
  process.env.REACT_APP_API_BASE
    ? process.env.REACT_APP_API_BASE.replace(/\/$/, '') // sin barra al final
    : window.location.origin
);

/** Asegura que el path empieza con "/" y lo concatena a API_BASE */
export const apiUrl = (path = '/') => {
  const p = String(path || '/');
  return `${API_BASE}${p.startsWith('/') ? p : `/${p}`}`;
};

/** Helper para WADO-URI (Cornerstone) */
export const wado = (path = '/') => `wadouri:${apiUrl(path)}`;

/** Instancia de axios ya configurada */
const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  // timeout: 20000, // opcional
});

// Interceptor de errores para logs
// api.interceptors.response.use(
//   (r) => r,
//   (err) => {
//     console.warn('[API]', err?.response?.status, err?.config?.url);
//     return Promise.reject(err);
//   }
// );

export default api;
