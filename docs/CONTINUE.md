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
| Módulo **Compras** — Proveedores + Órdenes de compra (Fase 2) | ✅ Construido (`/compras`, rama `feature/modulo-compras`). Transferencias y conteos físicos pendientes — ver sección dedicada abajo. |
| Módulo **Reportes** (Fase 3) | ⚪ No construido. |
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
entre sucursales (`TransferManifest`) y conteos físicos (`PhysicalCount`)
quedan pendientes — los modelos ya existen en el schema, sin tocar.

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
`IngredientSupplier` ya creado, `ReorderPoint` (puntos de reorden),
transferencias, conteos físicos.

Verificado end-to-end con Playwright contra Postgres real: alta de
proveedor con costo cotizado, creación de orden con costo autocompletado,
recepción con una línea completa (costo real distinto al estimado) y otra
parcial → confirmado en DB `PurchaseOrder.status = PROVEIDA_PARCIALMENTE`,
`IngredientBatch`/`InventoryStock`/`InventoryMovement` correctos,
`IngredientCostHistory` generado solo para la línea con costo distinto. Un
empleado AUXILIAR (sin `ORDEN_COMPRA_CREAR`/`COMPRA_REGISTRAR`) no puede
entrar a `/compras` ni `/compras/proveedores`.

## Próximos pasos recomendados (en orden)

1. Dentro de Fase 2: **transferencias entre sucursales/bodega**
   (`TransferManifest`/`TransferLine`) y **conteos físicos**
   (`PhysicalCount`/`PhysicalCountLine`) — mismo patrón que Compras
   (transacciones, `requirePermission`, verificación end-to-end).
2. Resolver las simplificaciones documentadas en
   `docs/pos-module.md` (impuestos, sustituciones de ingrediente, pagos
   divididos en la UI, cancelación de venta) según prioridad de negocio.
3. Simplificaciones deliberadas de Administración/Recetas/Compras
   documentadas arriba (`EmployeePermissionOverride`, ingredientes
   compuestos nuevos, alertas de caducidad, cancelar orden, `ReorderPoint`,
   ordenar en `purchaseUnit` real) — atender si el negocio los necesita.
4. Si se decide adoptar Supabase Auth más adelante: reemplazar
   `lib/password.ts`/`lib/session.ts` por la integración real, el modelo de
   datos ya está listo para ese cambio sin migraciones.

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
