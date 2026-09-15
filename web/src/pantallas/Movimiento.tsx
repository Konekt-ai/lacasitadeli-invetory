import React, { useCallback, useMemo, useState } from 'react';
import { api, type Estado, type Kpi, type RespuestaMovimiento } from '../api';
import { Foto, Opciones, numero, usarNavegacion } from '../componentes/basicos';
import { usarDatos } from '../componentes/usarDatos';
import { Encabezado, EstadoCarga, TituloSeccion } from '../componentes/EstadoCarga';
import { Barras, CalendarioCalor, MapaCalor } from '../componentes/graficas';
import { cambioTexto, porDia } from '../componentes/formato';

/**
 * Módulo Movimiento: cómo se mueve el inventario, medido en piezas. Aquí no
 * entra nada de dinero: el servidor ya no lo manda y esta pantalla tampoco lo
 * inventa. Todo sale de GET /api/movimiento (precalculado en memoria).
 */
type Dias = 7 | 30 | 90;
type ColRanking = 'nombre' | 'categoria' | 'piezas' | 'pzasDia' | 'rotacion' | 'diasSinMovimiento';

const COLUMNAS: Array<{ id: ColRanking; texto: string; numerica: boolean }> = [
  { id: 'nombre', texto: 'Producto', numerica: false },
  { id: 'categoria', texto: 'Categoría', numerica: false },
  { id: 'piezas', texto: 'Piezas', numerica: true },
  { id: 'pzasDia', texto: 'Pzas/día', numerica: true },
  { id: 'rotacion', texto: 'Rotación', numerica: true },
  { id: 'diasSinMovimiento', texto: 'Sin movimiento (días)', numerica: true },
];

export function Movimiento({ estado }: { estado: Estado | null }) {
  const [dias, setDias] = useState<Dias>(30);
  const [area, setArea] = useState('');
  const [cocina, setCocina] = useState(false);
  const { ir } = usarNavegacion();

  const traer = useCallback(() => api.movimiento({ dias, area, cocina }), [dias, area, cocina]);
  const { datos, cargando, error, calculando, reintentar } = usarDatos(traer, [dias, area, cocina]);

  const verProducto = (codigo: string) => ir(`/producto/${encodeURIComponent(codigo)}`);
  const periodoTexto = `últimos ${dias} días${area ? ` en ${area}` : ''}`;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Movimiento" subtitulo="Comportamiento del inventario medido en piezas, sin datos de dinero" />

      <div className="space-y-2">
        <Opciones
          valor={dias}
          alElegir={setDias}
          opciones={[{ valor: 7, texto: 'Últimos 7 días' }, { valor: 30, texto: 'Últimos 30 días' }, { valor: 90, texto: 'Últimos 90 días' }]}
        />
        <Opciones
          valor={area}
          alElegir={setArea}
          opciones={[{ valor: '', texto: 'Toda la tienda' }, ...(estado?.areasVenta ?? []).map(a => ({ valor: a, texto: a }))]}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cocina} onChange={e => setCocina(e.target.checked)} className="h-5 w-5 accent-[#012d1d]" />
          Incluir cocina (comida hecha en la casa, sin inventario)
        </label>
      </div>

      <EstadoCarga cargando={cargando} calculando={calculando} error={error} reintentar={reintentar} hayDatos={!!datos}>
        {datos && (
          <div className="space-y-6">
            <section aria-label="Piezas vendidas">
              <div className="grid grid-cols-3 gap-2">
                <TarjetaKpi titulo="7 días" kpi={datos.kpis.d7} activo={dias === 7} />
                <TarjetaKpi titulo="30 días" kpi={datos.kpis.d30} activo={dias === 30} />
                <TarjetaKpi titulo="90 días" kpi={datos.kpis.d90} activo={dias === 90} />
              </div>
              <p className="mt-1 text-xs text-on-surface-variant">Piezas vendidas{area ? ` en ${area}` : ''} y cambio contra el mismo número de días justo antes.</p>
            </section>

            <section>
              <TituloSeccion texto="Más vendidos por piezas" detalle={`Top 10 de los ${periodoTexto}`} />
              {datos.top.length ? (
                <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {datos.top.map((p, i) => {
                    const t = cambioTexto(p.tendencia);
                    return (
                      <li key={p.codigo}>
                        <button type="button" onClick={() => verProducto(p.codigo)} className="tarjeta flex w-full items-center gap-3 p-3 text-left active:bg-surface-container-low">
                          <span className="w-6 shrink-0 text-center font-label text-sm text-on-surface-variant">{i + 1}</span>
                          <Foto url={p.foto} nombre={p.nombre} tamano="h-12 w-12" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium leading-tight">{p.nombre}</span>
                            <span className="block truncate font-label text-xs text-on-surface-variant">{p.codigo} · {p.categoria}</span>
                            <span className="block text-xs text-on-surface-variant">
                              {p.piezasEnTienda === null ? 'sin contar en la tienda' : `quedan ${numero(p.piezasEnTienda)}`}
                              {t.flecha && <span className={`ml-2 font-medium ${t.clase}`}>{t.flecha} {t.texto}</span>}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <strong className="block text-2xl leading-none">{numero(p.piezas)}</strong>
                            <span className="etiqueta">vendidas</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : <p className="py-4 text-center text-sm text-on-surface-variant">No hay ventas en este periodo.</p>}
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="tarjeta p-4">
                <TituloSeccion texto="Categorías con más movimiento" detalle="Piezas vendidas por categoría" />
                <Barras filas={datos.categorias.map(c => ({ nombre: c.nombre, valor: c.piezas, porcentaje: c.porcentaje }))} />
              </section>
              <section className="tarjeta p-4">
                <TituloSeccion texto="Comparativo por sucursal" detalle="Piezas vendidas en cada área de venta" />
                <Barras filas={datos.sucursales.map(s => ({ nombre: s.area, valor: s.piezas, porcentaje: s.porcentaje }))} />
              </section>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ListaCambio titulo="Aceleran ventas" detalle="Los 5 que más subieron contra el periodo anterior (mínimo 10 piezas)" filas={datos.aceleran} alTocar={verProducto} vacio="Nada subió de forma clara en este periodo." />
              <ListaCambio titulo="Bajan ventas" detalle="Los 5 que más bajaron contra el periodo anterior (mínimo 10 piezas)" filas={datos.bajan} alTocar={verProducto} vacio="Nada bajó de forma clara en este periodo." />
            </div>

            <section className="space-y-4">
              <TituloSeccion texto="Mapas de calor" detalle="Piezas por día de la semana. Toca un cuadro para ver el número." />
              {datos.calor.nota && (
                <p className="rounded-xl bg-primary-fixed/60 px-4 py-3 text-sm font-medium text-on-primary-fixed">{datos.calor.nota}</p>
              )}
              <div className="tarjeta p-4">
                <h4 className="etiqueta mb-2">Categoría × día de la semana</h4>
                <MapaCalor filas={datos.calor.categoriaDia} columnas={datos.calor.dias} />
              </div>
              <div className="tarjeta p-4">
                <h4 className="etiqueta mb-2">Sucursal × día de la semana</h4>
                <MapaCalor filas={datos.calor.sucursalDia} columnas={datos.calor.dias} />
              </div>
              <div className="tarjeta p-4">
                <h4 className="etiqueta mb-2">{dias === 90 ? 'Por semana (los 90 días agrupados)' : 'Calendario del periodo'}</h4>
                <CalendarioCalor fechas={datos.calor.fechas} porSemanas={dias === 90} />
              </div>
            </section>

            <Ranking ranking={datos.ranking} alTocar={verProducto} />
          </div>
        )}
      </EstadoCarga>
    </div>
  );
}

function TarjetaKpi({ titulo, kpi, activo }: { titulo: string; kpi: Kpi; activo: boolean }) {
  const c = cambioTexto(kpi.cambio);
  const lectura = kpi.cambio === null ? 'sin dato anterior' : `${kpi.cambio > 0 ? 'subió' : kpi.cambio < 0 ? 'bajó' : 'igual'} ${c.texto} contra el periodo anterior`;
  return (
    <div className={`tarjeta p-3 ${activo ? 'border-primary ring-1 ring-primary' : ''}`} title={lectura}>
      <p className="etiqueta">{titulo}</p>
      <p className="text-2xl font-bold leading-tight md:text-3xl">{numero(kpi.piezas)}</p>
      <p className="text-xs text-on-surface-variant">pzas vendidas</p>
      <p className={`mt-1 text-sm font-medium ${c.clase}`} aria-label={lectura}>
        {c.flecha && <span aria-hidden="true">{c.flecha} </span>}{c.texto}
      </p>
      {kpi.anterior !== null && <p className="text-xs text-on-surface-variant">antes: {numero(kpi.anterior)}</p>}
    </div>
  );
}

function ListaCambio({
  titulo, detalle, filas, alTocar, vacio,
}: {
  titulo: string; detalle: string; filas: RespuestaMovimiento['aceleran']; alTocar: (codigo: string) => void; vacio: string;
}) {
  return (
    <section className="tarjeta p-4">
      <TituloSeccion texto={titulo} detalle={detalle} />
      {filas.length ? (
        <ul className="divide-y divide-outline-variant/40">
          {filas.map(f => {
            const c = cambioTexto(f.cambio);
            return (
              <li key={f.codigo}>
                <button type="button" onClick={() => alTocar(f.codigo)} className="flex w-full items-center gap-3 py-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-tight">{f.nombre}</span>
                    <span className="block font-label text-xs text-on-surface-variant">{f.codigo} · antes {numero(f.anterior)} pzas</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <strong className="block text-lg leading-none">{numero(f.piezas)} <span className="text-xs font-normal text-on-surface-variant">pzas</span></strong>
                    <span className={`text-sm font-medium ${c.clase}`}>{c.flecha} {c.texto}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="py-3 text-center text-sm text-on-surface-variant">{vacio}</p>}
    </section>
  );
}

function Ranking({ ranking, alTocar }: { ranking: RespuestaMovimiento['ranking']; alTocar: (codigo: string) => void }) {
  const [orden, setOrden] = useState<{ col: ColRanking; desc: boolean }>({ col: 'piezas', desc: true });

  const filas = useMemo(() => {
    const lista = [...ranking];
    lista.sort((a, b) => {
      const va = a[orden.col];
      const vb = b[orden.col];
      // Los "sin dato" (null) siempre van al final, se ordene como se ordene.
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = typeof va === 'string' ? va.localeCompare(String(vb), 'es') : Number(va) - Number(vb);
      return orden.desc ? -cmp : cmp;
    });
    return lista;
  }, [ranking, orden]);

  const ordenarPor = (col: ColRanking, numerica: boolean) =>
    setOrden(o => (o.col === col ? { col, desc: !o.desc } : { col, desc: numerica }));

  return (
    <section>
      <TituloSeccion texto="Ranking de rotación" detalle="Rotación = piezas vendidas en 30 días entre las piezas que hay. Toca una columna para ordenar." />
      {filas.length ? (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-surface-container-low">
              <tr>
                {COLUMNAS.map(c => {
                  const activa = orden.col === c.id;
                  return (
                    <th key={c.id} scope="col" aria-sort={activa ? (orden.desc ? 'descending' : 'ascending') : 'none'} className={`px-3 py-2 ${c.numerica ? 'text-right' : 'text-left'}`}>
                      <button type="button" onClick={() => ordenarPor(c.id, c.numerica)} className={`etiqueta inline-flex items-center gap-1 ${activa ? '!text-primary' : ''}`}>
                        {c.texto}
                        {activa && <span aria-hidden="true">{orden.desc ? '↓' : '↑'}</span>}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {filas.map(f => (
                <tr key={f.codigo} onClick={() => alTocar(f.codigo)} className="cursor-pointer active:bg-surface-container-low">
                  <td className="max-w-[16rem] px-3 py-2">
                    <span className="block truncate font-medium">{f.nombre}</span>
                    <span className="block font-label text-xs text-on-surface-variant">{f.codigo}{f.piezasEnTienda !== null && ` · quedan ${numero(f.piezasEnTienda)}`}</span>
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-on-surface-variant">{f.categoria}</td>
                  <td className="px-3 py-2 text-right text-base font-bold">{numero(f.piezas)}</td>
                  <td className="px-3 py-2 text-right">{porDia(f.pzasDia)}</td>
                  <td className="px-3 py-2 text-right">{Number(f.rotacion ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">{f.diasSinMovimiento === null ? '—' : numero(f.diasSinMovimiento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="py-4 text-center text-sm text-on-surface-variant">Sin productos con movimiento en este periodo.</p>}
    </section>
  );
}
