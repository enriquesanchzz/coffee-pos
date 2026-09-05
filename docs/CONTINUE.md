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
| UI de **Recetas** (alta de producto+receta, edición versionada) | ✅ Construido (`/recetas`). |
| **Administración** (auth real, gestión de empleados/roles, permisos reales) | ✅ Construido (`/administracion`). Ver sección dedicada abajo. |
| Módulo **Compras** — Proveedores + Órdenes de compra (Fase 2) | ✅ Construido y mergeado a `main` (PR #3). |
| **Transferencias + Conteos físicos** (resto de Fase 2) | ✅ Construido y mergeado a `main` (PR #4, `/compras/transferencias`, `/compras/conteos`). |
| Módulo **Reportes** (Fase 3) | ✅ Construido y mergeado a `main` (PR #5, `/reportes`). |
| **Clientes + Lealtad + Descuentos** (Fase 4) | ✅ Construido (`/clientes`, rama `feature/modulo-clientes`). Ver sección dedicada abajo. |
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

## Próximos pasos recomendados (en orden)

Fases 1, 2, 3 y 4 están cerradas. Lo que sigue:

1. **Fase 5 (Multi-sucursal)** — la única fase que queda del roadmap
   original. Quitar el `DEFAULT_BRANCH_ID` fijo, UI de selección/gestión
   de sucursales, reportes consolidados (`REPORTE_CONSOLIDADO_VER`). Es
   más arquitectónica que las anteriores — toca código de todos los
   módulos ya construidos en vez de agregar uno nuevo.
2. Resolver las simplificaciones documentadas en
   `docs/pos-module.md` (impuestos, sustituciones de ingrediente, pagos
   divididos en la UI, cancelación de venta) según prioridad de negocio.
3. Simplificaciones deliberadas de Administración/Recetas/Compras/
   Transferencias/Reportes/Clientes documentadas arriba
   (`EmployeePermissionOverride`, ingredientes compuestos nuevos, alertas
   de caducidad, cancelar orden, `ReorderPoint`, ordenar en `purchaseUnit`
   real, revertir una transferencia en tránsito, costo histórico por
   fecha, gráficas, fulfillment de premio de lealtad, gestión de niveles)
   — atender si el negocio los necesita.
4. Si se decide adoptar Supabase Auth más adelante: reemplazar
   `lib/password.ts`/`lib/session.ts` por la integración real, el modelo de
   datos ya está listo para ese cambio sin migraciones.
5. Mergear el PR pendiente de `feature/modulo-clientes` a `main`.

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
