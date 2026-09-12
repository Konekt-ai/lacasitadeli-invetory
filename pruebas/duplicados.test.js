import { describe, expect, it } from 'vitest';
import { buscarDuplicados } from '../src/calculos/duplicados.js';
import { normalizar, parecido, sinCerosIzquierda, soloDigitos } from '../src/calculos/texto.js';

describe('buscarDuplicados — casos reales de la tienda', () => {
  it('Kinder Joy: 098733 (507 piezas, cero ventas) se vende como 00987339', () => {
    const r = buscarDuplicados(
      [{ codigo: '098733', nombre: 'Kinder Joy Stranger Things' }],
      [{ codigo: '00987339', nombre: 'KINDER JOY ', piezasVendidas: 587 }],
    );
    expect(r.get('098733')).toMatchObject({ codigo: '00987339', piezasVendidas: 587 });
    expect(r.get('098733').motivos).toContain('codigo');
  });

  it('Starbucks: 126490 "ATARBUCKS" se vende como 01264904 "STARBUCKS"', () => {
    const r = buscarDuplicados(
      [{ codigo: '126490', nombre: 'ATARBUCKS FRAPPUCCINO MOCHA 281ML' }],
      [{ codigo: '01264904', nombre: 'STARBUCKS FRAPUCCINO MOCHA 281ML', piezasVendidas: 143 }],
    );
    const m = r.get('126490');
    expect(m.codigo).toBe('01264904');
    expect(m.parecidoNombre).toBeGreaterThan(0.85);
  });

  it('con el nombre casi igual basta, aunque el código no se parezca', () => {
    const r = buscarDuplicados(
      [{ codigo: '015000350314', nombre: 'Gerber strawberry banana' }],
      [{ codigo: '015000492328', nombre: 'GERBER BANANA STRAWBERRY', piezasVendidas: 5 }],
    );
    expect(r.get('015000350314')?.codigo).toBe('015000492328');
  });

  it('NO inventa duplicados: que el código vaya adentro no alcanza si nada más coincide', () => {
    // Caso real que salía mal antes: 00014892 (crema de cacahuate) contra
    // 148927060614 (bebida energética). Comparten "14892" y nada más.
    const r = buscarDuplicados(
      [{ codigo: '00014892', nombre: 'CRUNCHY PEANUT BUTTER UNSALTED' }],
      [{ codigo: '148927060614', nombre: 'AMINO ENERGY DRINK', piezasVendidas: 1 }],
    );
    expect(r.has('00014892')).toBe(false);
  });

  it('no confunde sabores distintos de la misma marca', () => {
    const r = buscarDuplicados(
      [{ codigo: '750100000011', nombre: 'JUGO DE MANGO 1 L' }],
      [{ codigo: '750100000028', nombre: 'JUGO DE PIÑA 1 L', piezasVendidas: 90 }],
    );
    expect(r.has('750100000011')).toBe(false);
  });

  it('ignora códigos internos cortos (0, 030, 10): son genéricos, no duplicados', () => {
    const r = buscarDuplicados(
      [{ codigo: '030', nombre: 'BAGUETTE' }, { codigo: '10', nombre: 'EMPANADA' }],
      [{ codigo: '0300123456789', nombre: 'OTRA COSA', piezasVendidas: 400 }],
    );
    expect(r.size).toBe(0);
  });

  it('se queda con el que más vende cuando hay varios candidatos', () => {
    const r = buscarDuplicados(
      [{ codigo: '342400', nombre: 'HERSHEYS MILK CHOCOLATE 210CALORIES 43G' }],
      [
        { codigo: '03424005', nombre: 'HERSHEYS MILK CHOCOLATE 43G', piezasVendidas: 78 },
        { codigo: '03424006', nombre: 'HERSHEYS MILK CHOCOLATE 43G', piezasVendidas: 2 },
      ],
    );
    expect(r.get('342400').codigo).toBe('03424005');
  });

  it('no se compara consigo mismo', () => {
    const r = buscarDuplicados(
      [{ codigo: '098733', nombre: 'Kinder Joy' }],
      [{ codigo: '098733', nombre: 'Kinder Joy', piezasVendidas: 10 }],
    );
    expect(r.size).toBe(0);
  });

  it('aguanta listas vacías', () => {
    expect(buscarDuplicados([], []).size).toBe(0);
    expect(buscarDuplicados([{ codigo: '111111' }], []).size).toBe(0);
  });

  it('con miles de productos no se tarda una eternidad', () => {
    const sinVentas = Array.from({ length: 2000 }, (_, i) => ({
      codigo: String(700000 + i), nombre: `PRODUCTO DE PRUEBA ${i}`,
    }));
    const candidatos = Array.from({ length: 8000 }, (_, i) => ({
      codigo: String(10000000000 + i), nombre: `OTRO PRODUCTO ${i}`, piezasVendidas: 5,
    }));
    const t0 = Date.now();
    buscarDuplicados(sinVentas, candidatos);
    expect(Date.now() - t0).toBeLessThan(8000);
  });
});

describe('texto', () => {
  it('normaliza acentos, signos y mayúsculas', () => {
    expect(normalizar('  Té de manzanilla, 20 pzs. ')).toBe('TE DE MANZANILLA 20 PZS');
  });
  it('saca los dígitos y los ceros de la izquierda', () => {
    expect(soloDigitos('AB-098733')).toBe('098733');
    expect(sinCerosIzquierda('00987339')).toBe('987339');
  });
  it('el parecido aguanta errores de dedo', () => {
    expect(parecido('STARBUCKS FRAPUCCINO MOCHA', 'ATARBUCKS FRAPPUCCINO MOCHA')).toBeGreaterThan(0.8);
    expect(parecido('COCA COLA', 'JABON ZOTE')).toBeLessThan(0.3);
    expect(parecido('IGUAL', 'IGUAL')).toBe(1);
    expect(parecido('', 'ALGO')).toBe(0);
  });
});
