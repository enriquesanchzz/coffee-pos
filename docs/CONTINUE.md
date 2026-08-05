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
| Módulo **Caja** (doble confirmación de apertura/cierre, corte, retiros/ingresos) | ✅ Construido en rama `feature/modulo-caja`. Sin chequeo de permisos todavía (ver nota abajo). |
| Módulo **Inventario** (consulta, ajustes, alertas de caducidad) | ⚪ No construido. |
| Módulo **Compras** (Fase 2) | ⚪ No construido. Modelos ya existen en el schema. |
| Módulo **Reportes** (Fase 3) | ⚪ No construido. |
| **Administración** (auth real, gestión de empleados/roles) | ⚪ No construido. Sesión actual es un placeholder por PIN. |
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

## Próximos pasos recomendados (en orden)

1. **Inventario**: al menos consulta de stock y ajuste manual. El módulo
   Caja ya cubre apertura/cierre de turno con doble confirmación.
2. **UI de recetas**: hoy `Recipe`/`RecipeVersion`/`RecipeIngredient` solo
   se crean vía seed/Prisma Studio. Para que el cliente pueda dar de alta
   un producto nuevo sin tocar código, hace falta una pantalla (probablemente
   parte de Administración).
3. **Administración con auth real**: reemplazar `lib/session.ts` por
   Supabase Auth (o el proveedor que se decida), conectando con el modelo
   de roles/permisos que ya existe. Mientras esto no exista, no usar este
   POS con dinero real sin supervisión — el PIN no es un mecanismo de
   seguridad.
4. **Fase 2 (Compras)**: los modelos (`Supplier`, `PurchaseOrder`,
   `TransferManifest`, `PhysicalCount`) ya están en el schema; falta
   construir la UI y las Server Actions, siguiendo el mismo patrón que
   `actions/pos.ts` (transacciones, validación server-side).
5. Resolver las simplificaciones documentadas en
   `docs/pos-module.md` (impuestos, sustituciones de ingrediente, pagos
   divididos en la UI, cancelación de venta) según prioridad de negocio.

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
