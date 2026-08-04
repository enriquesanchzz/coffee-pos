# Roadmap — Nomada Café POS

El proyecto se construye en fases incrementales. Cada fase se apoya en el
modelo de datos definido desde Fase 0 (ver `docs/adr-nomada-pos.md`), sin
migraciones destructivas entre fases.

| Fase | Nombre | Alcance | Estado |
|---|---|---|---|
| 0 | Modelo de datos | Schema Prisma completo (27 modelos), catálogo de permisos, seed de roles, migración inicial. | ✅ Completa — commit `8294475` |
| 1 | MVP operativo | POS (venta + descuento de inventario por receta), Caja (turnos), Inventario básico. | 🟡 En progreso — schema ajustado en `a9fac16`/`7745e6e`. Módulo **POS** construido (ver `docs/pos-module.md`). Módulo **Caja** completo e **Inventario** (UI de consulta/ajuste) pendientes. |
| 2 | Cadena de suministro | Compras: proveedores, órdenes de compra, recepción de mercancía, transferencias entre sucursales, conteos físicos. | ⚪ Pendiente — modelos ya existen en el schema (`Supplier`, `PurchaseOrder`, `TransferManifest`, `PhysicalCount`, etc.), falta UI y lógica de aplicación. |
| 3 | Business Intelligence | Reportes de utilidad, costo de recetas en el tiempo, reportes de inventario, estadísticas consolidadas. | ⚪ Pendiente — soportado por `RecipeCostHistory` / `IngredientCostHistory`, que ya capturan el historial necesario. |
| 4 | Retención de clientes | Programa de lealtad (sellos, niveles), códigos de descuento. | ⚪ Pendiente — modelos `Customer`, `LoyaltyCard`, `LoyaltyTier`, `DiscountCode` ya existen en el schema. |
| 5 | Multi-sucursal | Habilitar selección de sucursal en la UI, reportes consolidados (`REPORTE_CONSOLIDADO_VER`), gestión de sucursales (`SUCURSAL_GESTIONAR`). | ⚪ Pendiente — el modelo ya es multi-sucursal desde Fase 0; falta remover el `DEFAULT_BRANCH_ID` hardcodeado y construir la UI de selección/gestión. |

## Qué falta para cerrar Fase 1

Ver el detalle completo y accionable en `docs/CONTINUE.md`. En resumen:

1. Módulo **Caja**: apertura/cierre con doble confirmación, cortes de caja,
   registro de retiros/ingresos (`CashMovement`). Hoy el POS solo abre un
   turno mínimo si no hay uno abierto — no hay flujo de cierre.
2. Módulo **Inventario**: pantallas de consulta de stock, ajustes manuales,
   alertas de caducidad (`IngredientBatch.expirationDate`).
3. **Administración**: autenticación real (reemplazar el selector de
   empleado por PIN con Supabase Auth u otro proveedor), gestión de
   empleados/roles/permisos desde UI.
4. UI para crear/editar recetas (`Recipe`/`RecipeVersion`/`RecipeIngredient`)
   — hoy solo se pueden crear vía seed/Prisma Studio.
