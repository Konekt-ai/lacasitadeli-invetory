import { defineConfig, devices } from '@playwright/test';

// Pruebas de la app como se ve en un celular Y en escritorio. Levanta el servidor
// con el .env local (que apunta a la base de la tienda en SOLO LECTURA).
export default defineConfig({
  testDir: './pruebas',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3010',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'celular',
      testMatch: '**/celular.spec.ts',
      use: {
        ...devices['iPhone 14 Pro'],   // táctil, user agent de celular
        browserName: 'chromium',       // el iPhone usa WebKit; aquí basta Chromium
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      testMatch: '**/desktop.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3010/entrar',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
