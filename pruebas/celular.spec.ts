// Pruebas en un celular de verdad (Chromium a 390x844, como un iPhone 14): los
// cuatro módulos, la ficha, el buscador global, "mi lista (en este teléfono)",
// nada de dinero y nada que se salga de la pantalla.
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

/** El módulo se abre desde la barra de abajo (en celular). */
const irA = (page: Page, modulo: string) => page.locator('nav.fixed').getByRole('button', { name: new RegExp(modulo, 'i') }).click();

test.describe('desde el celular', () => {
  test.beforeEach(async ({ page }) => { await entrar(page); });

  test('Inventario: resumen del día, cobertura, filtros y una tarjeta por fila', async ({ page }) => {
    await expect(page.getByText('Resumen del día')).toBeVisible();
    await expect(page.getByText('Cobertura por sucursal')).toBeVisible();
    await expect(page.getByRole('button', { name: /Descontinuados/ })).toBeVisible();
    await expect(page.locator('.rejilla > *').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\d+ productos/).first()).toBeVisible();
    // Una tarjeta por fila: la segunda empieza más abajo que la primera.
    const tops = await page.locator('.rejilla > *').evaluateAll(els => els.slice(0, 2).map(e => e.getBoundingClientRect().top));
    if (tops.length === 2) expect(tops[1]).toBeGreaterThan(tops[0]);
    await page.screenshot({ path: 'pruebas/capturas/1-inventario.png', fullPage: false });
  });

  test('las tarjetas del resumen filtran la lista (Descontinuados)', async ({ page }) => {
    await page.getByRole('button', { name: /Descontinuados/ }).click();
    await expect(page).toHaveURL(/condiciones=descontinuado/);
    await expect(page.locator('.rejilla > *').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.rejilla').getByText('Descontinuado', { exact: true }).first()).toBeVisible();
  });

  test('Resurtir: tarjetas, lista con acciones reales y mi lista (en este teléfono)', async ({ page }) => {
    await irA(page, 'Resurtir');
    await expect(page.getByRole('heading', { name: 'Resurtir', level: 2 })).toBeVisible();
    await expect(page.getByText('Urgentes').first()).toBeVisible({ timeout: 30_000 });
    const tarjetas = page.locator('section[aria-label="Productos por surtir"] article');
    await expect(tarjetas.first()).toBeVisible({ timeout: 30_000 });
    await expect(tarjetas.first().getByText(/Mover \d+ de Bodega|Sin respaldo en bodega|cuéntalo con la TC52/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Marcar surtido|Confirmar/ })).toHaveCount(0);
    await page.screenshot({ path: 'pruebas/capturas/2-resurtir.png', fullPage: false });

    // Mi lista vive en este teléfono: se agrega, sobrevive a recargar y se palomea.
    await tarjetas.first().getByRole('button', { name: 'Agregar a mi lista' }).click();
    await expect(tarjetas.first().getByRole('button', { name: /En mi lista/ })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Estamos juntando la información')).toBeHidden({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: /En mi lista/ }).first()).toBeVisible({ timeout: 30_000 });
    const lista = page.locator('section[aria-label="Mi lista (en este teléfono)"]');
    await expect(lista.getByText(/1 de 1 palomeados|0 de 1 palomeados/)).toBeVisible();
    await lista.getByRole('button', { name: 'Palomear' }).first().click();
    await expect(lista.getByText('1 de 1 palomeados')).toBeVisible();
    await lista.getByRole('button', { name: 'Quitar', exact: true }).first().click();
    await expect(lista.getByText('Todavía no agregas nada')).toBeVisible();
  });

  test('Movimiento: KPIs con % y mapas de calor', async ({ page }) => {
    await irA(page, 'Movimiento');
    await expect(page.getByRole('heading', { name: 'Movimiento', level: 2 })).toBeVisible();
    await expect(page.getByText('pzas vendidas').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Más vendidos por piezas')).toBeVisible();
    await expect(page.getByText('Mapas de calor')).toBeVisible();
    await expect(page.getByText('Ranking de rotación')).toBeVisible();
    await page.getByRole('button', { name: 'Últimos 7 días' }).click();
    await expect(page.getByRole('button', { name: 'Últimos 7 días' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('pzas vendidas').first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'pruebas/capturas/3-movimiento.png', fullPage: false });
  });

  test('Alertas: filtros con conteo, Ver producto y Descartar con Deshacer', async ({ page }) => {
    await irA(page, 'Alertas');
    await expect(page.getByRole('heading', { name: 'Alertas', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Urgentes/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Códigos/ }).click();
    const tarjeta = page.locator('article').first();
    await expect(tarjeta).toBeVisible({ timeout: 30_000 });
    await expect(tarjeta.getByText(/Se vende como/)).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Descartar' }).click();
    await expect(tarjeta.getByRole('button', { name: 'Deshacer' })).toBeVisible({ timeout: 15_000 });
    await expect(tarjeta.getByText(/Descartada por/)).toBeVisible();
    await tarjeta.getByRole('button', { name: 'Deshacer' }).click();
    await expect(tarjeta.getByRole('button', { name: 'Descartar' })).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: 'pruebas/capturas/4-alertas.png', fullPage: false });
  });

  test('la ficha del descontinuado lo dice en grande y separa "sin contar" de 0', async ({ page }) => {
    await page.goto('/producto/012000809996');
    await expect(page.getByText('No se pide resurtido')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Solicitar resurtido' })).toHaveCount(0);
    await expect(page.getByText('Dónde hay')).toBeVisible();
    await expect(page.getByText(/sin contar|piezas/).first()).toBeVisible();
    await expect(page.getByText('Últimos movimientos')).toBeVisible();
    await page.screenshot({ path: 'pruebas/capturas/5-producto.png', fullPage: true });
  });

  test('el buscador global encuentra cualquier producto, hasta los que solo están en la caja', async ({ page }) => {
    await page.locator('#buscador-abajo').fill('mostaza');
    await page.locator('#buscador-abajo').press('Enter');
    await expect(page).toHaveURL(/\/buscar\?q=mostaza/);
    await expect(page.getByText(/resultado/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/MOSTAZA/i).first()).toBeVisible();
    await page.screenshot({ path: 'pruebas/capturas/6-buscar.png', fullPage: false });
  });

  test('NUNCA aparece un signo de pesos ni un precio', async ({ page }) => {
    for (const ruta of ['/', '/resurtir', '/movimiento', '/alertas', '/buscar?q=coca', '/producto/098733', '/producto/012000809996']) {
      await page.goto(ruta);
      await page.waitForTimeout(2000);
      const html = await page.content();
      expect(html, `${ruta} tiene un signo de pesos`).not.toContain('$');
      const texto = await page.evaluate(() => document.body.innerText);
      expect(texto.toLowerCase(), `${ruta} habla de dinero`).not.toMatch(/precio|costo|importe|ganancia|margen|proveedor/);
    }
  });

  test('nada se sale de la pantalla de 390 px', async ({ page }) => {
    for (const ruta of ['/', '/resurtir', '/movimiento', '/alertas', '/buscar?q=agua', '/producto/098733']) {
      await page.goto(ruta);
      await page.waitForTimeout(2500);
      const seSale = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(seSale, `${ruta} se sale de ancho`).toBe(false);
    }
  });

  test('el botón de salir cierra la sesión', async ({ page }) => {
    await page.getByRole('button', { name: /Salir/ }).click();
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
    // Y el API tampoco suelta nada (ni el proxy de solicitudes).
    expect((await hoja.request.get('/api/inventario')).status()).toBe(401);
    expect((await hoja.request.get('/api/solicitudes')).status()).toBe(401);
  } finally {
    await limpio.close();
  }
});
