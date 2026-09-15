import React from 'react';
import type { Solicitud } from '../api';

/**
 * Modal "Solicitar resurtido": la ÚNICA acción sobre el inventario. Crea una
 * solicitud en el admin (POST /api/solicitudes) que el de bodega ejecuta con la
 * TC52; cuando registra el traslado, la solicitud se cierra sola.
 *
 * Esta es la interfaz que comparten Producto.tsx (ficha) y Resurtir.tsx.
 * ESTE ARCHIVO ES UN STUB: la implementación completa la hace el agente de
 * Resurtir/Movimiento/Alertas, conservando exactamente estas props.
 */
export type PropsSolicitarResurtido = {
  abierto: boolean;
  producto: { codigo: string; nombre: string; descontinuado?: boolean; foto?: string | null };
  /** Área de venta hacia donde se sugiere mover (p. ej. "Casita 1"). */
  areaSugerida?: string;
  /** Piezas sugeridas (editable en el modal). */
  cantidadSugerida?: number;
  /** Solicitud pendiente que ya existe para este producto+área, si se sabe. */
  solicitudExistente?: { id: number; cantidad: number; creado: string } | null;
  alCerrar: () => void;
  /** Se llama cuando el admin confirmó la solicitud (o cuando ya existía una: 409). */
  alSolicitar: (solicitud: Solicitud, yaExistia: boolean) => void;
};

export function SolicitarResurtido(_props: PropsSolicitarResurtido) {
  return null;
}
