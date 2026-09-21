# Guía rápida — Inventario La Casita

Esta página enseña **todo el inventario en piezas** (nunca en dinero): qué hay y
dónde, qué hay que subir al anaquel, cómo se está vendiendo y qué hay que revisar.

**Lo único que puede hacer** es **pedir un resurtido**: eso crea una tarea que el de
bodega ve en la TC52 y hace físicamente. No se puede editar, borrar ni mover
inventario desde aquí.

## Cómo entrar

1. Abre en el celular (o en la computadora) la dirección que te llegó por correo
   (se ve así: `https://algo-algo-algo.trycloudflare.com`).
2. Escribe tu **usuario** y tu **contraseña**.
3. Listo. La sesión dura 12 horas; después vuelve a pedir la contraseña.

> **Si la dirección ya no abre:** es normal cada cierto tiempo (cuando se reinicia
> la computadora de la tienda, la dirección cambia sola). Llega un correo nuevo con
> la dirección al día. Guarda siempre el último correo.

Arriba siempre está: el nombre del módulo, **"Actualizado a las 14:30"** (la hora en
que se tomaron los datos), el **buscador** (nombre o código: encuentra cualquier
producto, hasta los que solo existen en la caja), el botón de la flecha circular
(volver a preguntar) y **Salir**.

Abajo, en el celular (arriba, en la computadora), están los cuatro módulos:
**Inventario · Resurtir · Movimiento · Alertas**.

---

## 1. Inventario (la pantalla que abre primero)

- **Resumen del día**: ocho tarjetas (urgentes, piezas a mover, **agotados**,
  **falta en anaquel**, bajo stock, sobrestock, sin movimiento 90+,
  descontinuados). Tocar una aplica ese filtro a la lista. (Las alertas tienen su
  propio módulo abajo, con su número.)
- **Cobertura por sucursal**: "42 d de cobertura" = con lo que se vende, a la
  mitad de los productos de Casita 1 les alcanza para 42 días. Tocar una sucursal
  filtra por esa área.
- **Filtros**: área, **condiciones** (se pueden combinar: por ejemplo "Sobrestock" +
  "Sin movimiento 90+ días"), prioridad, categoría y orden. "Incluir contados en 0"
  y "Ver cocina" abren la lista completa. Los filtros se quedan en la dirección de
  la página: si abres una ficha y regresas, la lista sigue igual.
- **La lista**: 60 productos por página ("Ver más" trae los siguientes). En la
  computadora salen tres por fila.

Cada tarjeta trae: foto, nombre, código, categoría, **piezas por área** (con el
color de cada área; "—" quiere decir *nunca se ha contado ahí*), total de piezas,
piezas por día, última venta, última entrada, rotación y sus **badges**.

### Qué significa cada badge

| Badge | Qué es | Qué hacer |
|---|---|---|
| **Agotado** (rojo) | Se vende y **no hay en ninguna área** (ni en Bodega) | Comprarlo |
| **Falta en Casita 1** (rojo) | Se vende en esa sucursal y ahí hay **0**, pero **sí hay en otra área**. La tarjeta lo dice: *"Hay 0 en Casita 1 y se vende ahí. Sí hay 202 en Casita 2: hay que moverlas"* | Moverlas hoy (Resurtir) |
| **Bajo stock** (ámbar) | Con lo que se vende, alcanza para menos de 7 días | Surtirlo pronto |
| **Sobrestock** (morado) | Alcanza para más de 120 días (o no se vende y hay 24+ piezas) | No comprar más |
| **Más vendido** (verde) | Está entre los 50 que más piezas venden en 30 días | Cuidar que no falte |
| **Lento** (gris) | Su última venta fue hace entre 30 y 90 días | Vigilarlo |
| **Sin movimiento 30 / 60 / 90 / 180+ días** (gris) | Lleva esos días sin venderse (o desde que se contó, si nunca ha vendido) | Decidir: promoción, remate o descontinuar (en el Admin) |
| **Nuevo, sin venta** (azul) | Se contó por primera vez hace menos de 30 días y todavía no vende | Esperar; ¿está exhibido? |
| **Descontinuado** (negro) | **Lo marcó el dueño en el Admin.** No es lo mismo que "sin movimiento" | No se pide resurtido; sacar lo que quede |
| **Posible código duplicado** (naranja) | Está contado con un código y se vende con otro ("Se vende como 00987339 KINDER JOY") | Unificar el código en la TC52 |
| **Sin alta en caja** (rojo, contorno) | La TC52 lo contó, pero la caja no conoce ese código: no se cobra bien | Darlo de alta en NovaCaja (Admin → Inventario) |
| **Desfasado: cuéntalo** (rojo, contorno) | El sistema dice 0 y se sigue vendiendo | Contarlo con la TC52 (ver abajo) |

> Ojo: un producto puede tener **"Falta en Casita 1"** y a la vez **"Sobrestock"**:
> hay 0 donde se vende y 200 guardadas en otra área. No es una contradicción, es
> justo lo que hay que arreglar moviéndolas.

**Prioridad**: **alta** = agotado, falta en anaquel, alcanza para menos de 2 días o desfasado;
**media** = bajo stock; **baja** = el resto.

---

## 2. Resurtir

*Qué mover, desde dónde, hacia dónde y cuántas piezas.*

- **Tarjetas**: urgentes, piezas a mover, transferencias sugeridas (hay en
  Bodega), sin respaldo en bodega (hay que comprarlo) y la sucursal más urgente.
- **Filtros**: **Urgente hoy** (alcanza para menos de 2 días), **Próximos 3 días**,
  **Próximos 7 días**; Hay 0 en la sucursal / Bajo stock; sucursal; categoría; solo prioridad
  alta; ver cocina; ver lo no contado.
- **Cada tarjeta** dice: para qué sucursal, **cuántos días alcanza** (en grande), las
  piezas ahí, las piezas por día, las piezas en Bodega, la acción en texto y las
  **piezas a mover** (ya sugeridas; se pueden cambiar).

Las acciones en texto:

- **"Mover 8 de Bodega (hay 40)"** → hay en Bodega, súbelo.
- **"Sin respaldo en bodega: hay que comprarlo"** → no hay en Bodega.
- **"No está contado en Casita 2: cuéntalo con la TC52"** → primero hay que contar.
- **"Cuéntalo con la TC52: el sistema dice 0 y se sigue vendiendo"** → está
  desfasado; abajo dice cuántas se vendieron sin existencia y desde cuándo.

### Solicitar resurtido (la única acción de verdad)

1. Toca **Solicitar resurtido** en la tarjeta (o en la ficha del producto).
2. Revisa **hacia** dónde va (la sucursal), **desde** dónde sale (Bodega) y las
   **piezas**. La app propone cuántas según lo que se vende y lo que hay en Bodega.
   Puedes poner una nota.
3. Confirma: *"Se pedirá mover 8 pzas de Bodega a Casita 2. El de bodega lo verá
   en la TC52. ¿Continuar?"*
4. La tarjeta queda como **"Solicitado · pendiente en TC52"**.

Qué pasa después: el de bodega ve la solicitud en la pestaña **Resurtir** de la
TC52, mueve las piezas y registra el traslado escaneando. **En ese momento la
solicitud se cierra sola** (pasa a "Hecha"). Si ya hay una solicitud pendiente del
mismo producto para la misma sucursal, la app lo avisa y **no la duplica**.

Desde aquí no se cancelan ni se marcan hechas: eso se hace en la TC52 o en el
panel Admin (Bodega → Resurtido). Si el panel admin no está encendido, el botón
no aparece y la app lo dice.

### Mi lista (en este teléfono)

"Agregar a mi lista" arma una lista personal con palomitas para ir tachando
mientras surtes, y un botón **Imprimir**. Se guarda **solo en este teléfono**: el
de al lado no la ve y el de bodega tampoco. Para que bodega lo sepa está
"Solicitar resurtido".

### Historial de resurtido

Pendientes, hechas y canceladas, con quién la pidió, cuándo, y cuándo la cerró la
TC52 (o por qué se canceló). Son las mismas que ve el Admin.

---

## 3. Movimiento

*Comportamiento del inventario medido en piezas, sin datos de dinero.*

- **7 / 30 / 90 días**, por sucursal o toda la tienda; "incluir cocina" apagado
  (la comida hecha en casa no tiene inventario).
- **Piezas vendidas** en 7, 30 y 90 días con el **% contra el mismo número de días
  justo antes** (↑ subió, ↓ bajó).
- **Más vendidos por piezas** (top 10, con cuántas quedan).
- **Categorías con más movimiento** y **comparativo por sucursal** (barras).
- **Aceleran ventas / Bajan ventas**: los 5 que más subieron o bajaron contra el
  periodo anterior (mínimo 10 piezas, para no contar ruido).
- **Mapas de calor**: categoría × día de la semana, sucursal × día de la semana y
  el calendario del periodo. Arriba dice, por ejemplo, *"Sábado y domingo
  concentran el mayor movimiento"*.
- **Ranking de rotación**: rotación = piezas vendidas en 30 días entre las piezas
  que hay. Toca una columna para ordenar.

---

## 4. Alertas

Cosas que hay que revisar, explicadas en sencillo. Arriba, cuántas hay y cuántas
urgentes; filtros **Todas · Urgentes · Códigos · Caja · Catálogo · Inventario**.
Solo hay dos botones, y los dos hacen algo real: **Ver producto** (abre la ficha)
y **Descartar** (queda guardado quién y cuándo; se puede **Deshacer**; "Ver
descartadas" las enseña).

| Alerta | Qué significa | Qué hacer |
|---|---|---|
| **Posible código duplicado** (urgente) | Se cuenta con un código y se vende con otro | Revisar si es el mismo producto y corregir el código en la TC52 |
| **No está dado de alta en caja** (urgente) | Hay piezas contadas, pero la caja no conoce el código: no se cobra bien | Darlo de alta en NovaCaja (Admin → Inventario → Dar de alta) |
| **Inventario desfasado** (urgente) | El sistema dice 0 y se sigue vendiendo | Contarlo con la TC52 |
| **Posible ubicación incorrecta** | Parece refrigerado (quesos, carnes, congelados) y está contado en Bodega o en el anaquel | Verificar dónde está físicamente |
| **Entradas sin ventas** | Llegó hace 30 días o más y no ha vendido ni una pieza | ¿Está exhibido? ¿Se vende con otro código? |
| **Sobrestock crítico** | Con lo que se vende, alcanza para más de 6 meses | No comprar más |
| **Estancado demasiado tiempo** | Sin movimiento 180+ días y no está descontinuado | Decidir si se descontinúa (en el Admin) o se promociona |
| **Producto sin categoría** | Se vende (10+ piezas al mes) y no tiene categoría útil (ABARROTES no cuenta) | Ponerle categoría en el Admin |

Cuando hay miles, la página enseña las **300 más importantes** (primero las
urgentes y las de más piezas) y dice cuántas hay en total: filtra por grupo para
ver las demás.

---

## La ficha de un producto

Al tocar cualquier producto: foto grande, nombre, código, categoría, badges,
**piezas en tienda**, apartadas (pedidos de la página web), piezas por día,
cobertura, rotación, última venta, última entrada y **tendencia** 7/30/90.

- **Dónde hay**: todas las áreas, con la diferencia que importa: **0 piezas** = se
  contó y no hay; **"sin contar"** = nadie lo ha contado ahí nunca (puede haber).
- **Unidades vendidas** en 7/30/90 días y por área en los últimos 14.
- **Para surtir el anaquel**: por sucursal, cuánto alcanza y el botón "Solicitar
  resurtido".
- **Últimos movimientos**: entradas, salidas, traslados, mermas y ajustes
  registrados en bodega (sin dinero).
- **Solicitudes de resurtido** de ese producto.

Si el producto está **Descontinuado**, lo dice en un recuadro negro con la fecha en
que se marcó en el Admin, y **no** ofrece pedir resurtido.

---

## Inventario desfasado: por qué el sistema dice 0 si sí hay

Cada venta de la caja se descuenta sola del área de esa caja (Casita 1 o
Casita 2), y el sistema **nunca baja de 0**. Si se sube producto al anaquel
**sin registrarlo en la TC52** (entrada o traslado desde Bodega), el sistema
llega a 0 y ahí se queda, aunque el producto se siga vendiendo todos los días.

Ejemplo real: GHIRARDELLI CARAMEL SQUARE se registró una sola vez (50 piezas el
21 de julio). Desde el 2 de agosto el sistema dice 0 y se han vendido más de 250
piezas.

La página lo detecta sola: si en un área **se vendió con el sistema en 0** en
los últimos 14 días y nadie lo ha vuelto a contar, lo marca como **desfasado**.

**Cómo se arregla:** contar el producto en esa área con la TC52 (o registrar la
entrada / el traslado cuando se surte). En unos 5 minutos deja de salir como
desfasado. Y para que no vuelva a pasar: **todo lo que se sube al anaquel se
registra en la TC52** (las solicitudes de resurtido ayudan justo a eso).

---

## Cosas que conviene saber

- **No hay precios ni dinero en ninguna pantalla.** A propósito: esta página la
  puede abrir cualquiera que resurta.
- Los números salen del **conteo de la TC52** y de los **tickets de la caja**. Si
  algo no cuadra, casi siempre es que ese producto no se ha contado en esa área.
- Los cambios de la TC52 se ven aquí en unos **5 minutos**; las ventas largas y los
  mapas de calor, en 30.
- **Descontinuado** solo lo pone el dueño en el Admin (Inventario → producto →
  Descontinuado). Aquí solo se muestra.
- ¿Olvidaste tu contraseña? No hay forma de recuperarla desde la página: hay que
  ponerla de nuevo en la computadora de la tienda.
