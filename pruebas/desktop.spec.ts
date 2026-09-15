// Pruebas en escritorio (Chromium a 1280x800): los cuatro módulos cargan, la
// navegación va arriba, hay 3 tarjetas por fila y nunca aparece dinero.
// Necesita la app corriendo contra la base real: playwright.config.ts la levanta.
import { expect, test, type Page } from '@playwright/test';

const USUARIO = process.env.PRUEBA_USUARIO ?? 'dueno';
const CONTRASENA = process.env.PRUEBA_CONTRASENA ?? 'prueba-local-123';

async function entrar(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByLabel('Usuario').fill(USUARIO);
  await page.getByLabel('Contraseña').fill(CONTRASENA);
  await page.getByRole('button', { name: /entrar/i }).click();
  // Ya adentro: el botón Salir solo existe con sesión, y la app regresa al inicio.
  await expect(page.getByRole('button', { name: /Salir/ })).toBeVisible({ timeout: 30_000 });
  await page.waitForURL(/\/$/);
  // Espera a que el motor termine de juntar la información.
  await expect(page.getByText('Estamos juntando la información')).toBeHidden({ timeout: 120_000 });
}

/** Las N primeras tarjetas de una rejilla comparten el mismo "top" = misma fila. */
async function tarjetasPorFila(page: Page, selector: string) {
  const tops = await page.locator(selector).evaluateAll(els => els.slice(0, 6).map(e => Math.round(e.getBoundingClientRect().top)));
  if (!tops.length) return 0;
  return tops.filter(t => t === tops[0]).length;
}

test.describe('en escritorio', () => {
  test.beforeEach(async ({ page }) => { await entrar(page); });

  test('la navegación de los 4 módulos va arriba y el inventario muestra 3 tarjetas por fila', async ({ page }) => {
    const navArriba = page.locator('header nav[aria-label="Módulos"]');
    await expect(navArriba).toBeVisible();
    for (const m of ['Inventario', 'Resurtir', 'Movimiento', 'Alertas']) {
      await expect(navArriba.getByRole('button', { name: new RegExp(m) })).toBeVisible();
    }
    // La de abajo (celular) no se ve en escritorio.
    await expect(page.locator('nav.fixed[aria-label="Módulos"]')).toBeHidden();

    await expect(page.getByText('Resumen del día')).toBeVisible();
    await expect(page.locator('.rejilla > *').first()).toBeVisible({ timeout: 30_000 });
    expect(await tarjetasPorFila(page, '.rejilla > *')).toBe(3);
    await page.screenshot({ path: 'pruebas/capturas/d1-inventario.png', fullPage: false });
  });

  test('resurtir: 3 tarjetas por fila, botones reales y mi lista', async ({ page }) => {
    await page.locator('header nav').getByRole('button', { name: /Resurtir/ }).click();
    await expect(page.getByRole('heading', { name: 'Resurtir', level: 2 })).toBeVisible();
    await expect(page.getByText('Qué mover, desde dónde, hacia dónde y cuántas piezas')).toBeVisible();
    const tarjetas = page.locator('section[aria-label="Productos por surtir"] article');
    await expect(tarjetas.first()).toBeVisible({ timeout: 30_000 });
    expect(await tarjetasPorFila(page, 'section[aria-label="Productos por surtir"] article')).toBe(3);
    await expect(page.getByRole('button', { name: 'Agregar a mi lista' }).first()).toBeVisible();
    await expect(page.getByText('Mi lista (en este teléfono)').first()).toBeVisible();
    await expect(page.getByText('Historial de resurtido')).toBeVisible();
    // Nada de botones falsos.
    await expect(page.getByRole('button', { name: /Marcar surtido|Confirmar revisión/ })).toHaveCount(0);
    await page.screenshot({ path: 'pruebas/capturas/d2-resurtir.png', fullPage: false });
  });

  test('movimiento: KPIs, mapas de calor y ranking', async ({ page }) => {
    await page.locator('header nav').getByRole('button', { name: /Movimiento/ }).click();
    await expect(page.getByRole('heading', { name: 'Movimiento', level: 2 })).toBeVisible();
    await expect(page.getByText('pzas vendidas').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Más vendidos por piezas')).toBeVisible();
    await expect(page.getByText('Categorías con más movimiento')).toBeVisible();
    await expect(page.getByText('Comparativo por sucursal')).toBeVisible();
    await expect(page.getByText('Mapas de calor')).toBeVisible();
    await expect(page.getByText('Categoría × día de la semana')).toBeVisible();
    await expect(page.getByText('Ranking de rotación')).toBeVisible();
    await page.screenshot({ path: 'pruebas/capturas/d3-movimiento.png', fullPage: true });
  });

  test('alertas: filtros con conteos y solo acciones reales', async ({ page }) => {
    await page.locator('header nav').getByRole('button', { name: /Alertas/ }).click();
    await expect(page.getByRole('heading', { name: 'Alertas', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Urgentes/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Ver producto' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descartar' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /catalogación|revisado/i })).toHaveCount(0);
    expect(await tarjetasPorFila(page, 'article')).toBe(3);
    await page.screenshot({ path: 'pruebas/capturas/d4-alertas.png', fullPage: false });
  });

  test('la ficha de un descontinuado lo dice en grande y no ofrece resurtir', async ({ page }) => {
    await page.goto('/producto/012000809996');
    await expect(page.getByText('No se pide resurtido')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Solicitar resurtido' })).toHaveCount(0);
    await expect(page.getByText('Últimos movimientos')).toBeVisible();
    await page.screenshot({ path: 'pruebas/capturas/d5-producto.png', fullPage: true });
  });

  test('NUNCA aparece un signo de pesos ni un precio', async ({ page }) => {
    for (const ruta of ['/', '/resurtir', '/movimiento', '/alertas', '/buscar?q=coca', '/producto/098733']) {
      await page.goto(ruta);
      await page.waitForTimeout(2000);
      const html = await page.content();
      expect(html, `${ruta} tiene un signo de pesos`).not.toContain('$');
      const texto = await page.evaluate(() => document.body.innerText);
      expect(texto.toLowerCase(), `${ruta} habla de dinero`).not.toMatch(/precio|costo|importe|ganancia|margen|proveedor/);
    }
  });
});
