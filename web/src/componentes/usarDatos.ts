import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculando, SinSesion } from '../api';

/**
 * Pide datos al servidor y deja claro en qué estado está la pantalla.
 *
 * Antes cada pantalla hacía su propio `.then().finally()` SIN `catch`: si el
 * servidor contestaba 503 ("todavía estoy juntando la información") o cualquier
 * error, la promesa se rompía sin que nadie la atrapara y la pantalla se quedaba
 * con el spinner para siempre — o peor, se pintaba con datos a medias.
 *
 *  · error      -> se muestra el aviso y un botón para reintentar
 *  · calculando -> el motor apenas está armando la foto: se vuelve a preguntar solo
 *  · cargando   -> hay una petición en curso (aunque ya haya datos viejos en pantalla)
 */
export function usarDatos<T>(
  cargar: () => Promise<T>,
  deps: unknown[],
  opciones: { retrasoMs?: number } = {},
) {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [calculando, setCalculando] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const reloj = setTimeout(() => {
      cargarRef.current()
        .then(d => {
          if (!vivo) return;
          setDatos(d);
          setError('');
          setCalculando(false);
        })
        .catch(e => {
          if (!vivo) return;
          if (e instanceof SinSesion) return;      // App manda al login
          if (e instanceof Calculando) { setCalculando(true); setError(''); return; }
          setError(e?.message || 'No se pudo traer la información');
        })
        .finally(() => { if (vivo) setCargando(false); });
    }, opciones.retrasoMs ?? 0);
    return () => { vivo = false; clearTimeout(reloj); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, vuelta]);

  // Mientras el motor calcula, se vuelve a preguntar solo (sin molestar a la caja:
  // es la misma foto en memoria).
  useEffect(() => {
    if (!calculando) return undefined;
    const t = setTimeout(() => setVuelta(v => v + 1), 4000);
    return () => clearTimeout(t);
  }, [calculando, vuelta]);

  const reintentar = useCallback(() => setVuelta(v => v + 1), []);
  return { datos, cargando, error, calculando, reintentar };
}
