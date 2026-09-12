// Pruebas en un celular de verdad (Chromium a 390x844, como un iPhone 14).
// Necesita la app corriendo: playwright.config.ts la levanta sola.
import { expect, test } from '@playwright/test';

const USUARIO = process.env.PRUEBA_USUARIO ?? 'dueno';
const CONTRASENA = process.env.PRUEBA_CONTRASENA ?? 'prueba-local-123';

async function entrar(page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('Usuario').fill(USUARIO);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByRole('heading', { name: 'Inventario La Casita' })).toBeVisible();
  // Espera a que el motor termine de juntar la información.
  await expect(page.getByText('Estamos juntando la información')).toBeHidden({ timeout: 120_000 });
}

test.describe('desde el celular', () => {
  test.beforeEach(async ({ page }) => { await entrar(page); });

  test('la pantalla de inicio muestra descontinuados con sus piezas', async ({ page }) => {
    const tarjeta = page.getByRole('button', { name: /Descontinuados/ });
    await expect(tarjeta).toBeVisible();
    // La tarjeta explica qué es cada grupo, con los umbrales del .env.
    await expect(tarjeta).toContainText(/Sin venderse \d+\+ días o nunca/);
    await expect(tarjeta).toContainText(/piezas/);
    await expect(page.locator('text=/\\d+ productos/').first()).toBeVisible();
    await page.screenshot({ path: 'pruebas/capturas/1-sin-venta.png', fullPage: false });
  });

  test('se puede filtrar por tarjeta y por área', async ({ page }) => {
    await page.getByRole('button', { name: /Posible código duplicado/ }).click();
    await expect(page.getByText(/Se vende como/).first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'pruebas/capturas/2-duplicados.png' });
    await page.getByRole('button', { name: 'Casita 1', exact: true }).first().click();
    await expect(page.getByText(/productos/).first()).toBeVisible();
  });

  test('resurtir muestra urgentes con su acción', async ({ page }) => {
    await page.getByRole('button', { name: 'Resurtir' }).click();
    await expect(page.getByText('Urgente')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Surte \d+ de Bodega|Pedir al proveedor|cuéntalo con la TC52/).first()).toBeVisible();
    await page.screenshot({ path: 'pruebas/capturas/3-resurtir.png' });
  });

  test('la palomita de surtido se queda en el celular', async ({ page }) => {
    await page.getByRole('button', { name: 'Resurtir' }).click();
    const palomita = page.getByRole('button', { name: 'Marcar como surtido' }).first();
    await palomita.click();
    await expect(page.getByRole('button', { name: 'Quitar palomita' }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Quitar palomita' }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('más vendidos y buscar funcionan', async ({ page }) => {
    await page.getByRole('button', { name: 'Más vendidos' }).click();
    await expect(page.getByText('vendidas').first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'pruebas/capturas/4-mas-vendidos.png' });

    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByLabel('Buscar producto').fill('coca');
    await expect(page.getByText(/resultados/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'pruebas/capturas/5-buscar.png' });
  });

  test('la ficha del producto enseña las áreas y separa "sin contar" de cero', async ({ page }) => {
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByLabel('Buscar producto').fill('kinder');
    await page.locator('button', { hasText: /KINDER/i }).first().click();
    await expect(page.getByText('Dónde hay')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/sin contar|piezas/).first()).toBeVisible();
    await page.screenshot({ path: 'pruebas/capturas/6-producto.png', fullPage: true });
  });

  test('NUNCA aparece un signo de pesos ni un precio', async ({ page }) => {
    // Se incluye la ficha del producto: es la ÚNICA pantalla que pinta la
    // categoría y la marca, que vienen de NovaCaja (donde sí hay "CON IVA").
    const rutas = ['/', '/resurtir', '/mas-vendidos', '/buscar', '/producto/098733', '/producto/012000809996'];
    for (const ruta of rutas) {
      await page.goto(ruta);
      await page.waitForTimeout(1500);
      const texto = await page.evaluate(() => document.body.innerText);
      expect(texto, `${ruta} tiene un signo de pesos`).not.toContain('$');
      expect(texto.toLowerCase(), `${ruta} habla de dinero`).not.toMatch(/precio|costo|importe|ganancia|margen/);
    }
  });

  test('nada se sale de la pantalla de 390 px', async ({ page }) => {
    for (const ruta of ['/', '/resurtir', '/mas-vendidos', '/buscar', '/producto/098733']) {
      await page.goto(ruta);
      await page.waitForTimeout(1200);
      const seSale = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(seSale, `${ruta} se sale de ancho`).toBe(false);
    }
  });

  test('el botón de salir cierra la sesión', async ({ page }) => {
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
  });
});

// Este va aparte, con un navegador limpio: no basta con borrar las cookies del
// contexto (Chromium las conserva en su almacén y la sesión revive al navegar).
test('sin sesión no se ve nada y el login pide usuario y contraseña', async ({ browser }) => {
  const limpio = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: 'http://127.0.0.1:3010' });
  const hoja = await limpio.newPage();
  try {
    await hoja.goto('/resurtir');
    await expect(hoja).toHaveURL(/\/entrar$/);
    await expect(hoja.getByLabel('Contraseña')).toBeVisible();
    // Y el API tampoco suelta nada.
    const r = await hoja.request.get('/api/sin-venta');
    expect(r.status()).toBe(401);
  } finally {
    await limpio.close();
  }
});
