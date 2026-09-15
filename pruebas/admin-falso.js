// Un API del admin de MENTIRAS para las pruebas del proxy de solicitudes: imita
// lo que contesta lacasitadeli-admin en /api/resurtido/* (contrato v2, sección
// 4.5) y anota lo que recibe, para comprobar que esta app manda usuario y origen.
// Trae a propósito una llave de dinero ("precio") y fechas con "Z" como las
// entrega el driver mssql, para probar que el proxy limpia y normaliza.
import http from 'node:http';

export const SOLICITUD_PENDIENTE = {
  id: 7, codigo_barras: '333333333333', codigo_pedido: '333333333333', nombre: 'CHOCOLATE QUE VUELA', nombre_mostrar: 'CHOCOLATE QUE VUELA',
  de_ubicacion: 'Bodega', a_ubicacion: 'Casita 1', cantidad: 20, cantidad_hecha: null, estado: 'pendiente', prioridad: 0,
  origen: 'panel', nota: null, solicitado_por: 'panel', hecha_por: null, movimiento_id: null,
  stock_origen: 40, stock_destino: 3, creado: '2026-09-11T09:00:00.000Z', actualizado: '2026-09-11T09:00:00.000Z',
  hecha_en: null, cancelada_en: null, motivo_cancelacion: null,
  precio: 12.5, // NUNCA debe llegar al celular
};

export async function iniciarAdminFalso() {
  const recibido = [];
  let siguienteId = 100;
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const mandar = (status, cuerpo) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(cuerpo)); };
    let datos = '';
    req.on('data', c => { datos += c; });
    req.on('end', () => {
      recibido.push({ metodo: req.method, ruta: req.url, cuerpo: datos ? JSON.parse(datos) : null });
      if (req.method === 'GET' && url.pathname === '/api/resurtido/ubicaciones') {
        return mandar(200, { todas: ['Bodega', 'Casita 1', 'Casita 2', 'Cocina'], venta: ['Casita 1', 'Casita 2'], respaldo: ['Bodega', 'Cocina'] });
      }
      if (req.method === 'GET' && url.pathname === '/api/resurtido/pendientes') return mandar(200, [SOLICITUD_PENDIENTE]);
      if (req.method === 'GET' && url.pathname === '/api/resurtido') {
        const estado = url.searchParams.get('estado') || 'todas';
        const codigo = url.searchParams.get('codigo');
        let lista = [SOLICITUD_PENDIENTE];
        if (estado !== 'todas' && estado !== 'pendiente') lista = [];
        if (codigo && codigo !== SOLICITUD_PENDIENTE.codigo_barras) lista = [];
        return mandar(200, { solicitudes: lista, conteo: { pendiente: 1, hecha: 2, cancelada: 0 } });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/resurtido/sugerencia/')) {
        return mandar(200, {
          stock_origen: 40, stock_destino: 3, apartado_destino: 0, disponible_destino: 3, venta_diaria: 5,
          cobertura_dias: 0.6, sugerido: 32, sugerido_sin_tope: 32, ultima_venta: '2026-09-11T08:00:00.000Z',
          codigo_pedido: decodeURIComponent(url.pathname.split('/').pop()), unidades_por_caja: 1,
        });
      }
      if (req.method === 'GET' && /^\/api\/resurtido\/\d+$/.test(url.pathname)) {
        const id = Number(url.pathname.split('/').pop());
        if (id !== 7) return mandar(404, { error: 'No existe' });
        return mandar(200, { ...SOLICITUD_PENDIENTE, eventos: [{ id: 1, fecha: '2026-09-11T09:00:00.000Z', tipo: 'creada', de: null, a: 'pendiente', usuario: 'panel', detalle: null }] });
      }
      if (req.method === 'POST' && url.pathname === '/api/resurtido') {
        const b = JSON.parse(datos || '{}');
        if (b.codigo_barras === SOLICITUD_PENDIENTE.codigo_barras && b.a_ubicacion === 'Casita 1') {
          return mandar(409, { error: 'Ya hay una solicitud pendiente de 20 pzas para Casita 1 (#7)', existente: SOLICITUD_PENDIENTE });
        }
        const id = siguienteId++;
        const solicitud = { ...SOLICITUD_PENDIENTE, id, codigo_barras: b.codigo_barras, a_ubicacion: b.a_ubicacion, de_ubicacion: b.de_ubicacion, cantidad: b.cantidad, nota: b.nota ?? null, origen: b.origen, solicitado_por: b.usuario };
        return mandar(200, { ok: true, id, solicitud, aviso: b.cantidad > 40 ? `En ${b.de_ubicacion} solo hay 40 pza(s); se pidieron ${b.cantidad}.` : null });
      }
      // Todo lo demás del admin existe allá (¡con dinero!) pero NUNCA debe llegar por el proxy.
      if (url.pathname.startsWith('/api/products')) return mandar(200, { data: [{ precio: 99, costo: 50 }] });
      return mandar(404, { error: 'No existe' });
    });
  });
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const { port } = servidor.address();
  return {
    url: `http://127.0.0.1:${port}`,
    recibido,
    ultimo: () => recibido[recibido.length - 1],
    cerrar: () => new Promise(r => servidor.close(r)),
  };
}
