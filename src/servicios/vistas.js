// Las vistas: filtran y ordenan lo que ya está en memoria. Nada de SQL aquí.
//
// Todo lo que sale de estas funciones va tal cual al celular, así que:
//   · ni una llave ni un texto de dinero (no hay precio, costo, importe, margen,
//     cajero, cliente ni proveedor como dato);
//   · fechas en ISO con -06:00 y además ya digeridas ("hace 143 días").
import { ETIQUETAS } from '../calculos/clasificacion.js';
import { fechaCorta, haceCuanto, horaCorta, naiveAIso } from '../calculos/fechas.js';
import { normalizar } from '../calculos/texto.js';
import { ordenarResurtido } from '../calculos/resurtido.js';

const POR_PAGINA = 30;

/** Producto listo para el celular. */
export function productoJson(p, { detalle = false } = {}) {
  const salida = {
    codigo: p.codigo,
    nombre: p.nombre,
    categoria: p.categoria || null,
    marca: p.marca || null,
    foto: p.foto || null,
    alta: !!p.alta,
    esCocina: !!p.esCocina,
    piezas: p.piezas,
    apartadas: p.apartado || 0,
    areas: p.areas.map(a => ({
      area: a.area,
      piezas: a.cantidad,
      apartadas: a.apartado || 0,
      ultimaEntrada: a.ultimaEntrada,
      // Se usa la fecha CRUDA (entradaDate), no el ISO ya armado: volver a parsear
      // el texto con -06:00 y leerle las partes UTC corría un día las entradas de
      // después de las 18:00.
      entradaTexto: a.entradaDate ? fechaCorta(a.entradaDate) : null,
    })),
    clase: p.clase,
    etiqueta: ETIQUETAS[p.clase] ?? p.clase,
    ultimaVenta: p.ultimaVenta ? naiveAIso(p.ultimaVenta) : null,
    diasSinVenta: p.diasSinVenta,
    ventaTexto: p.ultimaVenta ? `Última venta: ${haceCuanto(p.ultimaVenta)}` : 'Nunca se ha vendido',
    ultimaEntrada: p.ultimaEntrada ? naiveAIso(p.ultimaEntrada) : null,
    entradaTexto: p.ultimaEntrada ? `Última entrada: ${fechaCorta(p.ultimaEntrada)}` : null,
    vendidas: { d7: redondear(p.vendidas.d7), d30: redondear(p.vendidas.d30), d120: redondear(p.vendidas.d120) },
    duplicado: p.duplicado
      ? {
        codigo: p.duplicado.codigo,
        nombre: p.duplicado.nombre,
        piezas: redondear(p.duplicado.piezasVendidas),
        texto: `Se vende como ${p.duplicado.codigo} ${p.duplicado.nombre}`,
      }
      : null,
  };
  if (detalle) {
    salida.diasDesdeEntrada = p.diasDesdeEntrada;
    salida.primeraVez = p.primeraVez ? naiveAIso(p.primeraVez) : null;
    salida.vendidas.d14 = redondear(p.vendidas.d14);
    salida.ventaHeredadaDe = p.ventaHeredadaDe ?? null;
  }
  return salida;
}

const redondear = v => Math.round((Number(v) || 0) * 100) / 100;

/** Encabezado: cuándo se actualizó y qué áreas hay. */
export function vistaEstado(snap, motor, usuario) {
  return {
    listo: !!snap,
    calculando: !!motor?.calculando,
    usuario: usuario ?? null,
    generado: snap?.generado ?? null,
    actualizado: snap ? horaCorta(snap.ahora) : null,
    areas: (snap?.areas ?? []).map(a => ({ nombre: a.nombre, color: a.color })),
    areasVenta: snap?.areasVenta ?? [],
    areasRespaldo: snap?.areasRespaldo ?? [],
    resumen: snap
      ? {
        conPiezas: snap.resumen.conPiezas,
        piezas: snap.resumen.piezasTotales,
        piezasParadas: snap.resumen.piezasParadas,
      }
      : null,
  };
}

/** Tarjetas de arriba en "Sin venta". */
export function tarjetasSinVenta(snap, opciones = {}) {
  const { descontinuadoDias = 90, lentoDias = 30, nuevoDias = 30 } = opciones;
  const r = snap.resumen.porClase;
  return [
    { clase: 'descontinuado', titulo: 'Descontinuados', detalle: `Sin venderse ${descontinuadoDias}+ días o nunca`, ...contar(r.descontinuado) },
    { clase: 'lento', titulo: 'Lentos', detalle: `Su última venta fue hace ${lentoDias} a ${descontinuadoDias} días`, ...contar(r.lento) },
    { clase: 'duplicado_probable', titulo: 'Posible código duplicado', detalle: 'Se venden con otro código', ...contar(r.duplicado_probable) },
    { clase: 'sin_alta', titulo: 'Sin alta en caja', detalle: 'No se pueden cobrar con su código', ...contar(r.sin_alta) },
    { clase: 'nuevo', titulo: 'Nuevos, aún sin venta', detalle: `Llegaron hace menos de ${nuevoDias} días`, oculto: true, ...contar(r.nuevo) },
  ];
}

const contar = c => ({ productos: c?.productos ?? 0, piezas: c?.piezas ?? 0 });

/**
 * Lista de "Sin venta".
 * @param {object} snap
 * @param {{clase?: string, area?: string, dias?: number|string, buscar?: string,
 *          orden?: 'piezas'|'dias', pagina?: number, porPagina?: number}} filtros
 */
export function vistaSinVenta(snap, filtros = {}, opciones = {}) {
  const {
    clase = 'descontinuado', area = '', dias = 0, buscar = '',
    orden = 'piezas', pagina = 1, porPagina = POR_PAGINA,
  } = filtros;
  const minDias = Number(dias) || 0;
  const texto = normalizar(buscar);

  let lista = snap.productos.filter(p => p.piezas > 0);
  if (clase && clase !== 'todos') lista = lista.filter(p => p.clase === clase);
  else lista = lista.filter(p => p.clase !== 'activo');
  if (area) lista = lista.filter(p => p.areas.some(a => a.area === area && a.cantidad > 0));
  if (minDias) lista = lista.filter(p => p.diasSinVenta === null || p.diasSinVenta >= minDias);
  if (texto) lista = lista.filter(p => p.nombreNormalizado.includes(texto) || p.codigo.includes(buscar.trim()));

  const piezasEnArea = p => (area ? (p.areas.find(a => a.area === area)?.cantidad ?? 0) : p.piezas);
  // El desempate por código NO es un lujo: hay miles de productos con 1 o 2 piezas
  // y sin ventas, o sea empatados en los dos criterios. Sin un tercer criterio fijo
  // el orden acaba siendo el que devolvió SQL (que con NOLOCK cambia entre
  // refrescos) y, como la lista se pagina, al pedir la página 2 después de un
  // refresco se repetían productos y otros no salían nunca.
  lista = [...lista].sort((a, b) => {
    if (orden === 'dias') {
      const da = a.diasSinVenta === null ? Number.MAX_SAFE_INTEGER : a.diasSinVenta;
      const db = b.diasSinVenta === null ? Number.MAX_SAFE_INTEGER : b.diasSinVenta;
      return db - da || piezasEnArea(b) - piezasEnArea(a) || a.codigo.localeCompare(b.codigo);
    }
    return piezasEnArea(b) - piezasEnArea(a)
      || (b.diasSinVenta ?? 1e9) - (a.diasSinVenta ?? 1e9)
      || a.codigo.localeCompare(b.codigo);
  });

  const cuantos = lista.length;
  const desde = Math.max(0, (Number(pagina) || 1) - 1) * porPagina;
  return {
    tarjetas: tarjetasSinVenta(snap, opciones),
    filtros: { clase, area, dias: minDias, buscar, orden },
    cuantos,
    piezas: lista.reduce((s, p) => s + piezasEnArea(p), 0),
    pagina: Number(pagina) || 1,
    porPagina,
    hayMas: desde + porPagina < cuantos,
    productos: lista.slice(desde, desde + porPagina).map(p => productoJson(p)),
  };
}

/**
 * Lista para surtir el anaquel.
 * @param {{area?: string, incluirCocina?: boolean, incluirSinConteo?: boolean, buscar?: string}} filtros
 */
export function vistaResurtido(snap, filtros = {}, opciones = {}) {
  const { area = '', incluirCocina = false, incluirSinConteo = false, buscar = '' } = filtros;
  // Tope por grupo: en Casita 1 hay ~550 urgentes. Mandarlos todos son cientos de
  // kilobytes por el túnel y otras tantas tarjetas en el celular, cuando nadie va a
  // surtir más de unas decenas de una sentada. Van los más urgentes primero y la
  // pantalla dice cuántos quedaron fuera.
  const tope = Math.min(Math.max(Number(opciones.tope) || 150, 1), 1000);
  const texto = normalizar(buscar);

  let filas = snap.resurtido;
  if (area) filas = filas.filter(r => r.area === area);
  if (!incluirCocina) filas = filas.filter(r => !r.esCocina);
  // Lo que nunca se contó en ninguna área casi siempre es comida preparada o un
  // código genérico: estorba en la lista de surtido.
  if (!incluirSinConteo) filas = filas.filter(r => !r.nuncaContado);
  if (texto) filas = filas.filter(r => normalizar(r.nombre).includes(texto) || r.codigo.includes(buscar.trim()));

  const armar = f => {
    const p = snap.porCodigo.get(f.codigo);
    return {
      codigo: f.codigo,
      nombre: f.nombre,
      foto: f.foto,
      area: f.area,
      estado: f.estado,
      piezasArea: f.disponible,
      apartadas: p?.porArea.get(f.area)?.apartado ?? 0,
      vendeAlDia: f.ventaDiaria,
      vendidas14: redondear(f.vendidas14),
      coberturaDias: f.coberturaDias,
      sugerido: f.sugerido,
      accion: f.accion.texto,
      accionNota: f.accion.nota,
      accionTipo: f.accion.tipo,
      enRespaldo: (snap.areasRespaldo ?? []).map(nombre => ({
        area: nombre,
        piezas: p?.porArea.get(nombre)?.cantidad ?? null,
      })),
      esCocina: f.esCocina,
    };
  };

  const porEstado = estado => ordenarResurtido(filas.filter(f => f.estado === estado));
  const todosUrgentes = porEstado('urgente');
  const todosBajos = porEstado('bajo');
  const todosSinConteo = porEstado('sin_conteo');

  return {
    filtros: { area, incluirCocina, incluirSinConteo, buscar },
    areasVenta: snap.areasVenta,
    // Cuántos hay en total (aunque no vayan todos en esta respuesta).
    cuentas: {
      urgentes: todosUrgentes.length,
      bajos: todosBajos.length,
      sinConteo: todosSinConteo.length,
    },
    tope,
    urgentes: todosUrgentes.slice(0, tope).map(armar),
    bajos: todosBajos.slice(0, tope).map(armar),
    sinConteo: todosSinConteo.slice(0, tope).map(armar),
  };
}

/** Más vendidos por piezas (7 o 30 días), por área. */
export function vistaMasVendidos(snap, filtros = {}) {
  const { dias = 30, area = '', incluirCocina = false, limite = 50 } = filtros;
  const ventana = Number(dias) === 7 ? 'v7' : 'v30';
  const campo = Number(dias) === 7 ? 'd7' : 'd30';

  const filas = [];
  for (const p of snap.productos) {
    // "Comida de cocina" incluye lo que nunca se contó: son los códigos genéricos
    // con los que se cobra la comida hecha en casa y taparían el top de ventas.
    if (!incluirCocina && (p.esCocina || p.nuncaContado)) continue;
    let piezas = 0;
    if (area) piezas = Number(p.porArea.get(area)?.[ventana] ?? 0);
    else piezas = Number(p.vendidas[campo] ?? 0);
    if (piezas <= 0) continue;
    const enArea = area ? p.porArea.get(area) : null;
    filas.push({
      codigo: p.codigo,
      nombre: p.nombre,
      foto: p.foto,
      piezas: redondear(piezas),
      clase: p.clase,
      esCocina: p.esCocina,
      piezasEnTienda: area ? (enArea?.cantidad ?? null) : p.piezas,
      area: area || null,
    });
  }
  filas.sort((a, b) => b.piezas - a.piezas || a.nombre.localeCompare(b.nombre, 'es'));
  return {
    filtros: { dias: Number(dias) === 7 ? 7 : 30, area, incluirCocina },
    areasVenta: snap.areasVenta,
    cuantos: filas.length,
    productos: filas.slice(0, limite),
  };
}

/** Buscador: por código o por nombre, sobre lo que ya está en memoria. */
export function vistaBuscar(snap, { q = '', limite = 40 } = {}) {
  const crudo = String(q ?? '').trim();
  const texto = normalizar(crudo);
  if (texto.length < 2) return { q: crudo, cuantos: 0, productos: [] };

  const palabrasBuscadas = texto.split(' ').filter(Boolean);
  const resultados = [];
  for (const p of snap.productos) {
    let puntos = 0;
    if (p.codigo === crudo) puntos = 100;
    else if (p.codigo.includes(crudo) && crudo.length >= 3) puntos = 60;
    else if (p.nombreNormalizado.startsWith(texto)) puntos = 50;
    else if (palabrasBuscadas.every(w => p.nombreNormalizado.includes(w))) puntos = 30;
    if (!puntos) continue;
    // Primero lo que hay en la tienda.
    resultados.push({ p, puntos: puntos + (p.piezas > 0 ? 10 : 0) });
  }
  resultados.sort((a, b) => b.puntos - a.puntos || b.p.piezas - a.p.piezas);
  return {
    q: crudo,
    cuantos: resultados.length,
    productos: resultados.slice(0, limite).map(r => productoJson(r.p)),
  };
}

/** Ficha de un producto. */
export function vistaProducto(snap, codigo) {
  const p = snap.porCodigo.get(String(codigo ?? '').trim());
  if (!p) return null;
  const base = productoJson(p, { detalle: true });
  // Todas las áreas activas, aunque el producto no esté contado ahí: "sin contar"
  // no es lo mismo que cero, y esa diferencia es justo la que confunde en la tienda.
  base.areasTodas = snap.areas.map(a => {
    const enArea = p.porArea.get(a.nombre);
    return {
      area: a.nombre,
      color: a.color,
      contado: !!enArea && enArea.cantidad !== null && enArea.cantidad !== undefined,
      piezas: enArea?.cantidad ?? null,
      apartadas: enArea?.apartado ?? 0,
      ultimaEntrada: enArea?.ultimaEntrada ? naiveAIso(enArea.ultimaEntrada) : null,
      entradaTexto: enArea?.ultimaEntrada ? fechaCorta(enArea.ultimaEntrada) : null,
      vendidas14: redondear(enArea?.v14 ?? 0),
    };
  });
  base.resurtido = snap.resurtido
    .filter(r => r.codigo === p.codigo)
    .map(r => ({
      area: r.area, estado: r.estado, vendeAlDia: r.ventaDiaria,
      coberturaDias: r.coberturaDias, sugerido: r.sugerido,
      accion: r.accion.texto, accionNota: r.accion.nota,
    }));
  return base;
}
