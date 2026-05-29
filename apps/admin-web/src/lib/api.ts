import axios from 'axios';

// URLs relativas — el browser llama al mismo origen del panel admin
// (localhost:3011 en local, o el túnel ngrok desde afuera).
// Next.js reescribe /api/* → http://app:3010/api/* internamente en Docker.
export const api = axios.create({
  baseURL: '',
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      document.cookie = 'admin_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
