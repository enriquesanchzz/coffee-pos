# Módulo POS

Cubre el flujo de venta en piso: entrar como empleado, abrir turno si hace
falta, armar la cuenta desde el catálogo, y cobrar. Es el primer módulo de
Fase 1 (ver `docs/roadmap.md`).

## Flujo de pantallas

1. **`/` — Selector de empleado por PIN** (`components/pos/login-form.tsx`,
   acción `loginWithPin` en `actions/session.ts`). Si ya hay sesión, redirige
   directo a `/pos`.
2. **`/pos`** (`app/pos/page.tsx`, server component):
   - Si el empleado no tiene sesión, redirige a `/`.
   - Busca si hay un `Shift` `ABIERTO` en la sucursal (`lib/catalog.ts` →
     `getOpenShift`). Si no hay uno, muestra `ShiftOpenForm` (apertura
     mínima: tipo de turno + fondo de caja).
   - Si hay turno abierto, carga el catálogo (`getCatalog`) y renderiza
     `PosWorkspace`.
3. **`PosWorkspace`** (`components/pos/pos-workspace.tsx`, client): combina
   `CatalogBrowser` (categorías → productos), `ProductDialog` (elegir
   variante + modificadores y agregar al carrito), `CartPanel` (la cuenta
   actual, usando el store de Zustand) y `CheckoutDialog` (cobrar).

## Sesión (`lib/session.ts`)

Selector de empleado por PIN guardado en una cookie `httpOnly`. **No es
autenticación real**: el PIN se compara en texto plano contra
`Employee.pin`, no hay expiración más allá de 12h, y la cookie no está
firmada. Es un placeholder suficiente para operar en piso mientras se
construye el módulo de Administración — ahí debe sustituirse por un
proveedor real (Supabase Auth, según el ADR). El modelo de roles/permisos
(`Role`, `RolePermission`, `EmployeePermissionOverride`) ya existe desde
Fase 0 y no depende de este mecanismo de sesión.

## Catálogo (`lib/catalog.ts`)

`getCatalog(branchId)` trae categorías → productos activos y habilitados en
esa sucursal (`BranchProduct.isActive`) → variantes activas → grupos de
modificadores con sus opciones, todo en una sola consulta con `include`
anidado. La sucursal es fija (`DEFAULT_BRANCH_ID` en `lib/constants.ts`)
hasta Fase 5 (multi-sucursal) — ver la decisión en el ADR.

## Carrito (`components/pos/cart-store.ts`)

Store de Zustand, **solo en memoria del cliente** (se pierde al recargar la
página — es intencional, es el estado de una venta en curso, no algo que
deba persistir). Agrupa automáticamente líneas con la misma variante +
mismo conjunto exacto de modificadores, sumando cantidad en vez de duplicar
la línea.

## Venta (`actions/pos.ts` → `createSale`)

El corazón del módulo. Todo corre dentro de una transacción de Prisma:

1. Valida que `shiftId` corresponda a un turno `ABIERTO` de la sucursal.
2. Por cada línea del carrito: recalcula el precio en el servidor (no
   confía en el precio calculado en el cliente) sumando
   `ProductVariant.price` + `ModifierOption.priceDelta` de los modificadores
   seleccionados.
3. Resuelve la receta activa de la variante (`Recipe` con
   `kind = PRODUCTO_VENDIBLE` → su `RecipeVersion` con `isActive = true`) y
   acumula el consumo de ingredientes de forma **recursiva**: si una línea
   de receta apunta a `composedRecipeId` (ej. un jarabe casero, que es una
   `Recipe` con `kind = INGREDIENTE_COMPUESTO`), se resuelve esa receta
   también, multiplicando cantidades. Esto es literalmente ADR-001 aplicado
   en código.
4. Convierte cada cantidad a la unidad base del ingrediente
   (`Ingredient.baseUnit`) usando `UnitConversion` cuando la unidad de la
   receta es distinta — y falla explícitamente si falta la conversión, en
   vez de descontar mal el inventario en silencio.
5. Crea `Sale`, `SaleItem`, `SaleItemModifier` y `SalePayment` en una sola
   escritura anidada de Prisma.
6. Por cada ingrediente consumido (agregado para toda la venta, no por
   línea), hace `upsert` sobre `InventoryStock` y registra un
   `InventoryMovement` tipo `VENTA`.
7. Verifica que la suma de `payments` coincida con el total antes de
   confirmar.

### Simplificaciones conocidas de este MVP

Documentadas también como comentarios en `actions/pos.ts`:

- **Sin impuestos ni descuentos todavía** — `total = subtotal`. La
  configuración de impuestos es parte de Fase de Administración
  (`CONFIGURACION_SISTEMA_GESTIONAR`).
- **`ModifierOption.isSubstitution`** se trata igual que un extra normal
  (se suma al consumo); no se resta el ingrediente base que sustituye
  porque el schema no define explícitamente cuál línea de la receta
  corresponde reducir. Falta una decisión de producto antes de
  implementarlo.
- **`SaleItemIngredientAdjustment`** (ajustes libres QUITAR/AUMENTAR/
  AGREGAR_EXTRA fuera de los modificadores curados) existe en el modelo
  pero no está expuesto en la UI.
- **Pagos:** el modelo soporta pagos divididos (`SalePayment[]`), pero el
  checkout de la UI hoy solo permite un método por venta.
- El `InventoryMovement` de una venta se registra **una vez por
  ingrediente para toda la venta**, no una vez por línea — por eso no se
  liga a `relatedSaleItemId`. Si se necesita trazabilidad por línea más
  adelante, hay que desagregar esta parte.
- **Cancelación de venta** (`VENTA_CANCELAR`, reintegro de inventario según
  `Product.isPerishable`) no está implementada — solo existe el permiso en
  el catálogo de roles.

## Turno (`actions/shift.ts`)

`openShift` crea un `Shift` mínimo (sin doble confirmación) para poder
cumplir con `Sale.shiftId` (obligatorio). El módulo de Caja real —
apertura/cierre con doble confirmación, cortes de caja,
`CashMovement` (retiros/ingresos) — todavía no existe. Ver
`docs/roadmap.md` y `docs/CONTINUE.md`.

## UI (`components/ui/*`)

Componentes propios con apariencia shadcn/ui (mismas convenciones de
`className`, mismo look), pero **sin Radix**: son controlados a mano
(`Dialog` es un modal simple, no un portal con manejo de foco). Suficiente
para lo que el POS necesita hoy. El día que se necesite algo más complejo
(menús anidados, popovers, combobox) migrar a shadcn/Radix real — ya
contemplado en el ADR de stack, no es un cambio de dirección.
