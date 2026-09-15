// El servidor web: sirve el API y la página ya compilada (dist/).
//
// La app escucha SOLO en 127.0.0.1 y a internet sale por el túnel de Cloudflare,
// que apunta únicamente aquí. Aun así, el login es la única puerta: quien tenga
// la URL llega hasta el formulario y nada más.
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { config } from '../config.js';
import { marcarUso } from '../servicios/inventario.js';
import { crearRutas } from './rutas.js';
import { usuarioDe } from './auth.js';

// Rutas de la página (las maneja React); todo lo demás es 404.
const PANTALLAS = ['/', '/inventario', '/resurtir', '/movimiento', '/alertas', '/buscar', '/producto'];
const ENTRAR = '/entrar';

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', 'strong');
  // Solo confiamos en el proxy local (cloudflared): así req.ip trae la IP del celular.
  app.set('trust proxy', 'loopback');

  // ── Cabeceras de seguridad (van en TODA respuesta) ──────────────────────
  app.use((req, res, siguiente) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "font-src 'self'",
      // Las fotos de los productos son ligas públicas de Shopify.
      "img-src 'self' https://cdn.shopify.com data:",
      "connect-src 'self'",
      "form-action 'self'",
    ].join('; '));
    siguiente();
  });

  // ── API ─────────────────────────────────────────────────────────────────
  // marcarUso() NO va aquí: si contara cualquier toque sin contraseña, un bot
  // tocando /api mantendría a la app refrescando la base toda la noche. Se marca
  // dentro de las rutas, ya con sesión revisada.
  app.use('/api', (req, res, siguiente) => {
    res.setHeader('Cache-Control', 'no-store');
    siguiente();
  }, crearRutas());

  // ── robots.txt: que ningún buscador indexe la URL del túnel ─────────────
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  // ── Archivos de la página ───────────────────────────────────────────────
  const dist = config.rutas.dist;
  const indice = path.join(dist, 'index.html');
  app.use(express.static(dist, {
    index: false,
    etag: true,
    maxAge: '1y',
    setHeaders: (res, ruta) => {
      // Los nombres llevan hash, menos el index: ese nunca se guarda en caché.
      if (ruta.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  const mandarIndice = (res) => {
    if (!fs.existsSync(indice)) {
      res.status(503).type('text/plain').send('Falta compilar la página (npm run build).');
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indice);
  };

  app.get(ENTRAR, (req, res) => {
    // Si ya tiene sesión, que no vea otra vez el formulario.
    if (usuarioDe(req)) { res.redirect('/'); return; }
    mandarIndice(res);
  });

  app.get(PANTALLAS.map(p => (p === '/' ? p : `${p}*`)), (req, res) => {
    if (!usuarioDe(req)) { res.redirect(ENTRAR); return; }
    marcarUso();
    mandarIndice(res);
  });

  // Nada más existe.
  app.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).type('text/plain').send('No');
      return;
    }
    res.status(404).type('text/plain').send('No existe');
  });

  // Último manotazo: que un error no tire el proceso ni cuente de más.
  app.use((err, req, res, _siguiente) => {
    res.status(500).json({ error: 'Algo falló de este lado' });
    // eslint-disable-next-line no-console
    console.error('[web]', err?.message ?? err);
  });

  return app;
}
