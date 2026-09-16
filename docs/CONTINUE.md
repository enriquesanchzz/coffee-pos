# Cómo continuar este proyecto

Léelo antes de seguir desarrollando. Resume el estado real del repo, qué se
verificó y qué falta, para que cualquiera (incluyendo otra sesión de
Claude Code) pueda retomarlo sin arqueología.

## Estado actual (resumen)

| Pieza | Estado |
|---|---|
| Modelo de datos (Prisma, 27 modelos) | ✅ Completo desde Fase 0, ajustado en Fase 1. |
| Seed base (roles/permisos/sucursal) | ✅ `prisma/seed.ts`. |
| Módulo **POS** (login por PIN, catálogo, carrito, venta, descuento de inventario) | ✅ Construido y verificado en este repo. |
| Seed de demo (productos, recetas, empleados, turno) | ✅ `prisma/seed-demo.ts`. |
| Módulo **Caja** (doble confirmación de apertura/cierre, corte, retiros/ingresos) | ✅ Construido. Doble confirmación ahora valida permiso real (`CAJA_ABRIR`/`CAJA_CERRAR`), no solo "empleado distinto" — ver sección Administración abajo. |
| Módulo **Inventario** (consulta, ajustes) | ✅ Construido (`/inventario`). Alertas de caducidad (`IngredientBatch.expirationDate`) no incluidas — no hay lotes sembrados con fecha todavía. |
| UI de **Recetas** (alta de producto+receta, edición versionada) | ✅ Construido, luego reemplazado por el Módulo Productos (`/productos`) — ver más abajo. |
| **Administración** (auth real, gestión de empleados/roles, permisos reales) | ✅ Construido (`/administracion`). Ver sección dedicada abajo. |
| Módulo **Compras** — Proveedores + Órdenes de compra (Fase 2) | ✅ Construido y mergeado a `main` (PR #3). |
| **Transferencias + Conteos físicos** (resto de Fase 2) | ✅ Construido y mergeado a `main` (PR #4, `/compras/transferencias`, `/compras/conteos`). |
| Módulo **Reportes** (Fase 3) | ✅ Construido y mergeado a `main` (PR #5, `/reportes`). |
| **Clientes + Lealtad + Descuentos** (Fase 4) | ✅ Construido (`/clientes`, rama `feature/modulo-clientes`). Ver sección dedicada abajo. |
| **Cambios Punto de Venta** (categorías verticales, imagen, extras libres, notas, Frío/Caliente, sustitución real, búsqueda de cliente) | ✅ Construido (rama `cambios-punto-venta`). Ver sección dedicada abajo. |
| **Reskin visual del POS** (estilo "Purr'Coffee": tarjetas con selección rápida, tipo de orden, buscador) | ✅ Construido (rama `pos-reskin-purrcoffee`). Ver sección dedicada abajo. |
| **Menú real de LAPSO** (68 productos reales reemplazan el catálogo de demo) | ✅ Sembrado (`prisma/seed-lapso.ts`). Ver sección dedicada abajo. |
| **Mejoras avanzadas de POS** (subcategorías, búsqueda global, Frío/Caliente/tipo de leche reales, mesa, cliente/domicilio inline, código de lealtad, nota de transferencia) | ✅ Construido (rama `pos-mejoras-avanzadas`). Ver sección dedicada abajo. |
| **Módulo Productos** (antes Recetas: temperatura/tamaño/vaso reales, tipo de leche y extras editables desde la UI, merch/souvenirs/tarjetas, agregar variante) | ✅ Construido (rama `modulo-productos`). Ver sección dedicada abajo. |
| **Productos + POS 2** (navegación tipo tarjetas en ambas pantallas, costo/precio sugerido, íconos de categoría, cuentas abiertas de Mesa, defaults/medidas estándar, 2 bugs de stepper) | ✅ Construido (rama `productos-pos-mejoras-2`). Ver sección dedicada abajo. |
| Multi-sucursal en UI (Fase 5) | ⚪ No construido. `DEFAULT_BRANCH_ID` fijo en `lib/constants.ts`. |

## Qué se verificó en esta sesión

No solo se escribió código: se probó de punta a punta contra una base
PostgreSQL real (no simulada).

1. `npm install`, `npx prisma generate`, `npx tsc --noEmit` y
   `npx next build` — todos limpios, sin errores.
2. Se levantó Postgres local, se aplicaron las 4 migraciones existentes
   (`prisma migrate deploy`), se corrieron ambos seeds.
3. Se abrió el navegador (Playwright) contra `npm run dev`, se hizo login
   con el PIN de Luis, se armó una cuenta de **Latte Grande + Shot extra +
   Capuccino Chico** y se cobró.
4. Se verificó directo en la base de datos:
   - `Sale.total = 112.00` — coincide con lo esperado.
   - Los `InventoryMovement` generados descuentan exactamente lo que la
     receta define: café (2 grande + 1 shot extra + 1 capuccino = 4
     `ESPRESSO_SHOT`), leche (390 `ML`), vaso (2 `PIEZA`), y el jarabe de
     vainilla casero (ingrediente **compuesto**) se resolvió recursivamente
     de forma correcta (5 `G` azúcar, 5 `ML` agua, 0.25 `ML` esencia).

Esto confirma que la decisión de arquitectura central (ADR-001: inventario
por ingrediente vía receta, resuelto recursivamente) funciona en código
real, no solo en el diseño.

### Bug encontrado y corregido durante la verificación

`createSale` devolvía el registro `Sale` de Prisma tal cual (con campos
`Decimal`) desde un Server Action hacia un componente cliente
(`CheckoutDialog`). Next.js no puede serializar `Decimal` al cruzar esa
frontera server→client — se veía como error en consola del navegador. Se
corrigió devolviendo un objeto plano con los montos convertidos a `number`.
Si en el futuro se hace que otro Server Action regrese un modelo de Prisma
con campos `Decimal`/`Date` directo a un client component, va a pasar lo
mismo — conviene mapear siempre a un tipo plano antes de regresar.

## Módulo Caja (rama `feature/modulo-caja`)

Construido y verificado end-to-end contra Postgres real (Playwright): apertura
de turno con PIN de un segundo empleado (`openShift` en `actions/shift.ts`),
retiros/ingresos desde un modal en el POS (`actions/cash.ts`), y cierre con
corte (`closeShift`/`previewShiftClose`) que calcula `expectedCash` solo al
momento de cerrar (`openingCash + ventas efectivo - retiros + ingresos`) y
exige motivo si hay diferencia. Pantalla nueva en `/caja`
(`app/caja/page.tsx` + `components/caja/`).

Simplificación deliberada: la confirmación de un segundo empleado (apertura y
cierre) solo exige que sea un empleado activo **distinto** de quien cuenta la
caja — no valida permiso (`CAJA_ABRIR`/`CAJA_CERRAR`/`CAJA_CORTE_AUTORIZAR`
ya existen en el catálogo pero no hay infraestructura de chequeo de permisos
en el código todavía). Eso debería resolverse cuando se construya
Administración con auth real.

Durante la verificación de este módulo se encontró y corrigió un drift
preexistente entre `schema.prisma` y las migraciones (varios campos/tablas de
Fase 2 — Compras — estaban en el schema sin migración aplicada, ej.
`Ingredient.expirationAlertDays`, `PurchaseOrderStatus`, `reorder_points`).
Se generó la migración `20260805002351_fix_ingredient_expiration_alert_drift`
para ponerlos en sync; no había datos en esas tablas, así que no hubo
pérdida de información.

## Módulo Inventario (`/inventario`)

Consulta de stock por ingrediente (agrupado por categoría, con indicador de
"stock bajo" si existe `ReorderPoint`) y ajuste manual (`actions/inventory.ts`
`adjustInventoryStock` — el usuario captura la cantidad real contada, no un
delta; el delta se calcula contra `InventoryStock` y se registra como
`InventoryMovement` tipo `AJUSTE_MANUAL`). Requiere permiso
`INVENTARIO_AJUSTAR` para ajustar y `INVENTARIO_CONSULTAR` para ver la
página (gate a nivel de página, además del chequeo en la acción). Verificado
end-to-end con Playwright contra Postgres real.

Fuera de alcance: alertas de caducidad (`IngredientBatch.expirationDate`) —
no hay lotes con fecha sembrados todavía, se puede agregar cuando haga
falta sin cambios de diseño.

## UI de Recetas (`/recetas`)

Alta completa de un producto vendible (`Product` + `ProductVariant`(s) +
`Recipe` + `RecipeVersion` + `RecipeIngredient`) desde una sola pantalla
(`/recetas/nuevo`), incluyendo alta de ingrediente atómico nuevo inline si
falta en el catálogo (`actions/recipes.ts` `createIngredient`). Crea también
el `BranchProduct` de la sucursal por defecto, así que el producto aparece
de inmediato en `/pos`.

Editar la receta de una variante existente (`/recetas/[variantId]`) **no**
sobreescribe las líneas: desactiva la `RecipeVersion` activa
(`effectiveTo` = ahora) y crea la siguiente, preservando el costeo exacto de
ventas ya hechas contra la versión anterior — es el propósito explícito del
versionado en el schema.

Simplificación deliberada: no se puede crear un ingrediente **compuesto**
nuevo (ej. otro jarabe casero) desde esta pantalla, solo usar los que ya
existen — crearlos sigue siendo vía seed/Prisma Studio.

Verificado end-to-end con Playwright: alta de producto con categoría nueva,
ingrediente nuevo inline, venta en POS del producto recién creado, edición
de receta con verificación en DB de que `versionNumber` avanzó y la versión
anterior quedó `isActive:false`.

Bug encontrado y corregido durante la verificación: al seleccionar un
ingrediente en una línea de receta, la unidad no se sincronizaba con el
`baseUnit` real del ingrediente — quedaba guardada con la unidad default,
lo que habría roto la venta por falta de `UnitConversion`. Ver
`components/recetas/recipe-lines-editor.tsx`.

## Administración (`/administracion`) — auth real + permisos reales

Cierra el último pendiente de Fase 1. Decisiones de producto confirmadas
antes de construirlo (no había proyecto Supabase configurado — sin
credenciales no se podía integrar ni verificar, así que no se adoptó en
esta pasada):

- **Sin Supabase**: hashing propio (`crypto.scrypt`, `lib/password.ts`) y
  sesión firmada/sellada con `iron-session` (`lib/session.ts`) en vez de la
  cookie sin firmar de antes. Migrar a Supabase Auth después no implica
  rehacer el modelo (`Employee`/`Role`/`RolePermission`/
  `EmployeePermissionOverride` ya son independientes del mecanismo de
  login).
- **Login híbrido**: el PIN se mantiene en el POS/Caja para identificar
  rápido quién opera (ahora hasheado, ya no en texto plano). Login fuerte
  (email + password, `authLevel: "password"` en la sesión) solo se exige
  para entrar a **Administración** — editar empleados/roles desde un
  mostrador compartido con un PIN de 4 dígitos no es suficiente evidencia
  de autorización.

Permisos reales activados (`lib/permissions.ts`, matriz ya sembrada en
`prisma/seed.ts`) en los puntos que antes no validaban nada: apertura/cierre
de turno (`CAJA_ABRIR`/`CAJA_CERRAR` sobre quien **confirma**, no quien
cuenta la caja), retiros/ingresos (`CAJA_CHICA_MODIFICAR`), ajuste de
inventario (`INVENTARIO_AJUSTAR`), alta de ingrediente/producto/receta
(`INVENTARIO_CREAR_ITEM`/`PRODUCTO_CREAR`/`RECETA_MODIFICAR`), venta
(`VENTA_REALIZAR`). Todas las Server Actions que reciben `employeeId` del
cliente ahora también validan que coincide con la sesión activa del
servidor antes de proceder — antes se confiaba ciegamente en ese parámetro.

Gestión de empleados (`/administracion`, alta y edición): nombre, email,
PIN, password, rol (asignado a `DEFAULT_BRANCH_ID`, sigue fijo hasta Fase
5), `isCashier`, `isActive`. Fuera de alcance deliberadamente: editar la
matriz `RolePermission` en sí (los 4 roles son una decisión de negocio ya
congelada), UI para `EmployeePermissionOverride` (excepciones por
empleado), reset de password por correo (Administración lo asigna
directo).

Credenciales de demo (`prisma/seed-demo.ts`): Ana (`ana@nomada.cafe` /
`admin1234`) es la única cuenta sembrada con acceso a Administración.

Verificado end-to-end con Playwright contra Postgres real: login por PIN
hasheado, gate de página en `/inventario` por rol, rechazo de acción por
falta de permiso (Recetas), login de Administración (credenciales
incorrectas y correctas), alta de empleado nuevo desde la UI y login
inmediato con su PIN, doble confirmación de cierre de turno rechazada con
un confirmante sin `CAJA_CERRAR` y aceptada con uno que sí lo tiene.

Bug encontrado y corregido durante la verificación: `NewProductForm` y
`EditRecipeForm` (Recetas) usaban `crypto.randomUUID()` dentro del
`useState` inicial para las keys de React — como ese inicializador corre
tanto en SSR como al hidratar en el cliente, generaba un valor distinto
cada vez y rompía la hidratación. Se corrigió usando keys fijos/derivados
de datos reales para el estado inicial, reservando `crypto.randomUUID()`
solo para filas agregadas después vía clic (que nunca corren en SSR). Si
en el futuro se agrega un `useState` inicial con un valor no determinista
(random, `Date.now()`, etc.) en un client component, va a pasar lo mismo.

## Módulo Compras — Proveedores + Órdenes de compra (`/compras`, rama `feature/modulo-compras`)

Primer pedazo de Fase 2, por decisión explícita del usuario de acotar el
alcance: **proveedores + órdenes de compra con recepción**. Transferencias
y conteos físicos se construyeron después, en la rama
`feature/modulo-transferencias-conteos` — ver sección siguiente.

- `/compras/proveedores`: alta/edición de `Supplier` (siempre global,
  `branchId: null` — no hay razón para atarlo a una sucursal con solo una
  sucursal activa) y de qué ingredientes surte a qué costo
  (`IngredientSupplier`, con `isSelected` para marcar el costo "activo" —
  al marcar uno, la acción desmarca los demás del mismo ingrediente en la
  misma transacción).
- `/compras/nueva`: crear una orden (`PurchaseOrder` + `PurchaseOrderItem[]`,
  status inicial `CREADA`). El costo estimado de cada línea se autocompleta
  desde el costo cotizado del proveedor cuando existe.
- `/compras/[id]`: si la orden sigue `CREADA` muestra el formulario de
  recepción; si no, un resumen de solo lectura. **La recepción es de una
  sola vez, no incremental** — el propio schema documenta
  `PROVEIDA_PARCIALMENTE` como terminal ("no se reabre"), así que
  `receivePurchaseOrder` se llama una única vez capturando lo que
  realmente llegó por línea (puede ser menos de lo pedido). Por cada línea
  recibida: crea `IngredientBatch`, incrementa `InventoryStock`, registra
  `InventoryMovement` tipo `COMPRA`, y si el costo real difiere del
  cotizado actualiza `IngredientSupplier.cost` dejando rastro en
  `IngredientCostHistory` (solo al recibir — no al editar el costo cotizado
  a mano, eso es "configurar lista de precios", no una transacción real).

**Unidad de línea bloqueada al `baseUnit` del ingrediente** — mismo
criterio que Recetas/Inventario: no hay ninguna fila en `UnitConversion`
sembrada todavía, así que dejar elegir `purchaseUnit` libremente (ej.
comprar "1 KG" cuando el ingrediente se descuenta en `ESPRESSO_SHOT`)
rompería por falta de conversión. Ordenar en `purchaseUnit` real es un
follow-up una vez que el negocio defina y siembre los factores de
conversión correctos.

**Permisos**: no existe un permiso específico de "proveedores" en el
catálogo — se reutiliza `ORDEN_COMPRA_CREAR` (crear/editar proveedor,
crear orden) y `COMPRA_REGISTRAR` (recibir). Ambos son nivel BARISTA en la
matriz de `prisma/seed.ts`, así que cualquier barista puede operar Compras,
igual que hoy opera el POS.

Fuera de alcance deliberadamente: cancelar una orden
(`PurchaseOrderStatus.CANCELADA` existe pero no tiene UI), quitar un
`IngredientSupplier` ya creado, `ReorderPoint` (puntos de reorden).

Verificado end-to-end con Playwright contra Postgres real: alta de
proveedor con costo cotizado, creación de orden con costo autocompletado,
recepción con una línea completa (costo real distinto al estimado) y otra
parcial → confirmado en DB `PurchaseOrder.status = PROVEIDA_PARCIALMENTE`,
`IngredientBatch`/`InventoryStock`/`InventoryMovement` correctos,
`IngredientCostHistory` generado solo para la línea con costo distinto. Un
empleado AUXILIAR (sin `ORDEN_COMPRA_CREAR`/`COMPRA_REGISTRAR`) no puede
entrar a `/compras` ni `/compras/proveedores`.

## Módulo Transferencias + Conteos físicos (`/compras/transferencias`, `/compras/conteos`, rama `feature/modulo-transferencias-conteos`)

Cierra Fase 2. Rama creada desde `feature/modulo-compras` (no desde
`main`) para tener `/compras` disponible — el PR de Compras (#3) seguía
sin mergear cuando se construyó esto.

**Transferencias** — máquina de estados `ENVIADO -> EN_TRANSITO ->
RECIBIDO` (o `CANCELADO`, solo permitido desde `ENVIADO`). Tal como lo
documenta el comentario del schema, el inventario **sale de origen al
pasar a `EN_TRANSITO`** (no al crear el manifiesto, `createTransferManifest`
solo registra intención) **y se suma a destino solo al pasar a
`RECIBIDO`**. `markTransferInTransit` valida stock suficiente en origen
(throw si no alcanza) y registra `InventoryMovement` tipo
`TRANSFERENCIA_SALIDA`; `receiveTransfer` es de una sola vez (no
incremental, mismo criterio que recibir una orden de compra) y si
`receivedQuantity < quantity` genera **además** un `InventoryMovement` tipo
`MERMA` en destino por la diferencia — exactamente como lo describe el
comentario de `TransferLine` en el schema. No hay doble confirmación por
PIN aquí: a diferencia de Caja o de aprobar un conteo, una transferencia ya
es un flujo de dos actores por naturaleza (quien envía, quien recibe en
otro momento/lugar).

**Conteos físicos** — con doble confirmación, igual que Caja.
`createPhysicalCount` captura todo en una sola sesión (sin estado `ABIERTO`
resumible — mismo criterio que recibir una orden de compra): congela
`theoreticalQty` del `InventoryStock` actual de `DEFAULT_STOCK_LOCATION_ID`
por ingrediente y guarda `physicalQty` capturado, sin tocar inventario
todavía. `approvePhysicalCount` exige el PIN de un **empleado distinto** de
quien hizo el conteo (mismo patrón que `verifyConfirmingEmployee` de
`actions/shift.ts`) con permiso `INVENTARIO_AJUSTAR`; si se aprueba, ajusta
`InventoryStock` al valor físico donde hubo diferencia y registra
`InventoryMovement` tipo `CONTEO_FISICO_AJUSTE`; si se rechaza, no toca
inventario (el conteo se descarta).

**Permisos**: mismo hueco que Compras — no hay un permiso específico en el
catálogo, así que las 6 acciones (crear/marcar en tránsito/recibir/cancelar
transferencia, crear/aprobar conteo) usan `INVENTARIO_AJUSTAR`. Es nivel
GERENTE en la matriz (BARISTA no tiene ningún permiso de inventario hoy),
así que este módulo queda para GERENTE/ADMINISTRADOR, igual que
`/inventario`.

Fuera de alcance deliberadamente: cancelar/revertir una transferencia que
ya salió de origen (`EN_TRANSITO`), conteos parciales por ubicación
distinta a la sucursal (`PhysicalCount` no tiene `stockLocationId` propio
en el schema, se asumió que siempre opera contra
`DEFAULT_STOCK_LOCATION_ID`).

Verificado end-to-end con Playwright contra Postgres real: transferencia
sucursal → bodega central con una línea recibida parcialmente (confirmado
en DB stock decrementado en origen, incrementado en destino solo lo
recibido, `InventoryMovement` `TRANSFERENCIA_SALIDA`/`TRANSFERENCIA_ENTRADA`/`MERMA`
correctos), una segunda transferencia cancelada mientras seguía `ENVIADO`,
un conteo físico aprobado (confirmado `InventoryStock` ajustado +
`CONTEO_FISICO_AJUSTE`) y otro rechazado (confirmado que NO tocó
inventario), y que la aprobación de conteo rechaza tanto si el PIN es del
mismo empleado que contó como si es de alguien sin `INVENTARIO_AJUSTAR`.

## Módulo Reportes (`/reportes`, rama `feature/modulo-reportes`)

Fase 3 completa, alcance pedido explícitamente de una sola vez: utilidad,
costo de receta en el tiempo, inventario, estadísticas. Rama creada desde
`main` (ya con Fase 1 y Fase 2 mergeadas).

**Prerrequisito que no existía**: la base no tenía ningún
`Supplier`/`IngredientSupplier` (se habían limpiado los de prueba de
Compras), así que cualquier costo de receta/utilidad hubiera dado `$0`.
`prisma/seed-demo.ts` ahora siembra un proveedor base
(`Proveedor Central`) con costo cotizado para los 6 ingredientes, para que
los reportes tengan números reales desde el primer momento.

**`RecipeCostHistory` nunca se había escrito** — ninguna acción le metía
filas. Ahora `actions/recipes.ts` (`createProductWithRecipe` y
`updateVariantRecipe`) registra un snapshot vía
`lib/recipe-cost.ts` (`recordRecipeCostSnapshot`) cada vez que se crea una
`RecipeVersion` nueva. No hay backfill de las recetas ya sembradas — el
reporte de recetas siempre muestra el costo **actual** calculado en vivo
(`calculateRecipeVersionCost`, recursivo, mismo patrón que
`resolveRecipeConsumption` de `actions/pos.ts` pero para costo en vez de
consumo), y el historial se construye desde ahora conforme se editen
recetas.

**Fix retroactivo en Compras** (ya mergeado): `costUnit` en
`components/compras/supplier-ingredient-costs-editor.tsx` dejaba elegir
libremente la unidad del costo cotizado. Sin ninguna fila en
`UnitConversion` (sigue en cero), eso hubiera roto el cálculo de costo de
receta para cualquier ingrediente cotizado en una unidad distinta a su
`baseUnit`. Se bloqueó a `baseUnit`, igual que ya estaba bloqueado en
`RecipeIngredient`/`PurchaseOrderItem`.

Los 4 reportes (`lib/reports.ts`), todos gateados nivel GERENTE
(`REPORTE_UTILIDAD_VER`/`REPORTE_INVENTARIO_VER`/`ESTADISTICAS_GESTIONAR`
— BARISTA/AUXILIAR no tienen ninguno):
- **Utilidad** (`/reportes/utilidad`): por rango de fechas, ingresos
  (`Sale.total`), costo (COGS: costo de receta de cada `SaleItem` vía
  `calculateRecipeVersionCost` + costo de `SaleItemModifier` que consumen
  ingrediente propio, ej. "Shot extra"), margen $ y %, tabla por producto.
- **Inventario** (`/reportes/inventario`): valor de stock actual
  (cantidad × costo cotizado) + `InventoryMovement` del periodo agrupados
  por tipo.
- **Recetas** (`/reportes/recetas`): costo actual vs. precio por variante
  activa, con el historial de `RecipeCostHistory` de cada una.
- **Estadísticas** (`/reportes/estadisticas`): productos más vendidos,
  ventas por día, ticket promedio, total de transacciones.

Rango de fechas vía `?from=&to=` en la URL
(`components/reportes/date-range-picker.tsx`, cliente, sin estado propio
más allá de reflejar la URL) — default últimos 30 días
(`resolveDateRange` en `lib/reports.ts`).

**Limitación documentada**: el costo de ventas pasadas en el reporte de
utilidad usa el costo **actual** de los ingredientes aplicado a la
composición histórica exacta de la receta (`SaleItem.recipeVersionId` es
un snapshot inmutable) — no el costo que tenían los ingredientes el día
exacto de esa venta. Eso requeriría cruzar `IngredientCostHistory` por
fecha, follow-up documentado.

Fuera de alcance deliberadamente: costo histórico real por fecha, gráficas
(no hay librería de charts en el proyecto, no se agregó una dependencia
nueva solo para esto), recalcular/re-snapshotear recetas automáticamente
cuando cambia el costo de un ingrediente en Compras (solo se snapshotea al
crear/editar la receta misma), `REPORTE_CONSOLIDADO_VER` (es multi-sucursal,
Fase 5).

Verificado end-to-end con Playwright contra Postgres real: venta con
modificador de costo (Shot extra), edición de una receta (confirmado que
se creó `RecipeCostHistory`), y los 4 reportes revisados — utilidad y
estadísticas coinciden entre sí en ingresos/ticket, inventario refleja el
valor de stock correcto, recetas muestra el historial recién creado. Un
BARISTA no puede entrar a `/reportes` ni a ninguna subruta.

## Módulo Clientes (`/clientes`, rama `feature/modulo-clientes`)

Fase 4 completa, alcance pedido de una vez: clientes, lealtad (sellos y
niveles) y descuentos (código + manual). Es la primera fase que modifica
`actions/pos.ts`/`components/pos/checkout-dialog.tsx` — el flujo de venta
ya verificado varias veces esta sesión — así que la regresión (venta
normal sin cliente ni descuento) se verificó explícitamente primero.

**Sellos y nivel sin campo nuevo en el schema**: `LoyaltyCard.stamps` se
incrementa +1 por venta completada con cliente ligado y se reinicia a 0 al
llegar a 5 (comentario del schema: "reinician cada 5"). Para el nivel,
`LoyaltyTier.minLifetimeStamps` necesita un acumulado histórico que el
schema no guarda en ningún campo — se deriva contando `Sale` completadas
de ese cliente dentro de la misma transacción (ya incluye la venta recién
creada), y se busca el `LoyaltyTier` de mayor `minLifetimeStamps` que
aplique. `LoyaltyTier` no tiene UI de gestión — se siembra en
`prisma/seed-demo.ts` (Regular/Frecuente/VIP), mismo criterio que los
roles: decisión de negocio, no algo que se edite seguido. No hay
fulfillment automático de premio al llegar a 5 sellos — es una señal
visual en la pantalla del cliente, el barista decide cómo lo resuelve (ej.
con un descuento manual).

**Descuento de código vs. manual, mutuamente excluyentes por venta**
(`createSale` en `actions/pos.ts` rechaza si llegan ambos). Fórmula por
`DiscountType`: `PORCENTAJE` → `subtotal * value/100`; `MONTO_FIJO` →
`value`; `PRECIO_FINAL` → el total resultante es exactamente `value`. Se
valida que el descuento no exceda el subtotal. Código
(`DESCUENTO_APLICAR_CODIGO`, nivel BARISTA): se resuelve por texto
(`findDiscountCodeByCode` en `actions/discounts.ts` — el cajero teclea el
código, no conoce el id), valida `isActive`/`expiresAt`. Manual
(`DESCUENTO_MANUAL`, nivel GERENTE): a diferencia de Caja/Conteos, **no**
exige que el autorizante sea un empleado distinto del cajero — solo que el
PIN capturado pertenezca a alguien con el permiso (mismo patrón
`findEmployeeByPin` + `requirePermission` que ya usa `actions/shift.ts`).

**Sin action de "preview" nueva**: a diferencia de `previewShiftClose`
(Caja), la fórmula de descuento es aritmética trivial una vez que se
conoce `type`/`value` — `findDiscountCodeByCode` ya resuelve esos dos
datos desde el servidor, así que `checkout-dialog.tsx` calcula el total
mostrado localmente con una copia de 5 líneas de la misma fórmula
(duplicación deliberada de algo trivial, no de la lógica real de negocio
— el servidor sigue siendo la única fuente de verdad en `createSale`, que
recalcula todo independientemente).

Fuera de alcance deliberadamente: fulfillment automático de premio al
llegar a 5 sellos, UI de gestión de `LoyaltyTier`, editar un código de
descuento más allá de activar/desactivar, combinar código + descuento
manual en la misma venta, notificaciones al cliente.

Verificado end-to-end con Playwright contra Postgres real: **regresión
explícita primero** (venta sin cliente ni descuento sigue funcionando
igual), alta de cliente, 5 ventas ligadas a ese cliente (confirmado
`stamps` en 0 tras la quinta y `tier = Regular`), código de descuento
aplicado (confirmado `discountTotal`/`total` correctos en DB), descuento
manual rechazado con PIN de alguien sin `DESCUENTO_MANUAL` y aceptado con
alguien que sí lo tiene (confirmado `ManualDiscount.authorizedById`
correcto), y que un BARISTA no puede entrar a `/clientes/descuentos`.

## Módulo Cambios Punto de Venta (rama `cambios-punto-venta`)

No es una fase del roadmap original — es un rediseño/ajuste del POS pedido
por el usuario vía un PDF con 7 cambios y mockups (`Cambios Nomada.pdf`),
después de cerrar Fase 4. Mezcla rediseño visual puro con cambios reales de
lógica de negocio que sí tocan `actions/pos.ts` (el flujo de venta, ya
verificado varias veces esta sesión), así que se corrió una regresión
explícita (venta normal sin extras/notas/sustitución/temperatura) antes de
dar el trabajo por cerrado. Tres decisiones ambiguas se acotaron con el
usuario antes de planear — ver el plan de la sesión para el detalle
completo de la discusión:

- **Imágenes de producto por URL externa**, no upload real (no hay storage
  configurado). `Product.imageUrl String?` (migración nueva) + input de
  texto en Recetas (`new-product-form.tsx`/`edit-recipe-form.tsx`).
  `CatalogBrowser` muestra la imagen si existe, si no un ícono placeholder.
- **Frío/Caliente sí afecta receta/costo** (decisión explícita del
  usuario, no la opción cosmética que se había recomendado) — no hay UI de
  gestión de `VariantModifierGroup`/`ModifierOption` (sigue seed-only) y
  una receta de verdad distinta (hielo, menos leche) no cabe en un
  modificador de un solo ingrediente. Se modela como **otro eje de
  `ProductVariant`**, sin ningún cambio de schema: convención de nombre
  `"{Tamaño} {Temperatura}"` (ej. "Chico Frío") que `parseVariantName()`
  (`lib/catalog.ts`) detecta por sufijo. Si un producto usa la convención
  (Latte), `ProductDialog` muestra dos filas de selección (Tamaño +
  Temperatura) y resuelve la variante exacta cruzando ambas; si no la usa
  (Capuccino, a propósito dejado sin cambiar), se comporta exactamente
  igual que antes — cero regresión para el catálogo existente. Si la
  combinación elegida no tiene variante real (grid incompleto), `variant`
  resuelve a `null` en vez de caer en una variante arbitraria — el botón
  "Agregar al carrito" se deshabilita y se muestra "Esta combinación no
  está disponible" (`components/pos/product-dialog.tsx`).
- **Precio de extras libres calculado en vivo**, no un campo manual: al
  agregar cualquier ingrediente activo desde "Agregar otro ingrediente" en
  `ProductDialog`, el precio mostrado es solo vista previa — `createSale`
  recibe `{ingredientId, quantity}` (nunca un precio) y calcula
  `priceDelta = quantity × costo cotizado (IngredientSupplier.cost,
  isSelected)` él mismo, para que un precio manipulado desde el cliente no
  pueda llegar a cobrarse. `Ingredient.extraUnitPrice` del schema queda sin
  usar deliberadamente (se habría desincronizado del costo real cotizado
  en Compras).

**Bug real corregido**: sustitución de ingrediente
(`ModifierOption.isSubstitution=true`, ej. "Tipo de leche") antes solo
**sumaba** el sustituto sin restar el ingrediente base de la receta —
descontaba ambos. Se corrigió en `resolveRecipeConsumption`
(`actions/pos.ts`): si algún modificador seleccionado es sustitución, se
omiten las líneas de receta cuyo ingrediente comparte `category` con el
del modificador (para leche, `category = LECHE`) antes de sumar el
consumo del sustituto. Es una heurística por categoría, no un vínculo
explícito línea-por-línea (el schema no lo modela así) — válida hoy porque
ninguna receta tiene más de una línea por categoría sustituible.

Punto 4 (notas): `SaleItem.notes String?` (misma migración que
`imageUrl`), textarea opcional en `ProductDialog`, se muestra en
`CartPanel` y viaja hasta `createSale`.

Punto 7 (búsqueda de cliente): el `<select>` de cliente en
`checkout-dialog.tsx` se reemplazó por un input de texto con lista
filtrada en vivo sobre los clientes ya recibidos como prop (sin query
nueva al servidor — dataset chico).

`prisma/seed-demo.ts` ganó: 3 ingredientes nuevos (Leche deslactosada,
Leche de avena, Hielo, con stock y costo cotizado), dos variantes frías de
Latte ("Chico Frío"/"Grande Frío" con receta real de hielo), y el grupo
"Tipo de leche" (sustitución, +$8/+$12) en todas las variantes con leche
base (Latte y Capuccino, chico y grande).

Verificado end-to-end con Playwright contra Postgres real: venta de Latte
Chico Frío con sustitución a leche de avena + extra libre de esencia de
vainilla + nota → confirmado en DB que se usó `recipe-latte-chico-frio-v1`,
que se descontó **Leche de avena** y no Leche entera, que el
`SaleItemIngredientAdjustment` (`AGREGAR_EXTRA`) quedó con `priceDelta`
calculado desde el costo cotizado (no inventado), y que la nota se guardó
en `SaleItem.notes`. Regresión explícita: venta de Capuccino Chico (sin la
convención de temperatura) sigue funcionando idéntico a antes, sin mostrar
selector de Temperatura. Búsqueda de cliente por texto confirmada
visualmente. Todos los datos de la verificación se limpiaron de la base
(ventas, movimientos de inventario, stock restaurado) al terminar.

Fuera de alcance deliberadamente: UI de gestión de
`VariantModifierGroup`/`ModifierOption` (sigue seed-only), upload real de
imágenes, sustitución por vínculo explícito línea-de-receta↔modificador
(la heurística por categoría basta hoy).

## Reskin visual del POS (rama `pos-reskin-purrcoffee`)

El usuario compartió un mockup de referencia (app "Purr'Coffee") y pidió que
`/pos` se vea similar. Se acotó el alcance con 3 preguntas antes de tocar
código, porque el mockup contradice o agrega cosas respecto a "Cambios
Punto de Venta" (fase anterior):

- **Categorías siguen en menú vertical** (decisión explícita de la fase
  anterior) — solo cambió el estilo visual de los botones, no volvió a
  horizontal.
- **Nueva interacción de tarjeta**: cada tarjeta de `CatalogBrowser` ahora
  resuelve tamaño/temperatura y cantidad inline, con un botón **"Agregar"**
  que va directo al carrito sin abrir ningún diálogo (sin
  modificadores/extras/notas). El diálogo existente (`ProductDialog`) se
  conserva intacto en su lógica, accesible vía un botón **"Personalizar"**
  — sigue siendo el único lugar para elegir tipo de leche, extras libres o
  escribir una nota. La lógica de resolución de variante (antes duplicada
  en el diálogo) se extrajo a `resolveProductVariant()` en `lib/catalog.ts`
  — la usan ambos componentes, así que el fix de la fase anterior (una
  combinación tamaño×temperatura inexistente da `null`, nunca cae en
  `variants[0]`) vive en un solo lugar.
- **Tipo de orden real** (En sucursal / Para llevar / A domicilio): a
  diferencia del resto del reskin, esto sí es una función de negocio
  nueva. `Sale.orderType SaleOrderType` (migración aditiva, default
  `PARA_LLEVAR`) se selecciona con tabs en `CartPanel` y viaja hasta
  `createSale` sin afectar inventario ni costo.
- **Buscador de producto** dentro de la categoría activa (client-side,
  sobre el catálogo ya cargado — sin query nueva al servidor).
- El botón "Filter" del mockup se descartó (no hay ningún atributo de
  producto que filtrar hoy).

**Acento naranja acotado a `components/pos/*`**: se definieron
`posAccentClass`/`posAccentBorderClass` en `lib/utils.ts` y se aplicaron
vía `className` sobre el `Button` compartido — deliberadamente **no** se
tocó la variable global `--primary` de `app/globals.css`, así que el resto
de la app (Compras, Reportes, Administración, el sidebar "Nomada Café")
conserva el tema café/marrón de siempre.

`CartLine`/`AddLineInput` (`cart-store.ts`) ganaron `imageUrl` (miniatura
en el carrito, mismo patrón que las tarjetas del catálogo) y `quantity`
opcional en `addLine` (para que el stepper de la tarjeta pueda agregar más
de 1 de una vez, sumando a una línea existente con la misma firma en vez
de +1 fijo).

Verificado end-to-end con Playwright contra Postgres real: agregar rápido
un Capuccino Chico sin abrir diálogo (confirmado en DB mismo
`recipeVersionId`/consumo que el flujo con diálogo), "Personalizar" en
Latte sigue funcionando idéntico a la fase anterior (Frío + sustitución de
leche + extra + nota, confirmado en DB), y `Sale.orderType` persistido
correctamente al elegir "A domicilio". Captura visual del catálogo
comparada contra el mockup. Datos de prueba limpiados de la base al
terminar (solo la venta y movimientos creados en esta verificación — no se
tocaron ventas de sesiones anteriores).

Fuera de alcance deliberadamente: descripciones de producto en la tarjeta
(no existe `Product.description` en el schema), botón "Filter" del
mockup, foto de perfil del empleado en la barra superior (no hay avatar en
`Employee`).

## Menú real de LAPSO (`prisma/seed-lapso.ts`)

El usuario compartió fotos del menú físico de LAPSO (cafetería real, Ciudad
Guzmán) y pidió sembrar sus ~90 productos para trabajar sobre un catálogo
real en vez del demo (Latte/Capuccino/Mocha de `prisma/seed-demo.ts` y
datos manuales de sesiones anteriores). Se acotó el alcance con 3
preguntas antes de escribir el script, porque construir recetas reales
para ~90 productos sin cantidades de ingredientes reales habría inventado
datos de costo falsos:

- **Costeo real solo con 3 ingredientes dados por el usuario**: Leche
  $30/L, Café $300/kg, Esencia $120/L. `ESPRESSO_SHOT` = 18 g (ya
  documentado en el enum `UnitOfMeasure` del schema) → café sale a
  $5.40/shot. Con eso se construyó una receta aproximada (mismas fórmulas
  por familia de bebida, no una por producto — café+leche para
  Capuccino/Latte, leche+esencia para Chocolates/Chai/Malteada/Smoothie,
  agua+esencia para Soda Italiana) para las categorías que sí tienen base
  de café/leche/esencia. Los productos sin esa base (Té, Tisanas,
  Bocadillos, Postres, Souvenirs, Tarjeta de regalo, Café en grano) se
  sembraron **sin receta** — se venden con su precio real pero no
  descuentan inventario ni tienen costo en Reportes hasta que se defina
  una receta real. Ningún ingrediente/costo se inventó sin base: donde no
  hubo dato, no se modeló receta.
- **El catálogo de demo se "reemplaza" desactivando, no borrando**:
  `Sale.recipeVersionId`/`productVariantId` son `ON DELETE SET NULL`, pero
  `SaleItemModifier.modifierOptionId` es `ON DELETE RESTRICT` — un borrado
  real del catálogo viejo con ventas históricas reales (ya las había, de
  sesiones anteriores) podía fallar por FK o forzar a borrar ventas de
  verdad. En vez de eso, el script hace
  `Product.updateMany({ data: { isActive: false } })` al inicio (afecta a
  **todos** los productos existentes, no solo los de seed-demo) y luego
  crea el menú real con `isActive: true` — reversible, no toca ninguna
  fila de venta. `getCatalog` (`lib/catalog.ts`) ya filtra por
  `isActive`, así que el efecto en el POS es idéntico a haber borrado el
  catálogo viejo.
- **Todo el menú, no solo bebidas**: Bocadillos, Postres (Galletas/
  Pasteles/Pies y Tartas/Macarons, como categorías separadas igual que en
  el menú impreso), Souvenirs, Tarjeta de regalo y Café en grano se
  sembraron como `ProductType.REVENTA_DIRECTA` (ya existía en el schema
  para exactamente este caso: precio único, sin pasar por el modelo de
  receta/inventario por ingrediente).

Decisiones de modelado sin schema nuevo, reusando infraestructura ya
construida en fases anteriores:
- **Sabor sin costo como grupo de modificador obligatorio**: Chai/Dirty
  Chai (Tradicional/Té Verde/Manzana), Malteada (Chocolate/Vainilla/
  Fresa) y Soda Italiana (11 sabores) tienen el mismo precio sin importar
  el sabor elegido, así que se modelaron como **un solo producto** con un
  `VariantModifierGroup` `isRequired: true` (en vez de 6/1/1 productos
  separados) — el sabor no afecta receta/costo, solo es una anotación en
  la venta. Esta es la primera vez que se siembra un grupo `isRequired`,
  lo que expuso un bug real en `ProductCard` (ver abajo).
- **"Extras" del menú (Aderezo, Crema batida, Salsa, Extracción, Vaso de
  leche, Leche de almendras/coco, etc.) vía el mecanismo de extras libres**
  ya construido en "Cambios Punto de Venta" (`SaleItemIngredientAdjustment`
  `AGREGAR_EXTRA`, precio = costo cotizado × cantidad): cada extra del
  menú se sembró como su propio `Ingredient` (`baseUnit: PIEZA`) con
  `IngredientSupplier.cost` fijado **igual al precio de venta del extra**,
  no a un costo mayorista real — simplificación explícita, porque el
  sistema no modela un margen aparte para extras libres (ver comentario
  en `actions/pos.ts`). Al agregar 1 pieza desde "Agregar otro
  ingrediente" en el POS, cobra exactamente el precio del menú.
- **"Tipos de leche" (sin costo adicional) quedó fuera de alcance**: no se
  construyó un `VariantModifierGroup` de sustitución de leche para los
  ~40 productos con leche del menú real — hubiera significado replicar el
  grupo "Tipo de leche" (ya usado para Latte/Capuccino en seed-demo) en
  decenas de variantes, y como en el menú real es gratis (no cambia
  precio ni justifica el esfuerzo de UI todavía), se dejó pendiente.

**Bug real encontrado y corregido durante la verificación**: `ProductCard`
(tarjeta de catálogo, del reskin anterior) nunca validaba si la variante
tenía un grupo de modificador `isRequired` — el botón "Agregar" (que no
tiene UI para elegir modificadores) dejaba agregar Chai/Malteada/Soda
Italiana al carrito **sin sabor elegido**. No se había detectado antes
porque ningún dato sembrado hasta ahora tenía un grupo obligatorio. Se
corrigió: si la variante resuelta tiene algún grupo `isRequired`,
"Agregar" se deshabilita y se muestra "Elige opciones en 'Personalizar'."
— mismo criterio que ya usa `ProductDialog` para su propio botón.

Verificado end-to-end con Playwright contra Postgres real: catálogo
completo visible por categoría (19 categorías, 68 productos activos),
receta de Latte Caliente confirmada en DB (café+leche+vaso escalados por
tamaño), grupo de sabor obligatorio de Chai (bloquea "Agregar" hasta
personalizar, sabor "Manzana" guardado en `SaleItemModifier`), y un
Bagel (REVENTA_DIRECTA) vendido sin generar ningún `InventoryMovement`.
Datos de la verificación limpiados de la base al terminar.

Para correr el seed: `npm run prisma:seed-lapso` (requiere
`npm run prisma:seed` primero; no requiere `prisma:seed-demo`, ambos son
compatibles entre sí si se corren en cualquier orden — comparten los
mismos IDs de ingrediente base).

Fuera de alcance deliberadamente: receta real para Té/Tisanas/Bocadillos/
Postres (no hay costo de insumo dado), ingredientes de sabor distintos por
variante (se usa una sola "Esencia de sabor" genérica para todos los
sabores) — la sustitución de tipo de leche sí se agregó después, ver
siguiente sección.

## Mejoras avanzadas de POS (rama `pos-mejoras-avanzadas`)

El usuario compartió un PDF con 13 cambios sobre capturas reales del
sistema (no un mockup externo) tras probar el menú de LAPSO. Se acotaron 4
decisiones antes de planear: diseñar ahora el árbol completo de
subcategorías (no solo la capacidad), usar costos estimados para las
leches alternativas (no había precio real dado), asumir un lector físico
tipo teclado para el código de tarjeta de lealtad (no cámara), y revertir
la tarjeta de catálogo a imagen+nombre+precio simple (clic abre el
diálogo) en vez del "agregar rápido" del Reskin anterior.

**Schema** (migración `pos_mejoras_avanzadas`, aditiva): `ProductCategory`
gana auto-relación `parentId`/`parent`/`children` (árbol de 2 niveles);
`Sale.tableNumber`; `Customer.address`; `LoyaltyCard.code`
(`@unique @default(cuid())` — solo las tarjetas nuevas lo tienen, las
existentes quedan en `null`, sin backfill); `SalePayment.note`.

**Árbol de categorías**: las 19 categorías del menú de LAPSO se
reorganizaron bajo 7 categorías padre (Café y Espresso, Chocolates y Tés,
Bebidas Frías, Bocadillos —dividido en Bagels/Otros Bocadillos—, Postres,
Souvenirs y Tarjetas, más "Café en grano" que se queda sin hijas).
`components/pos/catalog-browser.tsx` renderiza un acordeón de 2 niveles;
`lib/catalog.ts` (`getCatalog`) manda `parentId`/`parentName`
denormalizado por categoría.

**Búsqueda global**: con texto en el buscador, el grid ignora la
categoría activa y filtra sobre todo el catálogo (aplanado); sin texto,
vuelve al filtrado por categoría/subcategoría de siempre.

**Frío/Caliente como opción real** (no productos duplicados): se
consolidaron Americano/Americano Frío, Latte Caliente/Frío, Chocolate
Frío/Tradicional y Tisana Caliente/Fría en un solo producto cada uno,
usando el eje de variante `"{Tamaño} {Temperatura}"` ya construido en
"Cambios Punto de Venta". **Té** vivía como grupo de modificador
"Temperatura" sin costo — un bug real, porque el menú real cobra distinto
por Frío ($39/43/47) que por Caliente ($37/41/45) y el modificador no
podía representarlo; se reconstruyó con el mismo eje de variante,
corrigiendo el precio. Chai/Dirty Chai necesitaban un 3er estado
("Frappé") — se extendió `VariantTemperature` en `lib/catalog.ts` a
`"CALIENTE" | "FRIO" | "FRAPPE"` (solo lógica de aplicación, no hay enum
de DB de por medio). Al reemplazar el conjunto de variantes de un
producto que ya existía (Té, Americano), `seedProduct()` en
`prisma/seed-lapso.ts` ahora desactiva las variantes viejas que ya no
están en la receta actual — si no, hubieran quedado dos veces en el POS
(bug real encontrado y corregido durante la verificación).

**Tipo de leche con costo real**: se agregaron 4 ingredientes (Light,
Deslactosada, Deslactosada Light, Soya) con costo **estimado** por litro
(documentado en `prisma/seed-lapso.ts`, ajustable en
`/compras/proveedores`). Los 18 productos con leche en su receta ganaron
un grupo "Tipo de leche" por variante (Entera sin costo + las 4
alternativas como sustitución real con `priceDelta` = diferencia de costo
× la misma cantidad de ml que ya usa esa variante).

**Extras del diálogo**: el selector de "Agregar otro ingrediente" pasó de
`<select>` a un input de búsqueda con lista filtrada (mismo patrón que la
búsqueda de cliente), y ahora muestra la unidad del ingrediente
seleccionado junto al campo de cantidad.

**Carrito y checkout**: la pestaña `CONSUMO_LOCAL` ahora dice "Mesa" (el
valor del enum no cambió) y al seleccionarla aparece un campo de número de
mesa (`cart-store.ts` → `tableNumber`). El buscador de cliente en
`checkout-dialog.tsx` ahora también compara contra `LoyaltyCard.code`, y
cuando no encuentra resultados ofrece "+ Crear cliente nuevo" inline
(reusa `createCustomer`, ya en el permiso base de BARISTA vía
`CLIENTE_CONFIGURAR`) — con domicilio si `orderType = DOMICILIO`. Con
domicilio y cliente seleccionado se muestra el teléfono (solo lectura) y
el domicilio (editable, se guarda de vuelta al cliente con
`updateCustomer` si cambió). Pago por transferencia gana un campo de nota
opcional (banco/referencia).

Verificado end-to-end con Playwright contra Postgres real: nav de 2
niveles (expandir "Café y Espresso" → Latte), búsqueda global trayendo
resultados de otra categoría, Latte Frío + tipo de leche Deslactosada con
`priceDelta` recalculado para la nueva cantidad de ml del tamaño/temperatura
elegidos, Cortado (Sencillo/Doble, sin eje de temperatura) también con
tipo de leche, Mesa con número capturado, cliente nuevo creado inline
durante una venta A domicilio con domicilio guardado en `Customer.address`,
búsqueda de cliente por código de tarjeta de lealtad, y pago por
transferencia con nota — todo confirmado en DB. Datos de prueba (incluido
el cliente de prueba) limpiados de la base al terminar; no se tocaron las
ventas reales que el usuario ya había hecho probando el sistema antes de
dar este feedback.

Fuera de alcance deliberadamente: escaneo de QR por cámara (se asume
lector físico tipo teclado), backfill de `code` en tarjetas de lealtad ya
existentes, UI de administración para reorganizar categorías/subcategorías
manualmente (el árbol se siembra fijo en `seed-lapso.ts`), pagos divididos
con nota individual por pago.

## Módulo Productos (antes Recetas, rama `modulo-productos`)

El usuario compartió un PDF con 9 cambios para la pantalla de Recetas,
pidiendo explícitamente reencuadrarla como una pantalla de **Productos**
general (para dar de alta merch/souvenirs/tarjetas de regalo desde ahí,
no solo bebidas con receta) y exponer en la UI varias capacidades que
antes solo existían sembradas a mano en `prisma/seed-lapso.ts`. Se
acotaron 4 decisiones antes de planear: renombrar a "Productos" en
URL/nav/componentes, mover la temperatura de un truco de parseo de
nombre a una columna real de la base de datos, resolver el vaso a
descontar automáticamente por tamaño (oz) en vez de una línea de receta
manual, y construir los 9 puntos en una sola pasada.

**`app/recetas/**` → `app/productos/**`**, **`components/recetas/**` →
`components/productos/**`**, nav (`components/layout/sidebar.tsx`)
renombrada. La ruta de editar variante quedó en
`app/productos/variantes/[variantId]/` (no `app/productos/[variantId]/`)
porque Next.js no permite dos segmentos dinámicos con nombre distinto
(`[variantId]` vs `[productId]`) como hermanos al mismo nivel — el nuevo
`app/productos/[productId]/variantes/nueva/` obligó a anidar el primero
bajo un segmento estático.

**Temperatura como campo real**: se reemplazó `parseVariantName()` (un
parser de sufijo en `ProductVariant.name`, construido en "Mejoras
avanzadas de POS") por una columna real `ProductVariant.temperature
VariantTemperature?` (nuevo enum de Prisma `CALIENTE|FRIO|FRAPPE`).
Migración 100% compatible con el POS ya construido: `sizeLabel` ya era
efectivamente `variant.name` en todos los casos, así que
`resolveProductVariant`/`ProductDialog` no cambiaron ni de firma ni de
comportamiento — solo cambió de dónde sale el valor.

**Vaso automático por tamaño** (antes: línea de receta manual en cada
receta): `ProductVariant.sizeOz Decimal?` + `Ingredient.cupCapacityOz
Decimal?`. En `createSale` (`actions/pos.ts`), antes del loop de items se
cargan los ingredientes-vaso activos ordenados por capacidad ascendente;
por cada item con `variant.sizeOz`, se busca el vaso más chico cuya
`cupCapacityOz >= sizeOz` y se descuenta 1 por unidad vendida. Si no hay
ningún vaso con capacidad suficiente, la venta falla con un error
explícito (nunca vende sin saber qué vaso descontar). `prisma/seed-lapso.ts`
se reescribió para registrar 4 vasos (3oz/8oz/12oz/16oz, costo estimado)
y quitar la línea de vaso manual de todas las recetas.

**Merch/souvenirs/tarjetas desde la misma pantalla**: `Product.type`
(`RECETA`/`REVENTA_DIRECTA`) ahora se elige en "Nuevo producto"; con
`REVENTA_DIRECTA` cada variante pide `size`/`color`/`note` (3 campos
opcionales, sin receta) en vez de líneas de receta. Nueva acción
`addVariantToProduct` (+ pantalla `/productos/[productId]/variantes/nueva`)
permite agregar una variante a un producto ya existente sin recrearlo.

**Secciones "Tipo de leche" y "Extras"** expuestas por primera vez en la
UI (antes solo las creaba `seed-lapso.ts` a mano): nuevo componente
`components/productos/modifier-options-editor.tsx` (filas
ingrediente+cantidad+precio) usado dos veces por `VariantFields`. Al
guardar, `actions/recipes.ts` (`applyModifierGroups`) crea/actualiza
`VariantModifierGroup`+`ModifierOption` — "Tipo de leche" con
`allowMultiple:false` y una opción "base" auto-generada (detecta la línea
LECHE de la receta recién guardada, sin que el admin la capture a mano);
"Extras" con `allowMultiple:true`, todas las filas como adiciones puras.
**Nunca borra** opciones existentes (upsert por id determinístico
`${groupId}-base` / `${groupId}-${ingredientId}`) — `ModifierOption` no
tiene borrado suave y `SaleItemModifier.modifierOptionId` es
`ON DELETE RESTRICT`; quitar una fila del formulario no la borra de la
base, queda huérfana hasta limpiarla a mano en Prisma Studio.

**Bug real encontrado y corregido durante la verificación** (el más
importante de esta fase): el esquema de ids con el que `seed-lapso.ts`
ya venía creando `ModifierOption` para "Tipo de leche" (base = `${groupId}-entera`,
alternativas = `${groupId}-${slug(nombreCorto)}`, ej. `-deslactosada`,
`-soya`) **no coincidía** con el esquema que usa la acción nueva
(`${groupId}-base` / `${groupId}-${ingredientId}`). Como el upsert
resuelve por id, la primera vez que alguien editara y guardara una
variante ya sembrada (ej. Chocolate, Latte, Chai — prácticamente todo el
menú activo), en vez de actualizar las opciones existentes creaba
**opciones duplicadas** (ej. "Soya" del seed + "Leche Soya" de la UI,
ambas seleccionables por separado en el POS). Se corrigió: (1)
`prisma/seed-lapso.ts` ahora usa el mismo esquema de ids que
`actions/recipes.ts` (`${groupId}-base` / `${groupId}-${milk.id}`); (2)
migración de datos en caliente (SQL, dentro de una transacción) que
renombró las **322 filas** de `ModifierOption` ya existentes al nuevo
esquema — seguro porque `sale_item_modifiers_modifierOptionId_fkey` tiene
`ON UPDATE CASCADE` (confirmado antes de correrla: las 3 referencias
reales de ventas ya hechas se actualizaron solas al nuevo id, sin perder
la relación). Verificado que re-sembrar (`npm run prisma:seed-lapso`) ya
no vuelve a duplicar nada.

**Otro efecto secundario confirmado (no introducido en esta fase, ya
existía)**: `seed-lapso.ts` empieza con `Product.updateMany({ isActive:
false })` — desactiva **todos** los productos, incluidos los creados a
mano desde `/productos` (ej. el producto de prueba "Playera LAPSO"
quedó inactivo tras re-sembrar durante esta verificación, hubo que
reactivarlo). Si el negocio empieza a dar de alta merch real desde esta
pantalla, correr `prisma:seed-lapso` después los va a desactivar —
documentado aquí para que no sorprenda.

Verificado end-to-end con Playwright contra Postgres real: `/productos`
agrupado por categoría padre; alta de "Playera LAPSO" (REVENTA_DIRECTA)
con talla/color/nota; "+ Agregar variante" en un producto existente
(Mocha) con checkbox de temperatura, tamaño en oz, una línea de receta,
una alternativa de leche y un extra — confirmado en DB que se crearon
`VariantModifierGroup`/`ModifierOption` correctos (incluida la opción
base auto-generada); edición de una variante ya sembrada (Chocolate
Grande Caliente) agregando una opción nueva a Extras, confirmando que
actualiza en el lugar correcto tras la corrección del esquema de ids;
venta completa en `/pos` de Chocolate Grande Caliente con sustitución a
leche de Soya y extra de esencia de vainilla — confirmado en
`inventory_movements` que se descontó el vaso de 16oz correcto (por
`sizeOz`), la leche de soya (no la leche entera de la receta base) y el
extra, y que el total cobrado incluyó ambos `priceDelta`. Venta e
inventario de prueba limpiados; el producto "Playera LAPSO", la variante
"Grande" agregada a Mocha y la opción "Esencia de vainilla" agregada a
Extras de Chocolate se dejaron tal cual por decisión explícita del
usuario (no son datos de prueba descartables, son ejemplo funcional de
las nuevas capacidades).

Fuera de alcance deliberadamente: borrar `ModifierOption`/
`VariantModifierGroup` desde la UI (ver nota de arriba sobre por qué),
campo `cupCapacityOz` en el diálogo "+ Nuevo ingrediente" (se sigue
registrando vía seed o Prisma Studio), costo real de los vasos por
tamaño (estimado, igual que las leches alternativas), combos
multi-producto.

## Productos + POS 2 (rama `productos-pos-mejoras-2`)

Segunda tanda de cambios sobre `/productos` (recién cerrado arriba) y
`/pos`, pedidos en la misma conversación: navegación tipo tarjetas con
categoría→subcategoría→contenido en ambas pantallas (antes acordeón en
la barra lateral), costo de receta en vivo + precio sugerido
configurable, íconos de categoría, y — el cambio más grande — cuentas
abiertas de Mesa. Se acotaron con el usuario: patrón de navegación
**unificado** entre `/pos` y `/productos` (mismo componente
compartido), cuentas abiertas **incluidas ahora** (no pospuestas pese a
ser lo más grande), medidas estándar de captura (pump/splash)
**estimadas** (mismo criterio que costos de leche/vasos en fases
anteriores), e íconos de categoría con **selector real** en vez de
mapeo automático por palabra clave (primera UI para editar categorías
ya existentes).

**Navegación compartida** — nuevo `components/catalog/category-drilldown.tsx`:
categorías de nivel 1 como píldoras con ícono en una barra angosta;
clic en una con subcategorías muestra tarjetas de subcategoría en el
área principal (clic en una sin hijas salta directo al contenido); un
botón "← Atrás" regresa un nivel. `components/pos/catalog-browser.tsx`
se reescribió sobre este componente (el buscador global existente no
cambió de comportamiento). `ProductCategory.icon` (nombre de ícono
Lucide, validado contra una lista curada en
`components/productos/category-icon-picker.tsx`) se elige al crear una
categoría nueva (dentro de "Nuevo producto") o al editar una ya
existente (lápiz en la píldora, solo dentro de `/productos` — nueva
acción `updateProductCategory`).

**`/productos` como vista única** (ya lo era desde el "Módulo
Productos" anterior): se cambió el acordeón lateral original por
`CategoryDrilldown`; al abrir un producto, el panel izquierdo pasa a
sus variantes (`VariantNav`, sin cambios de diseño) y el detalle de la
variante se sigue cargando on-demand vía `fetchVariantRecipeDetail`.
**Bug real encontrado durante el build** (no en verificación, se vio
antes de probarlo): la primera versión anidó `CategoryDrilldown`
completo dentro de la columna angosta de 192px reservada para
`VariantNav`, aplastando su propio grid de tarjetas — se corrigió
haciendo que el layout sea condicional por `mainView` (`CategoryDrilldown`
ocupa el ancho completo mientras se navega; el split
`VariantNav` + panel solo aparece con un producto abierto).

**Costo de receta en vivo + precio sugerido**: `getIngredientPickerOptions()`
(`lib/recipes.ts`) ahora incluye el costo cotizado actual
(`IngredientSupplier.isSelected`) por ingrediente y el costo calculado
de cada receta compuesta (`calculateRecipeVersionCost`, una sola
`$transaction` para todas). `components/productos/recipe-cost.ts`
calcula el costo de las líneas en el cliente con el mismo criterio (sin
conversión de unidad — limitación heredada). `VariantFields` muestra
"Costo de ingredientes" + "Precio sugerido (food cost N%)" con un botón
"Usar precio sugerido" que llena el campo de precio sin guardar solo
— el precio lo sigue poniendo la persona. El % objetivo
(`Branch.targetFoodCostPercent`, default 30) es ajustable desde una
nueva card "Configuración" en `/administracion`, gated por el permiso
`CONFIGURACION_SISTEMA_GESTIONAR` (ya declarado en el schema desde
hace varias fases, exclusivo de ADMINISTRADOR, sin ningún uso real
hasta ahora).

**Defaults y medidas estándar en el POS**: la opción "Entera" del grupo
"Tipo de leche" ahora viene preseleccionada al abrir un producto con
leche (se identifica por nombre de grupo + `isSubstitution:false`, no
solo por la bandera — "Extras" también usa `isSubstitution:false` en
todas sus opciones y no debía auto-seleccionarse). Nuevo
`Ingredient.standardDoseQuantity`/`standardDoseUnit` (ej. "1 PUMP" para
esencia de vainilla, factor de conversión `PUMP→ML` ≈ 5, estimado) —
"Agregar otro ingrediente" en el POS y los editores de receta/modificador
en `/productos` ahora capturan en esa unidad en vez de mililitros
crudos. Esto exigió que `actions/pos.ts` empezara a convertir la
cantidad de los extras libres a `baseUnit` antes de costear/descontar
inventario (`toBaseUnit()`) — antes asumía por convención que ya venía
en `baseUnit`, lo cual dejaba de ser cierto en cuanto se introdujo una
unidad de captura distinta; verificado en DB que 1 PUMP capturado
descontó 5ML reales y cobró el costo de 5ML, no de 1.

**2 bugs de stepper corregidos** (`step="0.01"` fijo donde debía ser
`"1"` para unidades discretas — nuevo helper `unitStep()` en
`lib/utils.ts`): cantidad de "Agregar otro ingrediente" en el POS, y
valor de descuento manual cuando el tipo es porcentaje.

**"A domicilio" exige cliente**: `checkout-dialog.tsx` bloquea "Confirmar
venta" si `orderType === "DOMICILIO"` sin cliente seleccionado (la
creación de cliente inline ya era general para cualquier tipo de orden,
confirmado en el código — no hizo falta tocarla). Nuevo checkbox
"¿Cómo llegó el pedido?" (Teléfono del negocio / App de delivery) —
`Sale.domicilioOrigen`, enum `DomicilioOrigen`.

**Cuentas abiertas de Mesa** (el cambio más grande): `SaleStatus` gana
`ABIERTA` — una cuenta puede quedar abierta con inventario ya
descontado de lo agregado (la bebida se prepara al pedirse, no hasta
que se cobra), mientras el cajero atiende otras cuentas. Refactor de
`actions/pos.ts`: se extrajo de `createSale` la resolución de items
(`resolveSaleItems`, variante/modificadores/sustitución/extras/vaso
automático/cálculo de consumo) y la aplicación de consumo de inventario
(`applyConsumption`) a funciones reusables — `createSale` ahora se
compone de ellas sin cambiar de comportamiento. Nuevas acciones:
`openTab` (crea la cuenta, `status:"ABIERTA"`, sin pago, con la primera
ronda de productos), `addItemsToTab` (agrega una ronda más, incrementa
`subtotal`/`total` acumulados), `closeTab` (opcionalmente agrega una
última ronda en la misma transacción, aplica el descuento sobre el
subtotal acumulado **completo**, valida pagos, pasa a `COMPLETADA`),
`listOpenTabs`/`getTabDetail` para la UI. `cart-store.ts` gana
`activeTabId` (qué cuenta se está alimentando; `null` = venta normal,
sin cambios). `CartPanel` gana el botón "Dejar cuenta abierta"/"Agregar
a la cuenta"; nuevo `OpenTabsDialog` ("Cuentas abiertas" en el header
del POS) lista las cuentas y permite retomarlas. `actions/shift.ts`
(`closeShift`) gana una guarda: no se puede cerrar un turno con cuentas
`ABIERTA` sin cobrar.

Verificado end-to-end con Playwright contra Postgres real: drilldown de
categoría→subcategoría con tarjetas y "← Atrás" en `/pos` y en
`/productos`; ícono elegido al crear una categoría nueva; costo/precio
sugerido en vivo al editar una receta ($6.36 de costo → $21.20 sugerido
a 30% food cost, verificado a mano), "Usar precio sugerido" llenando el
campo sin guardar; "Entera" preseleccionada al abrir un producto con
leche; extra de vainilla pidiendo "pump" en vez de mililitros, con
stepper subiendo de 1 en 1, y en DB: 1 pump capturado → 5ML
descontados y cobrados (no 1ML); domicilio sin cliente bloqueado, con
mensaje claro; cuenta de Mesa abierta con un producto → cuenta aparece
en "Cuentas abiertas" con su total → retomada → segunda ronda agregada
→ cobrada — confirmado en DB una sola `Sale` `COMPLETADA` con el total
acumulado de ambas rondas, 2 `SaleItem`, e inventario descontado en dos
momentos distintos (por ronda), no todo junto al final. Datos de prueba
limpiados; no se tocaron ventas ni cuentas reales.

Fuera de alcance deliberadamente: cancelar una cuenta abierta (existe
`VENTA_CANCELAR` para ventas completadas, no se extendió a `ABIERTA`),
transferir items entre cuentas/mesas, dividir el pago de una cuenta
abierta entre varios métodos (el cierre sí soporta pagos múltiples,
igual que antes), conversión de unidad real en el costo de receta
(limitación heredada de `calculateRecipeVersionCost`), % de food cost
por categoría de producto (un solo valor global por sucursal), editar
categorías de "nivel 1 agrupador" (solo categorías planas por ahora —
ver `EditCategoryDialog`/`onEditCategory` en `category-drilldown.tsx`).

## Próximos pasos recomendados (en orden)

Fases 1, 2, 3 y 4 están cerradas, más los ajustes "Cambios Punto de Venta",
"Reskin visual del POS", el menú real de LAPSO, "Mejoras avanzadas de
POS", el "Módulo Productos" y "Productos + POS 2". Lo que sigue:

1. **Fase 5 (Multi-sucursal)** — la única fase que queda del roadmap
   original. Quitar el `DEFAULT_BRANCH_ID` fijo, UI de selección/gestión
   de sucursales, reportes consolidados (`REPORTE_CONSOLIDADO_VER`). Es
   más arquitectónica que las anteriores — toca código de todos los
   módulos ya construidos en vez de agregar uno nuevo.
2. Resolver las simplificaciones documentadas en
   `docs/pos-module.md` (impuestos, pagos divididos en la UI, cancelación
   de venta) según prioridad de negocio.
3. **Recetas reales para Té/Tisanas/Bocadillos/Postres/Smoothie** del menú
   de LAPSO — hoy se venden sin descuento de inventario porque no había
   costo de insumo real para dársela. En cuanto el negocio dé el costo de
   té/hierbas/harinas/etc., completar `prisma/seed-lapso.ts` (o editar
   directo desde `/recetas`) con recetas reales.
4. **Costo real de las leches alternativas** (Light/Deslactosada/
   Deslactosada Light/Soya) — hoy son estimaciones (ver
   `prisma/seed-lapso.ts`), ajustar en `/compras/proveedores` en cuanto se
   tenga el precio real por litro de cada una.
5. Simplificaciones deliberadas de Administración/Recetas/Compras/
   Transferencias/Reportes/Clientes/Cambios Punto de Venta/Reskin del
   POS/Menú de LAPSO/Mejoras avanzadas de POS/Módulo Productos
   documentadas arriba (`EmployeePermissionOverride`, ingredientes
   compuestos nuevos, alertas de caducidad, cancelar orden,
   `ReorderPoint`, ordenar en `purchaseUnit` real, revertir una
   transferencia en tránsito, costo histórico por fecha, gráficas,
   fulfillment de premio de lealtad, gestión de niveles, borrar
   `ModifierOption`/`VariantModifierGroup` desde la UI, upload real de
   imágenes, descripciones de producto, avatar de empleado, escaneo de QR
   por cámara, UI de admin para categorías/subcategorías, costo real de
   los vasos por tamaño) — atender si el negocio los necesita.
6. Si se decide adoptar Supabase Auth más adelante: reemplazar
   `lib/password.ts`/`lib/session.ts` por la integración real, el modelo de
   datos ya está listo para ese cambio sin migraciones.
7. Mergear los PRs pendientes (`pos-reskin-purrcoffee`/menú de LAPSO,
   `pos-mejoras-avanzadas`, `modulo-productos`, `productos-pos-mejoras-2`)
   a `main` si no se han mergeado ya.
8. Cancelar una cuenta de Mesa abierta (hoy solo se puede cobrar o dejarla
   abierta indefinidamente — no hay forma de cancelarla si el cliente se
   va sin pagar), y decidir si vale la pena permitir transferir items
   entre cuentas/mesas (fuera de alcance de "Productos + POS 2").

## Convenciones a mantener

- Toda mutación que toque inventario o dinero va en una transacción de
  Prisma (`prisma.$transaction`), como en `actions/pos.ts`.
- Los Server Actions que devuelven datos a un client component deben
  devolver objetos planos, no registros de Prisma directos (ver el bug de
  arriba).
- La sucursal sigue siendo fija (`DEFAULT_BRANCH_ID`) hasta que se aborde
  Fase 5 explícitamente — no empezar a parchear multi-sucursal a medias en
  otros módulos.
- Nuevos componentes de UI van en `components/ui/` siguiendo el mismo
  patrón sin Radix, a menos que la funcionalidad ya lo justifique (ese es
  el momento de adoptar Radix real, no antes).
- Toda Server Action que mute algo sensible (dinero, inventario, recetas,
  empleados) debe llamar `requirePermission` (`lib/permissions.ts`) con el
  permiso que le corresponda de la matriz en `prisma/seed.ts`, y validar que
  el `employeeId` que recibe del cliente coincide con
  `getSessionEmployeeId()` — no confiar en un `employeeId` de parámetro sin
  verificar. Ver `actions/inventory.ts`/`actions/recipes.ts`/`actions/pos.ts`
  para el patrón exacto. Para acciones de Administración (que no reciben
  `employeeId` del cliente en absoluto) usar `requirePasswordSession()` en
  vez de `getSessionEmployeeId()`, ver `actions/employees.ts`.
- Un `useState` inicial en un client component nunca debe usar un valor no
  determinista (`crypto.randomUUID()`, `Date.now()`, `Math.random()`) — ese
  inicializador corre tanto en SSR como al hidratar y un valor distinto en
  cada corrida rompe la hidratación (bug real encontrado en Recetas, ver
  arriba). Usar un valor fijo o derivado de datos reales para el estado
  inicial; los valores aleatorios son seguros solo en código que corre
  exclusivamente en el cliente (ej. un handler de "agregar fila").
