import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La página se compila a dist/ y ESE dist/ va commiteado: en la computadora de la
// tienda solo se hace `npm ci --omit=dev` y a correr. Nada de compilar en la caja.
export default defineConfig({
  root: 'web',
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // El celular entra por un túnel: conviene poco archivo y bien chico.
    chunkSizeWarningLimit: 700,
    assetsInlineLimit: 2048,
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3010' },
  },
});
