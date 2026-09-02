# Roadmap — Nomada Café POS

El proyecto se construye en fases incrementales. Cada fase se apoya en el
modelo de datos definido desde Fase 0 (ver `docs/adr-nomada-pos.md`), sin
migraciones destructivas entre fases.

| Fase | Nombre | Alcance | Estado |
|---|---|---|---|
| 0 | Modelo de datos | Schema Prisma completo (27 modelos), catálogo de permisos, seed de roles, migración inicial. | ✅ Completa — commit `8294475` |
| 1 | MVP operativo | POS (venta + descuento de inventario por receta), Caja (turnos), Inventario básico, UI de recetas, Administración (auth + permisos reales). | ✅ Completa — ver `docs/CONTINUE.md` para el detalle de cada módulo. |
| 2 | Cadena de suministro | Compras: proveedores, órdenes de compra, recepción de mercancía, transferencias entre sucursales, conteos físicos. | ✅ Completa — ver `docs/CONTINUE.md` para el detalle de cada pieza. |
| 3 | Business Intelligence | Reportes de utilidad, costo de recetas en el tiempo, reportes de inventario, estadísticas consolidadas. | ⚪ Pendiente — soportado por `RecipeCostHistory` / `IngredientCostHistory`, que ya capturan el historial necesario. |
| 4 | Retención de clientes | Programa de lealtad (sellos, niveles), códigos de descuento. | ⚪ Pendiente — modelos `Customer`, `LoyaltyCard`, `LoyaltyTier`, `DiscountCode` ya existen en el schema. |
| 5 | Multi-sucursal | Habilitar selección de sucursal en la UI, reportes consolidados (`REPORTE_CONSOLIDADO_VER`), gestión de sucursales (`SUCURSAL_GESTIONAR`). | ⚪ Pendiente — el modelo ya es multi-sucursal desde Fase 0; falta remover el `DEFAULT_BRANCH_ID` hardcodeado y construir la UI de selección/gestión. |

## Fase 1 — cerrada

Los 5 pendientes que tenía Fase 1 ya están construidos y verificados
end-to-end contra Postgres real (detalle en `docs/CONTINUE.md`):

1. ~~Módulo **Caja**~~ — apertura/cierre con doble confirmación, cortes,
   retiros/ingresos.
2. ~~Módulo **Inventario**~~ — consulta de stock y ajuste manual.
3. ~~UI de **recetas**~~ — alta de producto completo (variantes + receta) y
   edición versionada, sin tocar código.
4. ~~**Administración**~~ — login real (PIN hasheado + password para
   Administración, sesión firmada con `iron-session`), gestión de
   empleados/roles desde UI, y chequeo real de permisos activado en Caja,
   Inventario, Recetas y POS usando la matriz de `prisma/seed.ts`.

Nota: la auth real se construyó **sin Supabase** (decisión explícita — no
había proyecto configurado, ver `docs/CONTINUE.md`), sobre hashing propio
(`scrypt`) y sesión firmada. Sigue siendo compatible con migrar a Supabase
Auth más adelante si se decide adoptarlo, sin rehacer el modelo de datos.

## Fase 2 — cerrada

Las 3 piezas de Compras ya están construidas y verificadas end-to-end
contra Postgres real (detalle en `docs/CONTINUE.md`):

1. ~~**Proveedores + Órdenes de compra**~~ (rama `feature/modulo-compras`,
   PR #3) — alta de proveedor con costo cotizado por ingrediente, crear una
   orden, recibirla (total o parcial) genera `IngredientBatch`, sube
   `InventoryStock`, y si el costo real difiere del cotizado actualiza
   `IngredientSupplier.cost` dejando rastro en `IngredientCostHistory`.
2. ~~**Transferencias entre ubicaciones**~~ (rama
   `feature/modulo-transferencias-conteos`) — `ENVIADO -> EN_TRANSITO ->
   RECIBIDO`, el inventario sale de origen solo al pasar a tránsito y llega
   a destino solo al recibirse; una discrepancia genera `MERMA` automática.
3. ~~**Conteos físicos**~~ (misma rama) — captura de cantidad física vs.
   teórica, con doble confirmación por PIN (empleado distinto de quien
   contó) antes de ajustar `InventoryStock` y registrar
   `CONTEO_FISICO_AJUSTE`.

Próximo: **Fase 3 — Business Intelligence** (Reportes).
