import React, { useState } from 'react';
import { api } from '../api';
import { Aviso, Icono } from '../componentes/basicos';

export function Entrar({ alEntrar }: { alEntrar: () => void | Promise<void> }) {
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const mandar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      await api.entrar(usuario.trim(), contrasena);
      await alEntrar();
    } catch (err) {
      setError((err as Error).message || 'No se pudo entrar');
      setContrasena('');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="respeta-bordes flex min-h-screen flex-col items-center justify-center">
      <form onSubmit={mandar} className="tarjeta w-full max-w-sm p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/logo.png" alt="La Casita Deli" className="h-16 w-16 object-contain" />
          <h1 className="titulo text-2xl leading-tight">Inventario La Casita</h1>
          <p className="text-sm text-on-surface-variant">Para ver qué no se vende y qué hay que resurtir</p>
        </div>

        <label className="etiqueta mb-1 block" htmlFor="usuario">Usuario</label>
        <input
          id="usuario"
          name="usuario"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          value={usuario}
          onChange={e => setUsuario(e.target.value)}
          className="mb-4 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-base outline-none focus:border-primary"
        />

        <label className="etiqueta mb-1 block" htmlFor="contrasena">Contraseña</label>
        <input
          id="contrasena"
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={e => setContrasena(e.target.value)}
          className="mb-5 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 text-base outline-none focus:border-primary"
        />

        {error && <div className="mb-4"><Aviso texto={error} /></div>}

        <button type="submit" disabled={ocupado} className="boton-lleno w-full">
          {ocupado ? 'Entrando…' : <>Entrar <Icono nombre="arrow_forward" className="text-[18px]" /></>}
        </button>

        <p className="mt-5 text-center text-xs text-on-surface-variant">
          Esta página es solo para ver. No cambia nada del sistema de la tienda.
        </p>
      </form>
    </div>
  );
}
