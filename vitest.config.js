import { defineConfig } from 'vitest/config';

// Configuración propia para que vitest NO herede el root 'web' de vite.config.js
// (ese es para compilar la página; las pruebas viven en pruebas/).
export default defineConfig({
  test: {
    root: '.',
    include: ['pruebas/**/*.test.js'],
    exclude: ['node_modules/**', 'dist/**', 'pruebas/**/*.spec.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
