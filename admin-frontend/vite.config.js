import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/panelAdministrador/', //debe coincidir con el path del backend (app.js) y el proxy del frontend (vite.config.js)
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/panel': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
