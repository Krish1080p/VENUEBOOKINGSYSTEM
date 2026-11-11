import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Proxy /api to the Express backend so the browser never hits CORS problems in development.
export default defineConfig({ plugins: [react()], server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } } });
