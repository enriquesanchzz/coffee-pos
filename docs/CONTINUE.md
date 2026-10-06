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
| **Tarjeta de lealtad pública + cupón de bienvenida** (`/lealtad/[code]`, QR, cupón de 10% de un solo uso, link de WhatsApp) | ✅ Construido (rama `tarjeta-lealtad-publica`). Envío real por WhatsApp API y pases nativos de Apple/Google Wallet **no** incluidos — requieren cuentas de terceros que el negocio no tiene. Ver sección dedicada abajo. |
| Multi-sucursal en UI (Fase 5) | ⚪ No construido. `DEFAULT_BRANCH_ID` fijo en `lib/constants.ts`. |

## Auditoría QA/UX/A11y y plan de acción (octubre 2026, fases 0–6)

Segunda ronda: auditoría senior (tickets QA-001..030, A11Y-01..09, mejoras D/E)
y su plan de acción, implementados en la rama `claude/cool-maxwell-gud92q`.

**Decisiones de negocio tomadas (D1–D6):**

- **D1 Stock insuficiente**: se advierte y solo se vende con confirmación
  explícita ("Vender de todos modos"); el inventario puede quedar negativo y
  se marca en Inventario/Dashboard (`findShortages`/`allowShortage` en
  `actions/pos.ts`, `lib/stock.ts`).
- **D2 Celular soportado para cobrar**: en `< md` la cuenta es una hoja
  inferior con barra fija "Ver cuenta" y "Confirmar venta" fijo al fondo.
- **D3 Promociones por horario y día**: los horarios pueden cruzar la
  medianoche (la parte de madrugada cuenta como el día anterior).
- **D4 Acceso**: todo usa PIN salvo Administración, Empleados y
  Configuración (candado en el menú; login con email/password y enlace de
  regreso al POS).
- **D5 Recuperar password**: lo restablece otro administrador en Empleados
  (texto en el login). No hay recuperación por email.
- **D6 Compras por presentación**: `Ingredient.purchasePresentationName/Size`
  y `PurchaseOrderItem.presentationName/unitsPerPresentation`; se pide y se
  muestra en la presentación (ej. "2 L") y se recibe al inventario en la
  unidad base (`lib/units.ts`, `toBaseOrderLine` en `actions/purchases.ts`).

**Convenciones nuevas:**

- **E2E**: `npm run build && npm run test:e2e` (Playwright + axe, base
  `nomada_pos_test`, puerto 3100; `PW_CHROMIUM_PATH` si el Chromium no es el
  de Playwright). Cada fase tiene su spec en `e2e/`; `a11y.spec.ts` exige
  cero violaciones axe críticas/serias, un h1 por pantalla y venta solo con
  teclado.
- **Sesión**: `assertSessionEmployee(employeeId)` y `SessionExpiredError`
  (`lib/session.ts`) — una acción con sesión vencida redirige al login con
  `?error=sesion`.
- **Idempotencia**: `Sale.clientRequestId` (único); reintentar un cobro sin
  respuesta no duplica la venta.
- **Carrito persistente** en `sessionStorage` por empleado
  (`cart-store.ts`, `CART_STORAGE_KEY`), se limpia al cambiar de empleado.
- **Búsqueda**: `matchesSearch` (`lib/search.ts`) ignora acentos y
  mayúsculas; úsala en cualquier buscador nuevo.
- **Selectores largos**: `components/ui/combobox.tsx` (ARIA 1.2) en vez de
  `<select>` con muchas opciones.
- **Validación**: `lib/validation.ts` (teléfono MX, email, montos, URLs
  https); emails guardados en minúsculas.
- **UI**: `PageHeader`/`ComprasNav` (`components/layout/page-header.tsx`),
  `Alert` (`components/ui/alert.tsx`), `ConfirmDialog`; `CardTitle` es h2
  por defecto (`as` para cambiarlo); botones-selector con `aria-pressed`;
  títulos de pestaña con `export const metadata = { title }` por página.
- **Duplicados**: `UNIQUE_MESSAGES` en `lib/safe-action.ts` traduce P2002
  por modelo/campo; agrega ahí cualquier `@unique` nuevo.

Migraciones nuevas: `20261006010000_sale_client_request_id`,
`20261006020000_purchase_presentation`, `20261006030000_lowercase_emails`.

## Correcciones del QA de octubre 2026

Un QA completo contra el build de producción (`npm run build && npm start`)
encontró y corrigió lo siguiente. Convenciones nuevas que conviene seguir:

- **Server Actions = `safeAction(...)`** (`lib/safe-action.ts`). Next.js
  oculta en producción el mensaje de cualquier `throw` de un Server Action
  (el usuario veía "An error occurred in the Server Components render…" en
  inglés). Las acciones de `actions/*.ts` se envuelven con `safeAction`, que
  regresa `{ __actionError }`; en el cliente se importan como
  `fooAction` y se envuelven con `withActionErrors` (`lib/action-result.ts`)
  para que `try/catch` + `err.message` sigan funcionando igual. Toda acción
  nueva debe seguir el mismo patrón.
- **Zona horaria**: usar `lib/time.ts` (`formatDateTime`, `zonedDateKey`,
  `zonedStartOfDay`…) en vez de `toLocaleString`/`setHours`/`getHours`.
- **Detalle por id**: `orNotFound(...)` (`lib/not-found.ts`) para dar 404.
- **PIN**: único entre empleados activos (`isPinTaken`) y con límite de 5
  intentos fallidos por IP cada 5 min (`lib/rate-limit.ts`, en memoria).
- **Anular ventas**: `cancelSale` (Caja → Ventas del turno), PIN con
  `VENTA_CANCELAR` + motivo (`Sale.cancelReason`); revierte inventario,
  cupón y sello. Una mesa solo puede tener una cuenta abierta.
- **Extras libres**: se cobran con `Ingredient.extraUnitPrice` (editable en
  Inventario) o, si no tiene, costo ÷ % de food cost objetivo — ya no a costo.
- **`updateCustomer` es parcial**: un campo omitido se conserva.
- Seed demo: Ana es ADMINISTRADOR (antes GERENTE, no podía entrar a
  Administración). Layout responsive (sidebar oculto bajo `xl`), diálogos
  con Esc/foco, tarjetas operables con teclado, resumen con cambio a
  entregar al cobrar, ESLint configurado (`.eslintrc.json`).

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

## Cuentas abiertas — revisar/corregir al retomar (mismo alcance, ajuste posterior)

El usuario notó justo después de mergear "Productos + POS 2" que al
retomar una cuenta abierta solo se veía un resumen ("3 productos ·
$126"), no la lista real — y que hace falta poder corregirla (quitar un
producto o ajustar su cantidad) porque cerrar la cuenta es el momento en
que se rectifica con el cliente que todo esté bien. Se acotó el alcance:
quitar/ajustar cantidad sí, editar modificadores/extras/notas de un
producto ya registrado no (para eso se quita y se vuelve a agregar bien
en la ronda actual).

`getTabDetail` (`actions/pos.ts`) ahora regresa cada item con su `id`,
`unitPrice`, nombres de modificadores y notas (antes solo nombre/
cantidad/total) — `CartPanel` los renderiza como una lista real con
stepper +/- y botón "Quitar" por línea, encima de la ronda actual.
Nuevas acciones `removeTabItem`/`updateTabItemQuantity`: ambas
reconstruyen el consumo de inventario que ese `SaleItem` causó
(reusando `resolveSaleItems` con un item sintético armado desde lo ya
guardado — simplificación aceptada: usa la receta *activa* actual, no
la versión exacta que se usó al agregarlo, válido mientras nadie edite
esa receta en el rato que la cuenta sigue abierta) para revertirlo o
ajustar la diferencia exacta.

**Bug real encontrado en la propia verificación** (antes de dar la
función por buena): la primera versión de `updateTabItemQuantity`
quitaba el `SaleItem` viejo y creaba uno nuevo — al tener un
`createdAt` más reciente, el item ajustado saltaba al final de la
lista cada vez que se le cambiaba la cantidad, lo cual es confuso
exactamente en el momento en que el cajero está revisando el orden con
el cliente. Se corrigió actualizando el `SaleItem` existente en su
lugar (mismo id), calculando el consumo de inventario como una
diferencia real (`subtractConsumption`) entre la cantidad vieja y la
nueva, en vez de revertir todo y volver a aplicar desde cero.

**Segundo bug real encontrado**: el botón "Confirmar venta" del
checkout tenía `disabled={... || lines.length === 0 || ...}` — al
cerrar una cuenta abierta sin agregar una ronda final (el carrito
actual vacío es válido ahí, `closeTab` ya lo soporta), el botón se
quedaba deshabilitado para siempre y no dejaba cobrar. Se corrigió a
`lines.length === 0 && !activeTabId`.

Verificado con Playwright + Postgres real: cuenta con 2 productos
distintos (Chico Frío + Chico Caliente) → retomada → lista completa
visible con temperatura de cada uno → cantidad de uno ajustada de 1 a 2
sin que cambiara de posición en la lista → el otro quitado por
completo → cerrada sin ronda adicional → confirmado en DB que el
consumo de inventario neto coincide exactamente con lo que quedó
(delta correcto en cada paso, no un remove-and-reapply completo).
Datos de prueba limpiados.

## Tarjeta de lealtad pública + cupón de bienvenida (rama `tarjeta-lealtad-publica`)

El usuario pidió que al registrar un cliente reciba por WhatsApp un link
para "descargar" su tarjeta de lealtad, compatible con Apple/Google
Wallet, y que se le genere un cupón de 10% para su próxima compra.
Antes de construir nada se dejó claro que enviar WhatsApp de verdad y
generar pases nativos de Wallet requieren cuentas de terceros con
costo/verificación que el negocio no tiene todavía — **WhatsApp
Business API**, **Apple Developer Program + certificado Pass Type ID**
(para firmar el `.pkpass`), **Google Wallet Console**. El usuario eligió
explícitamente construir ahora solo lo que no depende de esas cuentas.

**Cupón de bienvenida, personal y de un solo uso**: `DiscountCode` (antes
un código genérico y reusable, sin dueño ni marca de uso) ganó
`customerId`/`usedAt` (migración aditiva — los códigos genéricos ya
existentes, con `customerId` null, siguen siendo multi-uso igual que
antes). `createCustomer` (`actions/customers.ts`) ahora, en una sola
transacción: crea el `Customer`, crea su `LoyaltyCard` **de una vez**
(antes se creaba recién hasta la primera venta, vía el `upsert` de
`applyLoyaltyStamp` en `actions/pos.ts` — ese upsert se deja intacto,
sigue sirviendo para clientes viejos sin tarjeta) y crea un
`DiscountCode` personal `BIENVENIDA-XXXXXX` (10%, sin fecha de
expiración — el pedido fue literalmente "en tu próxima compra"). Regresa
`{id, loyaltyCardCode, welcomeCouponCode}` en vez de solo `{id}`.

**Validación al redimir**: `findDiscountCodeByCode` (`actions/discounts.ts`,
usado por el botón "Validar" en el checkout) y un nuevo helper
compartido `validateAndConsumeDiscountCode` en `actions/pos.ts` (usado
por `createSale` y `closeTab` — mismo patrón de piezas reusables ya
establecido ahí) verifican, cuando el código tiene `customerId`: que
coincida con el cliente de la venta ("Este cupón es para otro
cliente.") y que no se haya usado ya ("Este cupón ya se usó."). Al
completar la venta, se marca `usedAt` dentro de la misma transacción —
si la venta falla por otra razón, la marca se revierte junto con todo
lo demás.

**Página pública `/lealtad/[code]`** — la primera ruta sin sesión de
toda la app (no existe `middleware.ts`, cada página valida sesión a
mano; esta simplemente no lo hace). Nuevo `lib/loyalty.ts`
(`getPublicLoyaltyCard`) expone un DTO mínimo pensado para ser público
— nombre, sellos, nivel, cupón de bienvenida sin usar si existe — nada
de teléfono/email/historial de compras (eso sigue siendo exclusivo de
`getCustomerDetail`/`/clientes/[id]`, de uso interno). La página
renderiza un código QR (nueva dependencia `qrcode`, generado del lado
del servidor como SVG inline, sin JS de cliente) con el mismo código
que ya usa el lector tipo teclado en checkout, el progreso de sellos, y
el cupón si sigue sin usar.

**Botón "Enviar por WhatsApp"** en los dos lugares donde se crea un
cliente (`/clientes/nuevo` vía `CustomerForm`, y la creación inline en
`checkout-dialog.tsx`): arma un link `https://wa.me/<tel>?text=...` con
`buildWhatsAppLoyaltyLink` (`lib/utils.ts`) — el cajero lo abre y lo
manda con un clic, no hay envío automático por API. Sin normalización
de código de país más allá de quitar caracteres no numéricos
(limitación conocida y documentada).

Verificado con Playwright + Postgres real: cliente nuevo con teléfono →
`LoyaltyCard`/`DiscountCode` creados en DB con los campos correctos →
link de WhatsApp armado con la URL y el cupón correctos → `/lealtad/{code}`
abierta en un contexto de navegador **sin sesión** → carga sin pedir
login, muestra QR/sellos/cupón; código inválido → mensaje de "no
encontrada", sin error; venta aplicando el cupón → 10% descontado
correctamente, `usedAt` marcado en DB; mismo código en una segunda venta
→ rechazado ("ya se usó"); cupón de un cliente aplicado con otro cliente
seleccionado → rechazado ("para otro cliente"). Datos de prueba
limpiados.

Fuera de alcance (documentado explícitamente, decisión del usuario):
envío real por WhatsApp Business API, pases nativos de Apple Wallet
(`.pkpass` firmado) y Google Wallet — las tres requieren cuentas de
terceros que el negocio no tiene todavía; el link `/lealtad/[code]` es
justo el tipo de URL que un pase nativo también necesitaría enlazar, así
que el código queda listo para conectar en cuanto existan esas cuentas.
Fecha de expiración del cupón (no se inventó una). Reenviar/regenerar un
cupón perdido desde la UI (por ahora vía Prisma Studio). Múltiples
cupones o cupones recurrentes más allá del de bienvenida.

## Sistema de diseño unificado + Apariencia en Administración (rama `diseno-sistema-unificado`)

El usuario pidió estandarizar visualmente toda la interfaz (referencia:
un dashboard tipo POS/delivery con tarjetas redondeadas, acento sólido y
nav lateral tipo píldora) y agregar una sección en Administración para
configurar tamaño de letra, tipo de letra, colores y "base del sistema"
(claro/oscuro).

Antes de construir se auditó el código existente (`grep` de hex/colores
Tailwind sueltos en `app/`+`components/`): **ya estaba limpio** — cero
hex hardcodeado, un solo uso de un color Tailwind literal
(`text-emerald-600` en un mensaje de "Guardado"), y los primitivos de
`components/ui/` (`Button`/`Card`/`Input`/`Select`/`Badge`/`Dialog`) ya
usan las variables CSS de `app/globals.css` de forma consistente en toda
la app (patrón shadcn-like). Eso cambió el alcance real: no hizo falta
reescribir páginas una por una, bastó con (1) subir la apariencia base a
nivel de esas variables/primitivos, que ya cascadea a todo, y (2) exponer
esa base como configuración real.

**`lib/theme.ts`** — única fuente de verdad de las 4 opciones
configurables, con claves cerradas (nunca un string libre desde el
cliente):
- `mode`: `claro`/`oscuro` (sin "automático" — se resuelve 100% en el
  server component raíz, así que depende de un valor guardado, no de
  `prefers-color-scheme`, para no arriesgar un mismatch de hidratación).
- `color`: 5 paletas (`cafe` default/`azul`/`verde`/`morado`/`rosa`), cada
  una con HSL de `--primary`/`--primary-foreground` para claro y oscuro.
  Solo se sobreescribe el acento — `--secondary`/`--muted` se quedan
  neutros en ambos modos a propósito, para que un acento fuerte no rompa
  contraste en el resto de la UI. El anillo de foco no tiene variable
  propia, hereda el acento vía `ring-primary`.
- `fontFamily`: `sans`(default)/`rounded`/`serif`. Se probó primero con
  pilas de fuentes de sistema (`ui-rounded`, etc.) — **no sirvió**:
  `ui-rounded` solo renderiza distinto en WebKit/Apple, en todo lo demás
  cae al mismo sans-serif de siempre y la opción "Redondeada" quedaba
  invisible. Se reemplazó por `next/font/google` autohospedado
  (`lib/fonts.ts`: Inter/Poppins/Lora, cada una expone una variable CSS
  `--font-sans`/`--font-rounded`/`--font-serif`) — se descarga una sola
  vez en build/dev, no en cada request, así que sigue sin depender de
  internet en runtime (importante para un POS que puede correr en un
  kiosco). Verificado visualmente que Poppins/Lora sí se ven distintas
  entre sí y del default.
- `fontSize`: `sm`(14px)/`md`(16px, default)/`lg`(18px), aplicado como
  `font-size` en `<html>` — a propósito escala también el spacing
  basado en rem (igual que el zoom del navegador), no solo el texto.

Todo se resuelve server-side en `app/layout.tsx` (ahora async): lee
`getThemeSettings()` y aplica `className`/`style` inline en `<html>`
(`themeCssVars()`) — cero JS de cliente para aplicar el tema, cero flash
de tema incorrecto en el primer paint.

**Persistencia**: 4 columnas nuevas en `Branch` (`themeMode`/`themeColor`/
`themeFontFamily`/`themeFontSize`, todas `String?`, migración
`20260925002920_add_theme_settings`) — mismo patrón que
`targetFoodCostPercent`: viven en `Branch` porque la sucursal sigue fija
(`DEFAULT_BRANCH_ID`) hasta Fase 5, null se resuelve a `THEME_DEFAULTS`.
Nueva `updateAppearanceSettings` en `actions/settings.ts`, mismo permiso
exclusivo de ADMINISTRADOR que ya usaba la configuración de food cost
(`CONFIGURACION_SISTEMA_GESTIONAR` vía `requirePasswordSession` +
`requirePermission`), `revalidatePath("/", "layout")` porque afecta el
layout raíz completo, no una sola página.

**UI**: nueva tarjeta "Apariencia" en `/administracion` (bajo el mismo
gate `canManageSettings` que ya ocultaba "Configuración" a roles que no
son ADMINISTRADOR — GERENTE, incluida Ana, la cuenta demo, no la ve;
verificado creando un empleado ADMINISTRADOR de prueba vía el flujo real
de "+ Nuevo empleado", probando, y desactivándolo de nuevo al terminar).
`components/administracion/appearance-form.tsx`: selects para
modo/tipografía/tamaño, swatches de color como botones circulares, mismo
patrón de guardado (`useTransition` + `router.refresh()`) que
`SettingsForm`.

**Otros ajustes de "línea de diseño"**:
- `--radius` subió de `0.5rem` a `0.75rem` en `globals.css` — como
  `tailwind.config.ts` ya ataba `rounded-md`/`rounded-lg`/`rounded-sm` a
  `var(--radius)`, esto redondeó botones/inputs/cards/diálogos en **toda**
  la app con un solo cambio, sin tocar componentes uno por uno.
- `components/layout/sidebar.tsx` pasó a `"use client"` con
  `usePathname()` para resaltar el módulo activo como píldora
  (`rounded-full bg-primary`) — antes no había ningún estado activo, los
  8 módulos se veían siempre igual.
- Modo oscuro real: `tailwind.config.ts` con `darkMode: "class"`,
  variables `.dark` nuevas en `globals.css` (solo neutros — el acento lo
  sigue resolviendo `themeCssVars` según la paleta elegida).

Verificado con Playwright + Chromium headless contra el dev server real
(sin `chromium-cli` disponible en este entorno, se instaló `playwright`
temporalmente con `--no-save` y se desinstaló al terminar — no quedó
como dependencia): login real, cambiar cada opción de apariencia y
guardar, confirmar que se aplica de inmediato en `/administracion`,
`/pos` y `/caja` sin recargar manualmente el navegador, capturas en
claro/oscuro/cada acento/cada tipografía/cada tamaño, sin errores de
consola. Datos de prueba revertidos a los defaults y empleado de QA
desactivado al final.

Fuera de alcance (no pedido, no se construyó): un color picker libre
(hex/RGB) — se prefirieron paletas curadas para que cualquier
combinación se vea bien con los tokens neutros existentes; tipografías
adicionales más allá de las 3 curadas; personalización por empleado (la
apariencia es global de la sucursal, igual que el food cost objetivo).

## Cambios de Administración — Frente 1: control de acceso + barra global (rama `cambios-administracion`)

Primer frente de un plan más grande ("cambios de administración", ver plan
guardado en la sesión) que restringe Clientes/Reportes/Compras/Productos/
Inventario a solo el rol ADMINISTRADOR y convierte la barra "Atendiendo: X"
del POS en una barra global al fondo de toda la app. Los siguientes frentes
(mejoras puntuales dentro de cada uno de esos 5 módulos) van en ramas
separadas, no en esta.

**Gate por rol, no por permiso**: nuevo `resolveRoleName(employee, branchId)`
en `lib/session.ts` — lee `employee.branches` (ya incluido por
`getCurrentEmployee()`) y devuelve el `RoleName` exacto para esa sucursal.
A propósito NO se usa `hasPermission`/`getEffectivePermissions`
(`lib/permissions.ts`) para este gate: un `EmployeePermissionOverride` (ver
schema) podría darle a un GERENTE un permiso puntual de administrador sin
hacerlo ADMINISTRADOR, y este gate debe ser duro por identidad de rol, no
por permiso efectivo. Se aplicó en las 24 páginas de estos 5 módulos
(incluidas todas sus subpáginas: `nuevo`, `[id]`, `proveedores`,
`transferencias`, `conteos`, etc.) y en las 3 páginas de Administración
(`/administracion`, `/administracion/nuevo`, `/administracion/[employeeId]`)
— antes estas últimas solo pedían permisos (`EMPLEADO_CREAR`/
`EMPLEADO_MODIFICAR`), que GERENTE sí tenía.

**Cambio de comportamiento real, ya confirmado con el usuario**: GERENTE
(la cuenta demo de Ana) perdía por completo el acceso a Administración con
este cambio, y como no había ningún empleado activo con rol ADMINISTRADOR
en la base de dev, **nadie hubiera podido entrar a promover a nadie**
(lockout total). Se resolvió promoviendo a Ana de GERENTE a ADMINISTRADOR
usando el flujo real de edición de empleado (no un script directo a la
base de datos) — confirmado con el usuario antes de hacerlo. **Ana ahora
es ADMINISTRADOR, ya no GERENTE.** BARISTA también pierde el acceso que
tenía vía permisos granulares a partes de Compras/Clientes
(`COMPRA_REGISTRAR`/`ORDEN_COMPRA_CREAR`/`CLIENTE_CONFIGURAR` siguen
existiendo en el rol pero ya no alcanzan para entrar a esas pantallas).

**Sidebar** (`components/layout/sidebar.tsx`): ahora recibe `isAdmin: boolean`
(prop obligatoria — cualquier código nuevo que renderice `<Sidebar />`
directo, en vez de vía `AuthenticatedShell`, dejará de compilar hasta que
se le pase). Los 5 módulos + "Administración" solo se renderizan si
`isAdmin`, agrupados bajo un label "ADMINISTRACIÓN".

**`components/layout/authenticated-shell.tsx`** (nuevo) reemplaza el
`<div className="flex h-screen"><Sidebar />...` que estaba duplicado
literal en las ~24 páginas raíz — un solo lugar que arma Sidebar + contenido
+ la barra global de abajo. **`components/layout/session-bar.tsx`** (nuevo,
`"use client"`): franja fija `bg-neutral-900`/`text-neutral-50` **a
propósito fuera del sistema de tokens de Apariencia** (no usa
`--primary`/`.dark`) — es un ancla visual constante para saber quién opera
el sistema, no debe cambiar con el tema elegido. Contiene "Atendiendo: X",
un `<select>` de "zona" (navegar entre secciones vía `router.push` — se
confirmó con el usuario que "zona" es esto, navegación entre secciones de
la UI, no un concepto nuevo de sucursal/estación física) y "Cambiar de
empleado" (antes duplicado en `pos-workspace.tsx`, `shift-summary.tsx` y
`administracion/page.tsx`, ahora vive solo aquí). `PosWorkspace` conservó
solo sus botones propios de turno ("Cuentas abiertas"/"Movimiento de caja"),
ya no la identidad/logout.

**`/administracion` como hub**: ahora siempre muestra Configuración y
Apariencia (antes condicionadas a `CONFIGURACION_SISTEMA_GESTIONAR`, que ya
no hace falta comprobar aparte — solo ADMINISTRADOR llega a esta página, y
ADMINISTRADOR ya tiene ese permiso por definición en `prisma/seed.ts`), más
5 tarjetas de acceso rápido a Clientes/Reportes/Compras/Productos/
Inventario. Las rutas de esos 5 módulos no se movieron (siguen en
`/clientes`, `/reportes`, etc.) — solo cambió quién puede verlas/entrar.

Verificado con Playwright (Chromium headless, `playwright` instalado y
desinstalado con `--no-save`, no quedó como dependencia) contra Postgres
real: Ana (ya ADMINISTRADOR) ve los 8 módulos con el label "ADMINISTRACIÓN",
la barra global se ve en `/pos`/`/administracion`, el selector de zona
navega correctamente, "Cambiar de empleado" cierra sesión; un empleado
BARISTA de prueba (creado y luego desactivado vía el flujo real
"+ Nuevo empleado", PIN de prueba) queda con sidebar de solo Punto de
Venta/Caja y es redirigido a `/pos` (o a `/administracion/login` en el caso
de `/administracion`, por `requirePasswordSession`) al intentar entrar a
cualquiera de los 5 módulos por URL directa. Sin errores de consola.

**Adenda — el gate de página no bastaba**: el usuario notó, con razón, que
ocultar la página no impide que la Server Action detrás siga aceptando el
permiso granular de siempre (ej. un BARISTA con `CLIENTE_CONFIGURAR` o
`ORDEN_COMPRA_CREAR` en la matriz de `prisma/seed.ts` podía en teoría seguir
llamando `createDiscountCode`/`createPurchaseOrder`/etc. aunque ya no viera
el botón). Se agregó `requireAdminRole(employeeId, branchId)`
(`lib/permissions.ts`) — mismo principio que `resolveRoleName` pero
resuelto con una query propia para Server Actions que no tienen ya cargado
el empleado completo — y se aplicó, tras auditar caso por caso quién llama
a cada función (`grep` de cada nombre de acción contra todo `components/` y
`app/`), a las 19 Server Actions que son exclusivas de estos módulos:
`createSupplier`/`updateSupplier`/`upsertIngredientSupplier`/
`createPurchaseOrder`/`receivePurchaseOrder` (`actions/purchases.ts`),
`createIngredient`/`createProductWithRecipe`/`addVariantToProduct`/
`updateVariantRecipe`/`updateProductCategory` (`actions/recipes.ts`),
`adjustInventoryStock` (`actions/inventory.ts`),
`createTransferManifest`/`markTransferInTransit`/`receiveTransfer`/
`cancelTransferManifest` (`actions/transfers.ts`),
`createPhysicalCount`/`approvePhysicalCount` (`actions/counts.ts` — esta
última gatea sobre `approver.id`, no `input.employeeId`, porque quien
aprueba un conteo se identifica con un PIN aparte, un empleado distinto de
quien lo capturó), `createDiscountCode`/`toggleDiscountCodeActive`
(`actions/discounts.ts`), y `createEmployee`/`updateEmployee`
(`actions/employees.ts`, vía el helper ya existente `requireEmployeeManager`,
que ahora también exige `resolveRoleName(actor, branchId) ===
"ADMINISTRADOR"` antes del permiso).

**A propósito NO se tocaron** `createCustomer`/`updateCustomer`
(`actions/customers.ts`) ni `findDiscountCodeByCode` (`actions/discounts.ts`,
aplicar un cupón en checkout): las tres se usan también desde
`components/pos/checkout-dialog.tsx` — un cajero cualquiera sigue pudiendo
dar de alta un cliente o aplicar un cupón al cobrar, eso es una función real
del POS, no una "opción de administrador" que se coló. Gatearlas habría
roto ese flujo. Tampoco se tocó `fetchVariantRecipeDetail`
(`actions/recipes.ts`, lectura pura sin `employeeId` en su firma) — es de
solo lectura y de bajo riesgo; agregarle el gate hubiera requerido cambiar
su firma para recibir un `employeeId` que hoy no tiene, sin necesidad real.

Verificado por revisión de código + `npm run typecheck` (no hay una manera
directa de simular un cajero real invocando la Server Action sin pasar por
la UI ya oculta, sin reimplementar el protocolo interno de invocación de
Server Actions de Next).

Pendiente explícito (frentes siguientes del mismo plan, ramas separadas):
estadísticas de clientes (edad/género) + top de productos comprados,
filtros avanzados en Reportes (hora pico, canal, categoría/tipo de bebida
en Recetas), recepción parcial reabrible + cancelar en Compras + alerta de
stock bajo ahí mismo, arreglar la selección de tamaño/variante en Productos
para que sea tarjetas (no menú lateral), y CRUD real de insumos + migrar
`IngredientCategory` de enum a tabla en Inventario.

## Cambios de Administración — Frente 6: CRUD de insumos y categorías en Inventario (rama `cambios-administracion`)

Segundo frente del mismo plan, implementado antes que Compras (Frente 4)
porque ese depende de `Ingredient`/`IngredientCategory` ya estables — ver
"Orden recomendado" en el plan de la sesión.

**Migración de schema (`20260927210000_ingredient_category_to_table`)**:
`IngredientCategory` pasó de enum fijo (`CAFE|JARABES|LECHE|TOPPINGS|
INSUMOS`) a modelo real (mismo patrón que `ProductCategory`, sin jerarquía
— las categorías de insumo son planas). Migración escrita a mano (no
`prisma migrate dev`, que se niega a generar un paso destructivo con datos
existentes sin confirmación interactiva): crea `ingredient_categories`,
siembra las 5 categorías **usando el texto del enum como `id`
determinístico** (`'CAFE'`, `'LECHE'`, etc. — no un cuid nuevo), agrega
`Ingredient.categoryId` nullable, hace `UPDATE ... SET "categoryId" =
"category"::text` para el backfill, recién entonces exige `NOT NULL` y
borra la columna/enum viejos. Verificado antes y después de aplicar
(conteo por categoría en Postgres real): los 27 insumos existentes
conservaron su categoría exacta. El truco de usar el texto del enum como
`id` de la fila nueva es lo que permitió que checks existentes como
`ingredient.categoryId === "LECHE"` (`findBaseMilkLine` en
`actions/recipes.ts`, `excludedCategories`/`substitutionCategories` en
`actions/pos.ts`) siguieran funcionando **sin** tener que agregar un
`include: { category: true }` en cada lugar que solo necesitaba comparar
la categoría, no mostrar su nombre.

**Alcance real de la migración de código**: `category: X` → `categoryId:
X` en `prisma/seed-demo.ts`/`prisma/seed-lapso.ts` (creación de insumos) y
en cada `IngredientOption`/`InventoryOverviewItem`/etc. que traía el campo
como string plano — la mayoría de estos consumían el valor solo como
passthrough (nunca se leía en ningún componente), así que renombrar fue
suficiente sin agregar joins nuevos. Única función que de verdad necesitó
el `include: { category: true }` para mostrar el **nombre**: `lib/
inventory.ts` `getInventoryOverview()` (nueva UI de Inventario).

**CRUD nuevo, todo en `actions/inventory.ts`** (mismo permiso ya usado por
`createIngredient`, `INVENTARIO_CREAR_ITEM`, más el gate de rol
`requireAdminRole` de Frente 1): `updateIngredient`, `deleteIngredient`,
`createIngredientCategory`, `updateIngredientCategory`,
`deleteIngredientCategory`. **Sin borrado suave, pero con dos capas de
protección**: `deleteIngredient` primero revisa a mano
`recipeItems`/`modifierOptions` — las dos únicas relaciones con FK
**opcional** hacia `Ingredient` (una línea de receta puede apuntar a un
ingrediente compuesto en vez de uno atómico; una `ModifierOption` "base"
no referencia ninguno) — porque ahí Postgres pondría la FK en `NULL` en
vez de bloquear el borrado, corrompiendo silenciosamente una receta o un
modificador ya usado. Todo lo demás (compras, movimientos, stock, lotes,
conteos, transferencias, historial de costo, punto de reorden) tiene FK
**obligatoria** — el `RESTRICT` de Postgres ya lo bloquea, se atrapa el
error (`Prisma.PrismaClientKnownRequestError`, código `P2003`) y se
traduce a un mensaje legible. `deleteIngredientCategory` hace el chequeo
proactivo equivalente (`_count.ingredients > 0`) antes de intentar borrar.

**UI nueva (`components/inventario/`)**: `inventory-workspace.tsx`
reemplaza el acordeón-por-categoría que había antes (`inventory-overview.tsx`,
borrado) reusando **sin modificar** el mismo `CategoryDrilldown` compartido
por `/pos` y `/productos` — las categorías de insumo, al ser planas (sin
`parentId`), caen solas en la rama "standalone" del componente y se
renderizan igual que las categorías de nivel 1 de Productos (píldoras a la
izquierda, tarjetas de insumo en el área principal), sin necesidad de
generalizarlo como se especulaba en el plan. `ingredient-form-dialog.tsx`/
`category-form-dialog.tsx` (crear+editar en un solo diálogo cada uno, mismo
patrón que `EditCategoryDialog` de Productos) y `CategoryIconPicker`
(`components/productos/category-icon-picker.tsx`, ya genérico) reusado tal
cual para el ícono de categoría de insumo.

**Dos bugs reales encontrados y corregidos durante la verificación**
(Playwright + Postgres real):
1. `IngredientFormDialog`/`CategoryFormDialog` quedan montados de forma
   permanente en `InventoryWorkspace` (para poder abrirse/cerrarse sin
   perder el resto del estado del workspace), con `open`/`ingredient`/
   `category`/`defaultCategoryId` cambiando por prop — un `useState`
   inicial **no se vuelve a evaluar** en cada apertura. Sin corregir esto,
   "+ Nuevo insumo" en cualquier categoría creaba siempre el insumo en la
   primera categoría de la lista (`categories[0]`), no en la que se estaba
   viendo. Corregido con un `useEffect` que resincroniza los campos cuando
   `open` pasa a `true` (mismo patrón que ya usaba `AdjustStockDialog`,
   que sí lo hacía bien desde antes).
2. `CategoryDrilldown` fija su categoría activa en un `useState` inicial y
   nunca la reconcilia si esa categoría desaparece de la lista — invisible
   en POS/Productos (esas categorías no se borran en vivo hoy), pero
   Inventario sí permite borrar la categoría que se está viendo, y borrarla
   dejaba la pantalla en "No hay categorías todavía" aunque quedaran otras.
   Corregido **sin tocar el componente compartido**: `key={categories.map(c
   => c.id).join(",")}` en el `<CategoryDrilldown>` de
   `inventory-workspace.tsx` fuerza un remount (y un `activeTopId` fresco)
   cada vez que cambia el set de categorías.

Verificado end-to-end: crear categoría → crear insumo en ella → editarlo →
intentar borrar la categoría con el insumo todavía dentro (bloqueado, con
mensaje) → borrar el insumo → borrar la categoría (ahora sí, cae de
vuelta a la primera categoría sin quedar en blanco) → confirmar que las 5
categorías/27 insumos sembrados originales siguen intactos → confirmar que
`/productos` (que ahora también depende de las categorías de insumo reales
para su propio "+ Nuevo ingrediente" inline) y `/pos` siguen funcionando
sin errores de consola.

## Cambios de Administración — Frente 4: recepción parcial reabrible, cancelar y stock bajo en Compras (rama `cambios-administracion`)

Tercer frente del mismo plan. Todo en `actions/purchases.ts` salvo donde
se indica.

**Recepción reabrible**: `PurchaseOrderStatus.PROVEIDA_PARCIALMENTE` deja
de ser terminal (decisión confirmada con el usuario en el plan original,
antes de tocar código) — `receivePurchaseOrder` ahora acepta `status ===
"CREADA" || "PROVEIDA_PARCIALMENTE"`. `PurchaseOrderItem.receivedQuantity`
pasó de "lo recibido en esta pasada" (se sobreescribía) a **acumulado
entre pasadas** — cada pasada nueva valida contra lo que falta
(`orderedQuantity - receivedQuantity` ya acumulado, rechaza recibir más de
eso) y sólo entonces suma. El estado final (`PROVEIDA` vs
`PROVEIDA_PARCIALMENTE`) se recalcula sobre el acumulado real de **todos**
los ítems de la orden, no solo los tocados en la pasada actual — un ítem
ya completado en una pasada anterior debe seguir contando como completo
aunque la pasada nueva no lo toque. Los efectos de inventario (`InventoryStock`,
`IngredientBatch`, `InventoryMovement`) ya eran correctamente
incrementales por pasada desde antes (cada pasada mueve solo lo que llegó
en ella) — no hicieron falta cambios ahí. `lib/purchases.ts`
`PurchaseOrderItemDetail` ganó `pendingQuantity` (`orderedQuantity -
receivedQuantity`, clamp a 0) para que `ReceiveOrderForm` (`components/
compras/receive-order-form.tsx`) precargue el campo con lo que **falta**,
no con el total original, y muestre "recibido hasta ahora" cuando aplica;
un ítem ya completo en una pasada anterior se muestra de solo lectura
("Ya se recibió por completo"), sin input.

**Cancelar orden**: nueva `cancelPurchaseOrder`, solo si `status ===
"CREADA"` (nunca sobre algo con recepción parcial o total ya aplicada, para
no dejar inventario/costo ya movido inconsistente con el estado de la
orden). Nuevo `components/compras/cancel-order-button.tsx` (confirmar con
un segundo click, mismo patrón que otros botones destructivos del
proyecto).

**Editar orden**: nueva `updatePurchaseOrder`, también exclusiva de
`status === "CREADA"` — borra y recrea las líneas de la orden (seguro
solo porque en CREADA no hay `IngredientBatch` todavía referenciándolas).
`NewOrderForm` (`components/compras/new-order-form.tsx`) ganó un prop
opcional `existingOrder` que lo vuelve un formulario de edición en vez de
creación (mismo componente para ambos casos). Nuevo
`components/compras/purchase-order-detail-view.tsx` (client) reemplaza la
lógica que vivía inline en la página de detalle: alterna entre la vista
normal (con botones "Editar"/"Cancelar orden", solo en `CREADA`) y
`NewOrderForm` en modo edición.

**Bug real encontrado y corregido en la verificación** (Playwright +
Postgres real, mismo patrón que los dos de Inventario en el Frente 6, ver
[[feedback-stale-state-mounted-dialogs]]): editar una orden reemplaza sus
`PurchaseOrderItem` con **ids nuevos** (borra y recrea). Al volver de modo
edición a la vista normal, `ReceiveOrderForm` se monta de nuevo con la
`order` (todavía la de antes de guardar, sin refrescar) — pero la
revalidación automática de Server Actions de Next (cualquier `Server
Action` que llama `revalidatePath` refresca sola los server components de
la ruta actual, sin necesitar un `router.refresh()` explícito) le entrega
casi de inmediato al mismo `ReceiveOrderForm` **ya montado** una `order`
con los ids nuevos — pero su estado interno `lines` (inicializado una sola
vez al montar) seguía apuntando a los ids viejos. Resultado: `lines.find(id
=> ...)` no encontraba nada, `undefined!.receivedQuantity` tronaba la
pantalla con un `TypeError` real (reproducido y confirmado con el stack
completo antes de corregir). Arreglado igual que el bug de
`CategoryDrilldown` en Inventario: `key={order.items.map(i =>
i.id).join(",")}` en `<ReceiveOrderForm>` fuerza un remount limpio
cualquier vez que cambie el set de ids de línea.

**Insumos con stock bajo**: nueva tarjeta en `app/compras/page.tsx`
reusando `getInventoryOverview()` (`lib/inventory.ts`, ya calcula
`isLow` contra `ReorderPoint`, sin cambios ahí). Simplificación consciente
respecto al plan original: el link "Pedir →" manda a `/compras/nueva` sin
prellenar el insumo (el plan hablaba de prellenarlo) — prellenar hubiera
requerido pasar el insumo por query param y que `NewOrderForm` lo
consumiera, alcance no crítico para lo pedido. **No se pudo probar
visualmente con datos reales**: no hay ningún `ReorderPoint` sembrado hoy
en la base de dev (`lib/inventory.ts` ya lo documentaba como pendiente
antes de este frente) y no existe todavía UI para crear uno — la tarjeta
solo se verificó por code review + typecheck, no en el navegador con un
insumo realmente bajo de stock.

Verificado end-to-end (Playwright + Postgres real): crear orden → recibir
parcialmente (5 de 10) → confirma `PROVEIDA_PARCIALMENTE` → recibir el
resto (5 más) → confirma `PROVEIDA`, `pedido 10 · recibido 10`, y en DB dos
`InventoryMovement` tipo `COMPRA` de 5 cada uno (no uno de 10 ni
duplicado) → crear otra orden y cancelarla → confirma que ya no muestra
ni "Editar" ni el formulario de recepción → crear una tercera orden,
editarla (cambiar un valor de línea), guardarla → confirma que la vista
de recepción vuelve a mostrarse sin errores con los datos ya actualizados
(antes del fix, esto era exactamente lo que producía el `TypeError` de
arriba). Datos de prueba (3 órdenes: una recibida, una cancelada, una
editada) se quedaron en la base de dev — no hay acción de borrado de
órdenes por diseño, y no representan un problema real (mismo criterio ya
aplicado a otros artefactos de verificación en este proyecto).

## Cambios de Administración — Frente 5: variantes como tarjetas en Productos (rama `cambios-administracion`)

Cuarto frente del mismo plan, el más chico de los seis — un bug de UX
concreto que el usuario reportó con un ejemplo exacto: al editar un
producto (su ejemplo: Chocolates y Tés → Chai → Chai Caliente), elegir el
tamaño ("Chico") lo mandaba a un menú angosto a la izquierda en vez de
aparecer como tarjeta igual que el resto del drilldown de categoría →
producto — rompía la continuidad del patrón. `docs/CONTINUE.md` (sección
"Productos + POS 2") ya documentaba que `VariantNav` había quedado
deliberadamente sin ese rediseño cuando se introdujo `CategoryDrilldown` en
esa fase.

**`components/productos/variant-nav.tsx` borrado**, reemplazado por
`components/productos/variant-card.tsx` (`VariantCard`/`AddVariantCard`,
mismo lenguaje visual que `ProductCard`: `rounded-2xl`, `aspect-square`,
clic para abrir). En `productos-workspace.tsx`: el estado `"product-summary"`
se renombró a `"product-variants"` y ahora renderiza una grilla de
`VariantCard` (una tarjeta por tamaño/variante, con temperatura/precio/
badge de inactiva) en el área principal a todo lo ancho — ya no hay
columna lateral angosta de 192px. `"add-variant"`/`"edit-variant"` también
pasaron a ocupar todo el ancho, con un breadcrumb "← <nombre del
producto>" para volver a la grilla de variantes (en vez de que
`VariantNav` sirviera de nav lateral persistente en esas dos vistas
también). El breadcrumb "← Categorías" para volver del todo al drilldown
de categorías se mantiene igual que antes.

Verificado con Playwright siguiendo el **mismo path exacto que reportó el
usuario** (Chocolates y Tés → Chai → producto → tamaño): los 10 tamaños de
"Chai" aparecen como tarjetas en el área principal (Chico/Caliente,
Chico/Fría, Grande/Frappé, etc., cada una con su precio), clic en una
abre el formulario de edición de esa variante con el breadcrumb de
regreso, y el breadcrumb regresa limpiamente a la grilla de tarjetas. Sin
errores de consola — a diferencia de los Frentes 4 y 6, este no encontró
ningún bug de estado obsoleto nuevo (no hay ids que cambien entre
renders aquí, el riesgo de [[feedback-stale-state-mounted-dialogs]] no
aplicaba).

## Cambios de Administración — Frente 2: demografía + top de productos en Clientes (rama `cambios-administracion`)

Quinto frente del mismo plan. `Customer.birthDate` ya existía y ya se
capturaba en `CustomerForm` — la "edad" se deriva de ahí, sin campo nuevo.
Lo único que faltaba de verdad era género.

**Nuevo `Customer.gender`**: enum real `CustomerGender` (`FEMENINO`/
`MASCULINO`/`OTRO`), nullable — migración puramente aditiva
(`20260927212852_add_customer_gender`), los clientes existentes se quedan
sin dato. `CustomerForm` (`components/clientes/customer-form.tsx`) ganó un
select "Género (opcional, solo para estadísticas)" con una cuarta opción
"Prefiere no decir" (value `""`, no se manda).

**Bug real encontrado y corregido antes de que llegara a producción**
(por inspección de código, no en el navegador — ver nota de alcance más
abajo): `updateCustomer` (`actions/customers.ts`) hace **reemplazo
completo** del registro — necesario para que el formulario de
Administración pueda limpiar un campo (si no se reenvía `birthDate`, lo
pone en `null`). Pero `updateCustomer` también se llama desde
`components/pos/checkout-dialog.tsx` para un propósito totalmente
distinto: actualizar solo la dirección de entrega cuando el pedido es "A
domicilio". Ese call site nunca conocía `birthDate` (`CustomerOption`,
el tipo del picker de clientes en POS, no lo traía) — cualquier cajero
que corrigiera una dirección de entrega **le borraba la fecha de
nacimiento al cliente sin darse cuenta**, un bug ya latente desde que se
agregó la edición de domicilio en "Productos + POS 2", que iba a
empeorar al agregar género al mismo patrón. Corregido agregando
`birthDate`/`gender` a `CustomerOption` (`lib/customers.ts`,
`getCustomerOptions()`) y reenviándolos de vuelta en la llamada de
`checkout-dialog.tsx` — el registro sigue siendo reemplazo completo, pero
ahora el caller que no debería tocar esos campos los reenvía intactos en
vez de omitirlos.

**Top productos por cliente**: `getCustomerDetail` (`lib/customers.ts`)
ahora hace una segunda consulta (todo el historial de ventas
`COMPLETADA` del cliente, no solo las últimas 20 que se muestran en
"Historial de compras" — para que el ranking sea sobre el historial
completo) y agrega por `productVariantId` con el mismo patrón `Map`
de `getStatsReport` (`lib/reports.ts`), no un `groupBy` de Prisma. Nueva
tarjeta "Top productos" en `app/clientes/[id]/page.tsx`, antes del
historial existente (no lo reemplaza).

**Estadísticas de clientes**: nueva `getCustomerDemographics()`
(`lib/customers.ts`) — agrupa por rango de edad (6 buckets fijos más "Sin
dato", calculado desde `birthDate` al vuelo, sin guardar edad) y por
género (incluye "Sin dato" en vez de excluir clientes sin capturar, para
que el total siempre cuadre). Nueva página `/clientes/estadisticas`,
enlazada desde `/clientes` junto a "Códigos de descuento".

Verificado con Playwright + Postgres real: capturar fecha de nacimiento y
género en un cliente con historial de compras real → la tarjeta "Top
productos" del cliente refleja las cantidades correctas ordenadas de
mayor a menor → `/clientes/estadisticas` cuenta ese cliente en su bucket
de edad y género correctos, y a los demás clientes (sin dato) en "Sin
dato". **Alcance de la verificación**: el fix del bug de
`checkout-dialog.tsx` (birthDate/gender sobreviviendo una actualización de
domicilio) se verificó por inspección de código + `npm run typecheck`, no
completando una venta real "A domicilio" en el navegador — hubiera
requerido armar un carrito completo en POS solo para ese caso, y la
corrección en sí (reenviar dos campos que ya se leían del mismo objeto)
es de bajo riesgo una vez entendido cómo Prisma `update()` trata campos
ausentes vs. explícitos.

## Cambios de Administración — Frente 3: filtros avanzados en Reportes (rama `cambios-administracion`)

Sexto y último frente del plan original de "cambios de administración".

**`/reportes/estadisticas`** (`lib/reports.ts` `getStatsReport`, `app/
reportes/estadisticas/page.tsx`): tres agregaciones nuevas, mismo patrón
`Map` ya usado ahí para `dailySales`/`topProducts` —
- `hourlySales` (hora del día 0-23, **en UTC** — mismo criterio ya
  aceptado en este archivo para el bucketing por día
  (`toISOString().slice(0,10)`), se mantuvo consistente en vez de
  introducir una segunda convención de huso horario para esto).
- `channelSales` (agregado por `Sale.orderType` — "Mesa"/"Para llevar"/
  "A domicilio", mismas etiquetas que `cart-panel.tsx`). Simplificación
  consciente respecto al plan original: es un resumen por canal, no una
  matriz cruzada producto × canal — un cruce completo hubiera sido mucho
  más UI para una utilidad marginal a la escala actual.
- `sales` (detalle venta por venta del rango — ya se podía acotar a un
  solo día con `DateRangePicker` existente, from=to; lo que faltaba era
  poder ver el detalle, no solo el agregado de ese día).

Card nueva "Hora pico" en el resumen superior (el bucket de `hourlySales`
con más ventas).

**`/reportes/recetas`** (`getRecipeCostReport`): ganó un segundo parámetro
opcional `{categoryId?, temperature?}`, aplicado directamente en el
`where` de Prisma (antes no aceptaba ningún filtro, ni siquiera traía
categoría/temperatura en el `include`). Nuevo `components/reportes/
recipe-report-filters.tsx` (dos `<Select>`, mismo patrón de
`router.push` con `URLSearchParams` que `DateRangePicker`) — categorías
reales vía `getProductCategories()` (ya existente, usado en Productos),
temperatura contra los 3 valores del enum `VariantTemperature`. Cada
tarjeta de receta ahora muestra su categoría/temperatura como subtítulo,
antes no se mostraba en absoluto.

**Bug real encontrado y corregido, no introducido por este frente pero
sí por el anterior propio**: al verificar visualmente `/reportes/
estadisticas` apareció el indicador de "1 Issue" del overlay de dev de
Next — la consola tenía un error real de React: `Encountered two children
with the same key... Chai-Chico`. La lista "Productos más vendidos" usaba
`` `${productName}-${variantName}` `` como `key` en vez del
`productVariantId` único que la propia agregación ya traía como llave del
`Map` — dos variantes distintas con el mismo nombre de producto+variante
colisionaban. Se agregó `productVariantId` a `TopProductStat`
(`lib/reports.ts`) y se corrigió la key en la página. **Se encontró el
mismo patrón exacto, ya introducido por mí en el Frente 2** (`CustomerTopProduct`
en `lib/customers.ts`, la tarjeta "Top productos" de un cliente) — corregido
igual, agregando `productVariantId` ahí también. Ninguno de los dos había
tronado nada (React tolera keys duplicadas con una advertencia, no un
crash), pero sí era el tipo de bug que "puede causar que hijos se dupliquen
o se omitan" según la advertencia — se verificó explícitamente que la
consola queda limpia después del fix.

Verificado con Playwright + Postgres real contra datos ya existentes en
dev (ventas de sesiones anteriores): "Hora pico" calculado correctamente,
"Ventas por hora"/"Ventas por canal"/"Detalle de ventas" pobladas y
coherentes con el resumen superior; en `/reportes/recetas`, filtrar por
temperatura "Caliente" acotó la lista de 138 a 16 recetas. Sin errores de
consola tras el fix del key duplicado.

Con esto quedan cerrados los 6 frentes del plan de "cambios de
administración" (mergeado a `main` en el PR #16).

## Tema en el POS + cobro inline (rama `pos-tema-y-cobro-inline`)

El usuario probó el POS ya con Apariencia funcionando y encontró que
cambiar el color en Administración no se reflejaba ahí — más un color
libre (hex/color picker) en vez de las 5 paletas curadas, más poder
personalizar el color de fondo — y pidió dos cambios de flujo: que
"Cobrar" abra un panel inline debajo del botón, no un popup, y que el
cliente se escoja desde la comanda (debajo de Mesa/Para llevar/A
domicilio), no hasta entrar a cobrar.

**El acento no llegaba al POS — bug real, no solo falta de alcance**:
`components/pos/*` usaba `posAccentClass`/`posAccentBorderClass`
(`lib/utils.ts`), definidas como naranja fijo (`bg-orange-500`) **a
propósito** desde el reskin "Purr'Coffee" — el comentario original decía
explícitamente que no debían tocar `--primary` porque en ese momento no
existía ningún sistema de tema real que hubiera que respetar. Con
Apariencia ya construida, esa decisión quedó obsoleta: se redefinieron
esas dos constantes a `bg-primary`/`border-primary` — un cambio de una
línea que hace que todo `components/pos/*` (pastillas de tipo de venta,
botón Cobrar, tipo de leche, método de pago, etc.) seguido el acento
elegido en Apariencia, sin tocar los ~8 lugares que las usan.

**Acento y fondo como hex libre, no paleta cerrada** (`lib/theme.ts`):
`COLOR_PALETTES` (5 paletas curadas con variantes claro/oscuro a mano) se
reemplazó por hex libre + contraste calculado en código — `hexToHslString`
(conversión estándar RGB→HSL) y `contrastForegroundHsl` (luminancia
relativa WCAG: decide si el texto encima debe ser casi blanco o casi
negro, en vez de curar un "foreground" por cada color posible). Nuevo
`Branch.themeBackgroundColor` (columna aditiva, migración
`20260928020244_add_theme_background_color`) — cuando tiene valor,
sobreescribe `--background`/`--foreground`; cuando es `null`, el fondo
sigue siendo el que ya definía `mode` (claro/oscuro) en `app/globals.css`.
A propósito **no** se re-derivan `--muted`/`--border`/`--secondary` desde
el fondo custom — quedan atados a `mode`, para no requerir todo un
sistema de derivación de paleta neutra a partir de un solo hex.
`AppearanceForm` (`components/administracion/appearance-form.tsx`) ganó
un `<input type="color">` + campo de hex para el acento (con 5 sugerencias
rápidas, ya no una lista cerrada) y un checkbox "Personalizar color de
fondo" que revela el mismo patrón para el fondo.

**Cobro inline, sin `<Dialog>`** — refactor de `components/pos/`:
`checkout-dialog.tsx` (un `<Dialog>` centrado que hacía de todo: elegir
cliente, domicilio, descuento, método de pago, confirmar) se partió en
tres piezas:
- `customer-picker.tsx` (nuevo): búsqueda/selección/creación de cliente +
  domicilio (dirección/origen) — vive ahora en el header de `CartPanel`,
  debajo del selector Mesa/Para llevar/A domicilio, siempre visible sin
  necesidad de llegar a "Cobrar".
- `checkout-form.tsx` (nuevo): descuento/método de pago/total/confirmar —
  lo que antes era el cuerpo de `CheckoutDialog`. Recibe
  cliente/domicilio como props de solo lectura (`CartPanel` es quien los
  posee de verdad, porque `CustomerPicker` y `CheckoutForm` son hermanos
  que ambos los necesitan).
- `cart-panel.tsx` (reescrito): gana un estado `view: "cart" | "checkout"`
  — "Cobrar" ya no abre un diálogo, cambia `view` a `"checkout"`, lo que
  reemplaza la lista del carrito + su pie por `<CheckoutForm>` **en el
  mismo panel, en el mismo lugar de la pantalla** (con un botón "← Atrás"
  para volver). `pos-workspace.tsx` dejó de montar `<CheckoutDialog>`
  como hermano flotante — `CartPanel` ahora es autosuficiente para todo
  el flujo de cobro, solo necesita `customers` como prop (antes solo se
  la pasaban al diálogo).

Verificado con Playwright + Postgres real: cambiar el acento a azul
(`#1d4ed8`) + fondo a lavanda (`#eef2ff`) en Apariencia y confirmar que
`/pos` los refleja de inmediato (pastilla activa, botón Cobrar, fondo de
toda la pantalla — antes hubiera seguido naranja/blanco pase lo que
pase); confirmar que el campo de cliente ya aparece en la comanda sin
haber tocado "Cobrar"; completar una venta real de punta a punta
(agregar Malteada con sabor Chocolate, cobrar, confirmar) y verificar en
Postgres que la venta y sus modificadores quedaron correctos, sin ningún
`[role="dialog"]` abierto durante el cobro. Tema de prueba revertido a
los defaults (`#5a3a24`, sin fondo custom, claro) al terminar.

## Reestructuración de Administración — Frente A: Dashboard, Empleados y Configuración como secciones propias (rama `administracion-dashboard-y-menus`)

El usuario probó Administración ya con los 6 frentes anteriores y pidió
una reorganización grande: sacar Códigos de descuento y Estadísticas de
Clientes (nuevo módulo "Promociones" + Reportes rediseñado, ver plan
completo en el próximo frente), convertir `/administracion` en un
dashboard, y separar Empleados y Configuración/Apariencia en secciones de
menú propias — "como Clientes", ya no embebidas en la pantalla de
Administración. Se decidió (`AskUserQuestion`) que Promociones se
detecta y aplica sola en el POS (no solo un catálogo manual) y que el
Dashboard muestra KPIs del día + alertas — ver plan aprobado guardado en
esa conversación para el resto de los frentes (C: Descuentos, B:
Reportes, D: Promociones), este es solo el Frente A (navegación).

**`/empleados`** (nuevo, mismo patrón que `/clientes`): se movió
`app/administracion/nuevo` → `app/empleados/nuevo`,
`app/administracion/[employeeId]` → `app/empleados/[employeeId]`, y la
tarjeta "Empleados" de `app/administracion/page.tsx` se volvió
`app/empleados/page.tsx`. `components/administracion/employee-form.tsx`
→ `components/empleados/employee-form.tsx` (mismo componente, solo
`router.push` apunta a `/empleados`). `actions/employees.ts` sin cambios
de lógica, solo sus `revalidatePath("/administracion")` → `/empleados`.

**`/configuracion`** (nuevo): las tarjetas "Configuración" (% food cost)
y "Apariencia" se movieron a `app/configuracion/page.tsx` bajo un único
título "Configuración del sistema" — es el lugar donde, según el
usuario, caben más opciones de sistema en el futuro.
`components/administracion/{settings,appearance}-form.tsx` →
`components/configuracion/`, sin cambios internos.
`actions/settings.ts`: `revalidatePath("/administracion")` (en
`updateTargetFoodCostPercent`) → `/configuracion`; `updateAppearanceSettings`
sigue revalidando `"/", "layout"` (afecta toda la app, no solo esta
página).

**`/administracion` → Dashboard**: reescrito por completo. 3 KPIs del
día vía funciones que ya existían — `getStatsReport(inicio de hoy, fin de
hoy)` (`lib/reports.ts`) para ventas/ticket promedio, `getOpenShift`
(`lib/catalog.ts`, mismo helper que ya usa `/caja`) para el estado del
turno, `getInventoryOverview().filter(i => i.isLow)` (`lib/inventory.ts`,
mismo criterio que la tarjeta de stock bajo de `/compras`) para las
alertas. La grilla de accesos rápidos se mantiene (Clientes/Reportes/
Compras/Productos/Inventario) y gana Empleados/Configuración — Descuentos
y Promociones se agregan aquí cuando existan sus rutas (Frentes C/D).

**Sidebar/barra global**: `components/layout/sidebar.tsx` y
`session-bar.tsx` ganan entradas para Empleados y Configuración
(`adminOnly: true`, mismo patrón ya establecido) — Administración pasó a
usar el ícono `LayoutDashboard` en vez de `Settings` (que ahora es de
Configuración) y se reordenó primero dentro del bloque de admin (es la
página de aterrizaje/resumen, no un módulo más de la lista).

Verificado con Playwright + Postgres real (login como Ana): los 3 KPIs
del Dashboard muestran datos reales (turno abierto MATUTINO, 0 ventas de
hoy — correcto, no se hizo venta de prueba ese día), `/empleados` lista
los 8 empleados reales y el CRUD completo funciona (se creó "QA Frente
A", se verificó que aparece, se desactivó como limpieza), `/configuracion`
carga ambas tarjetas (food cost e input de apariencia) sin errores de
consola. `npm run typecheck` limpio.

## Reestructuración de Administración — Frente C: Códigos de descuento como módulo propio de menú (rama `administracion-dashboard-y-menus`)

Segundo frente del mismo plan grande que el Frente A (ver esa sección
arriba para contexto completo). Códigos de descuento deja de vivir
dentro de Clientes (`/clientes/descuentos`) y se vuelve un módulo de
menú propio (`/descuentos`), con diseño de tarjetas + filtros — el mismo
patrón que se usará para Promociones en el Frente D.

**Schema**: nuevo enum `DiscountCodeCategory` (`CLIENTE_ESPECIFICO`,
`CAMPANA`, `EMPLEADO`) + `DiscountCode.category` (nullable — los códigos
ya sembrados, como los cupones de bienvenida, quedan "sin categoría"
hasta que alguien la asigne desde la UI). Migración aditiva
(`20260930025655_add_discount_code_category`). Nota importante ya
documentada en el plan: esto es un mecanismo **nuevo y paralelo** a
`ManualDiscountReason.DESCUENTO_EMPLEADO` (un descuento autorizado con
PIN en el momento del cobro) — no se tocó.

**`lib/discounts.ts`**: `getDiscountCodes()` gana `category` en el tipo
de retorno. **`actions/discounts.ts`**: `createDiscountCode` gana
`category` opcional; nueva `updateDiscountCode` (antes solo existía
`toggleDiscountCodeActive`, que se reemplazó por una edición completa —
código, tipo, valor, expiración, categoría e isActive en un solo save,
mismo patrón que `updateIngredient`). `revalidatePath` de ambas apunta a
`/descuentos` en vez de `/clientes/descuentos`.

**`/descuentos`** (nuevo, reemplaza `/clientes/descuentos`, que se
borró junto con sus componentes `discount-code-form.tsx`/
`discount-code-toggle.tsx`): `DiscountCodesWorkspace`
(`components/descuentos/discount-codes-workspace.tsx`, client) con
barra de búsqueda (por código), filtro de estado (activo/inactivo/todos)
y filtro de categoría (las 3 + "todas") — los 3 filtros se aplican en
memoria sobre la lista ya cargada. Tarjetas (`DiscountCodeCard`,
`rounded-2xl`, mismo lenguaje visual que `ProductCard`/`VariantCard`):
código, tipo+valor, badge activo/inactivo, categoría. Clic en una
tarjeta abre `DiscountCodeFormDialog` — un solo diálogo para crear y
editar (mismo patrón de resincronización por `useEffect` cuando `open`
pasa a true que `IngredientFormDialog`, para no repetir el bug de estado
obsoleto ya encontrado dos veces antes en Inventario/Compras).

**Sidebar/barra global**: nueva entrada "Códigos de descuento"
(`/descuentos`, ícono `Tag`) entre Clientes y Reportes. El link
"Códigos de descuento →" se quitó de `/clientes` (Estadísticas se queda
ahí por ahora — se mueve a Reportes en el Frente B). El Dashboard
(`/administracion`) ganó una tarjeta de acceso rápido a Descuentos.

**Verificado con Playwright + Postgres real**: se crearon 3 códigos de
prueba (uno por categoría), se confirmó que los 3 filtros (búsqueda,
estado, categoría) acotan la grilla correctamente por separado; se
editó uno a inactivo y se confirmó que aparece en el filtro
"Inactivos"; se aplicó un código de prueba en el checkout real de
`/pos` (agregar Malteada, "Cobrar" → "Código" → validar) y se confirmó
que el descuento se calculó y mostró igual que antes (`findDiscountCodeByCode`
no se tocó). Los 3 códigos de prueba quedaron desactivados al terminar
(no hay borrado de `DiscountCode`, mismo criterio que antes — tiene
`Sale[]` como relación). `npm run typecheck` limpio.

## Reestructuración de Administración — Frente B: Reportes consolidado con submenú lateral (rama `administracion-dashboard-y-menus`)

Tercer frente del mismo plan grande (ver Frente A para contexto). Las 4
rutas sueltas de Reportes (`/reportes/utilidad`, `/recetas`,
`/inventario`, `/estadisticas`, cada una con su propio `AuthenticatedShell`)
se consolidan en **una sola ruta** `/reportes?view=utilidad|recetas|
inventario|estadisticas|clientes`, con un submenú fijo a la izquierda
(mismo lenguaje visual que `Sidebar` — pastilla activa — pero es
navegación de secciones dentro de una ruta, no tarjetas de selección
como Productos/Inventario). A diferencia de esos dos módulos (que
cargan todo el catálogo de una vez y cambian de vista sin red), cada
reporte es una agregación cara con su propio rango de fechas, así que
**solo se hace fetch del reporte activo**, no los 5 de una vez.

**Estadísticas de Clientes se mudó aquí** como una 5ª vista
("Clientes"): `app/clientes/estadisticas/page.tsx` se borró,
`getCustomerDemographics()` (`lib/customers.ts`, ya existía, autocontenido)
ahora se llama desde `app/reportes/page.tsx`. El link "Estadísticas →"
se quitó de `/clientes`.

**Archivos**: `app/reportes/page.tsx` reescrito por completo — resuelve
`view` de `searchParams` (default `"utilidad"`, valida contra un
`Set` cerrado), calcula qué vistas son visibles según los mismos 3
permisos que ya filtraban la grilla de tarjetas anterior
(`REPORTE_UTILIDAD_VER` → Utilidad+Recetas, `REPORTE_INVENTARIO_VER` →
Inventario, `ESTADISTICAS_GESTIONAR` → Estadísticas+Clientes), redirige a
`/pos` si el empleado no tiene ningún permiso o pide una vista sin
acceso, y solo entonces hace el fetch del reporte activo. Nuevo
`components/reportes/reportes-nav.tsx` (el submenú, server component —
no hace falta `usePathname` en cliente porque `active` ya se resuelve
en el server desde `searchParams`). El JSX de contenido de cada una de
las 4 páginas viejas se volvió un componente reusable
(`components/reportes/{utilidad,recetas,inventario,estadisticas,clientes}-report.tsx`),
sin cambios de lógica, solo extraídos de su antiguo `page.tsx`.

**Bug evitado antes de que pasara**: `DateRangePicker` y
`RecipeReportFilters` (ambos ya existían) reconstruían
`URLSearchParams` desde cero al aplicar un filtro — en las páginas
sueltas de antes no importaba porque no había ningún otro parámetro que
preservar, pero consolidadas en una sola ruta con `?view=`, cambiar de
fecha o de categoría/temperatura habría hecho perder la vista activa
(volver siempre a Utilidad). Los dos componentes ganaron una prop
opcional `view` que se agrega al `URLSearchParams` antes de navegar.

**Verificado con Playwright + Postgres real**: las 5 vistas cargan sus
datos reales (Utilidad con 32 transacciones reales, Clientes con 7
clientes reales — mismos números que mostraba `/clientes/estadisticas`
antes de moverse); cambiar de vista por el submenú funciona; cambiar el
rango de fechas en Estadísticas y el filtro de temperatura en Recetas
**preservan** `view=` en la URL (no vuelven a Utilidad). `npm run
typecheck` limpio, sin errores de consola.

## Reestructuración de Administración — Frente D: Promociones con aplicación automática en el POS (rama `administracion-dashboard-y-menus`)

Último y más grande de los 4 frentes del plan (ver Frente A para contexto
completo). Nuevo módulo **Promociones** (`/promociones`): Paquetes precio
reducido (revive `Combo`/`ComboItem`, que existían en el schema desde
antes sin implementarse), 2x1 y Día temático (modelo `Promotion` nuevo) —
las 3 se **detectan y aplican solas en el POS**, no son solo un catálogo
que el cajero activa a mano (decisión confirmada con el usuario antes de
planear).

### D1 — Schema

`Combo` ganó `daysOfWeek Int[]`/`startTime`/`endTime` (mismo shape en
los 3: vacío/null = siempre). Nuevo enum `PromotionCategory`
(`DOS_POR_UNO`/`DIA_TEMATICO`) + modelos `Promotion`/`PromotionVariant`
(ver schema para el detalle completo, documentado también en el plan
original de esta reestructuración). Nuevo permiso `PROMOCION_GESTIONAR`
(agregado a `gerentePermissionsPropios` en `prisma/seed.ts`, mismo nivel
que `DESCUENTO_CODIGO_CREAR` — GERENTE lo tiene a nivel de permiso
aunque hoy solo ADMINISTRADOR llega a la página). Migración aditiva
(`20261001015227_add_promotions_module`), seed re-corrido para sincronizar
`RolePermission`.

### D2 — CRUD (`lib/promotions.ts`, `actions/promotions.ts`, `/promociones`)

Mismo patrón que Descuentos (Frente C): `PromocionesWorkspace` con
búsqueda + filtro activo/inactivo + filtro de categoría (Paquetes/2x1/Día
temático), tarjetas `rounded-2xl`. Un combo/promoción no se puede borrar
(`Combo`/`Promotion` tienen `SaleItem[]`/referencias históricas), solo
desactivar — mismo criterio que `DiscountCode`. 3 botones de creación
("+ Paquete"/"+ 2x1"/"+ Día temático") en vez de un selector de categoría
dentro del formulario, porque cada categoría pide campos distintos.
Nuevo `components/promociones/`: `days-of-week-picker.tsx` (toggle de 7
días, vacío = "todos"), `combo-items-editor.tsx` (líneas producto+cantidad,
mismo patrón que `RecipeLinesEditor`), `variant-multi-picker.tsx`
(checkboxes para elegir qué productos califican), `combo-form-dialog.tsx`/
`promotion-form-dialog.tsx` (crear/editar en un solo diálogo, resync por
`useEffect` igual que `IngredientFormDialog`).

**Bug real encontrado durante la verificación**: dos variantes del mismo
producto pueden compartir nombre y diferir solo en temperatura (ej.
"Americano Chico" Caliente vs. Frío) — el selector de variantes era
ambiguo sin mostrarla. `lib/promotions.ts` ahora arma
`"{nombre} — {temperatura}"` cuando aplica (`variantDisplayName`),
usado en `getVariantOptions`/`getCombos`/`getPromotions` por igual.

### D3 — Aplicación automática en `actions/pos.ts` (la parte de más riesgo)

Nueva `applyPromotions(tx, saleItemsData, now)`, llamada al final de
`resolveSaleItems` (después de resolver las líneas normales, antes de
devolver el subtotal) — afecta por igual a `createSale`, `openTab`,
`addItemsToTab` y `closeTab` (última ronda), que ya comparten
`resolveSaleItems`. `isPromotionActiveNow(daysOfWeek, startTime, endTime,
now)` evalúa día de la semana + minutos-desde-medianoche, sin manejo de
zona horaria especial (hora del servidor).

**Orden de precedencia, cada línea recibe como máximo una promoción**:
Paquetes primero (match exacto `productVariantId`+`quantity` contra
`ComboItem[]`, nunca se parte una línea — alcance explícito; combos
activos ordenados por mayor descuento primero; reparto del precio del
combo proporcional al precio normal de cada línea, el último renglón
absorbe el redondeo para que la suma sea exacta), luego 2x1
(`lineTotal = unitPrice × ceil(quantity/2)`), luego Día temático
(`computeDiscount` existente, aplicado por línea, con clamp a 0 por si
un descuento mal configurado superara el precio). `SaleItem.comboId`
(ya existía en el schema) se persiste para Paquetes.

**Bug real encontrado y corregido en la propia verificación — importante**:
la primera versión descalificaba cualquier línea con **algún**
modificador, literal del plan ("un renglón modificado no califica"). Pero
"Tipo de leche" con su opción base ("Entera", `priceDelta=0`, sin
sustituir ingrediente) se preselecciona automáticamente en casi toda
bebida con leche — con la regla literal, un Latte **nunca** podría
calificar para nada, ni pidiéndolo tal cual, lo cual contradice el propio
pedido original del usuario ("Jueves de Latte el segundo al 50%" es su
ejemplo textual de Día temático). Se corrigió: una línea descalifica solo
si tiene un modificador con `priceDelta != 0` (un cambio real de precio/
receta), no por tener seleccionada la opción base gratuita por default.

**Bug real encontrado y corregido — el checkout del POS no sabía de
promociones**: `components/pos/cart-store.ts` calcula el subtotal
mostrado en el carrito sumando `quantity × unitBasePrice` del lado del
cliente — nunca llamaba al servidor, así que Paquetes/2x1/Día temático
nunca se reflejaban en el total que veía el cajero ni en el monto que
capturaba como pago, y `createSale` rechaza la venta si el pago no
coincide EXACTO con el total real. Se agregó `previewSaleTotal`
(`actions/pos.ts`, de solo lectura — llama a `resolveSaleItems` con el
cliente de Prisma normal, sin transacción, porque esa función nunca
escribe) y `checkout-form.tsx` ahora lo consulta cada vez que cambia el
carrito, mostrando el total server-verificado en vez del cálculo naive
(con un estado "Calculando total..." que deshabilita "Confirmar venta"
hasta tener el valor real). La vista previa del descuento de código/
manual también se corrigió para calcularse sobre el subtotal
"descontable" (sin las líneas ya promocionadas), no el subtotal completo
— si no, el cajero vería un descuento más generoso del que el servidor
en realidad aplica.

**Regla de "no apilar" (mutua exclusión por línea) con DiscountCode/
ManualDiscount**: `resolveSaleItems` ahora regresa también
`discountableSubtotal` (la suma de `lineTotal` de las líneas que NO
recibieron una promoción automática) — `createSale` calcula el
descuento de código/manual sobre esa base, no sobre el subtotal
completo. Para `closeTab` (cuenta abierta con varias rondas ya
persistidas), no hace falta una columna nueva: nueva
`computeDiscountableSubtotal(tx, saleId)` re-deriva qué `SaleItem`s ya
persistidos recibieron una promoción sin necesitar un flag propio — un
`SaleItem` con `comboId` seteado, o cuyo `lineTotal` ya no es
`unitPrice × quantity` (la única forma en que eso pasa para una línea sin
modificadores que sumen precio), ya fue tocado por una promoción.

**Verificado con Playwright + Postgres real** (5 escenarios, cada uno
confirmado tanto en el total mostrado en el checkout como en el
`SaleItem` persistido): Paquete activo (Americano Chico + Macaron, $45 →
$40, `comboId` seteado en ambas líneas, reparto 24/16 proporcional al
precio normal 27/18); 2x1 activo (Espresso Doble ×3 → se cobran 2,
$93 → $62); Día temático activo (Cortado Sencillo con leche "Entera" por
default, 20% off, $32 → $25.60, confirmando que el modificador gratis no
descalifica); 2x1 **fuera** de su día (`daysOfWeek` sin hoy) → precio
normal sin cambios; combinación 2x1 + código de descuento 10% en el
mismo carrito (Espresso Doble ×2 promocionado + Americano sin promoción)
→ el código **solo** descontó sobre la línea sin promoción ($55.30, no
$52.20 que hubiera salido si se apilara). Las promociones/combos/código
de prueba quedaron desactivados al terminar (no hay borrado, mismo
criterio que `DiscountCode`) — las 5 ventas de prueba quedaron
registradas en la base de datos local (no existe cancelar/borrar venta
todavía, ver simplificaciones abajo), visibles en Reportes con el
prefijo "QA" en sus líneas.

### Simplificaciones de alcance de este frente (documentadas también en el plan original)

- Sin manejo de zona horaria especial para día/hora de promociones — hora
  del servidor, igual que el resto del sistema.
- Paquetes: match exacto de línea completa (`productVariantId`+`quantity`
  idénticos a un `ComboItem`) — una línea con modificadores/extras nunca
  califica, y no se "parte" una línea más grande de lo que el combo pide
  (ej. un combo que pide 1 café no se arma a partir de una línea de 2
  cafés) — extensión posible a futuro, no bloqueante hoy.
- Una línea califica para como máximo una promoción automática (sin
  combinarlas entre sí).
- Paquetes/2x1/Día temático se resuelven **por ronda** — una cuenta
  abierta (Mesa) con varias rondas no combina líneas de rondas distintas
  para armar un paquete (cada ronda llama a `resolveSaleItems` por
  separado, igual que ya pasa con recetas/consumo de inventario).
- `updateTabItemQuantity`/`removeTabItem` (ajustar/quitar un producto ya
  registrado en una cuenta abierta) no re-evalúan promociones — ajustan
  el `lineTotal` persistido directamente vía `unitPrice × quantity` nueva,
  sin pasar por `applyPromotions`. Si la línea ajustada ya tenía una
  promoción (ej. un paquete), el ajuste la ignora. No es un caso nuevo:
  es la misma limitación que ya existía (sin alcance) para `comboId`
  desde que el campo se agregó al schema, nunca implementado hasta este
  frente. Vale la pena resolverlo si el negocio ajusta cantidades de
  líneas promocionadas con frecuencia.
- Sin UI para que el cajero vea/entienda **por qué** un precio bajó en el
  carrito antes de cobrar (sí ve el total correcto, ver bug de
  `previewSaleTotal` arriba) — no hay un badge "2x1 aplicado" junto a la
  línea. El ticket final tampoco lo explica hoy. Vale la pena preguntarle
  al usuario si hace falta antes de darlo por definitivo.
- Sigue sin existir cancelar/anular una venta ya completada
  (`VENTA_CANCELAR` es un permiso reservado, sin acción implementada,
  documentado desde antes de este frente) — las ventas de prueba de la
  verificación de este frente quedaron en la base de datos real.

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
   `pos-mejoras-avanzadas`, `modulo-productos`, `productos-pos-mejoras-2`,
   `cuentas-abiertas-editar-items`, `tarjeta-lealtad-publica`) a `main`
   si no se han mergeado ya.
7.1. **Cuando el negocio tenga las cuentas**, conectar lo que quedó
   listo para eso: WhatsApp Business API (reemplazar el link `wa.me`
   manual por envío automático al crear el cliente), Apple Developer
   Program + certificado Pass Type ID (generar un `.pkpass` real que
   enlace a la misma info de `/lealtad/[code]`), Google Wallet Console
   (mismo caso). Ver sección "Tarjeta de lealtad pública" para el
   detalle de qué falta de cada uno.
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
- **Apariencia global (color/tipografía/tamaño/modo) vive en `lib/theme.ts`
  + `Branch.theme*`, nunca hardcodeada en un componente**: cualquier UI
  nueva debe usar las clases de token existentes (`bg-primary`,
  `text-foreground`, `border-border`, `rounded-md`/`rounded-lg` atados a
  `var(--radius)`, etc.) en vez de colores/radios sueltos, para que
  quede bajo el control de Administración → Apariencia. Si hace falta
  una opción nueva (una paleta, una fuente), agregarla a los registros
  de `lib/theme.ts` (`COLOR_PALETTES`/`FONT_FAMILIES`/`FONT_SIZES`) y a
  `lib/fonts.ts` si es tipografía — nunca aceptar un string libre desde
  el cliente para estas claves.
