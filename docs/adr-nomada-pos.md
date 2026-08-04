# ADR-001 — Arquitectura base de Nomada Café POS

**Estado:** Aceptado
**Contexto del negocio:** Nomada Café necesita un POS local para su cafetería,
diseñado desde el día uno para poder crecer hacia un ERP ligero de alimentos y
bebidas (compras, inventario multi-sucursal, reportes, lealtad de clientes),
sin tener que rehacer el modelo de datos en cada fase.

## Decisión 1 — El inventario se descuenta por ingrediente vía receta

**Nunca se descuenta inventario por "producto terminado".** Cada
`ProductVariant` vendible tiene una `Recipe` (versionada) compuesta de
`RecipeIngredient`, y cada línea de venta (`SaleItem`) descuenta el
`InventoryStock` de los ingredientes atómicos que esa receta consume,
resolviendo recursivamente los ingredientes compuestos (p. ej. un jarabe
casero es a su vez una `Recipe` de tipo `INGREDIENTE_COMPUESTO`).

**Por qué:** un café con leche y uno sin leche no son "el mismo insumo menos
uno", son recetas distintas con consumos distintos de insumos distintos. Solo
descontando por ingrediente se puede:

- Costear cada bebida con precisión (costo real de insumos, no un promedio).
- Detectar mermas y desviaciones de receta (se vendieron 100 lattes pero se
  consumió leche para 130).
- Soportar modificadores (shot extra, leche deslactosada, jarabe adicional)
  como ajustes de receta en vez de productos nuevos.
- Escalar a compras/reordenes por insumo real, no por "unidades de producto
  terminado" que no existen en un POS de bebidas preparadas.

**Consecuencia:** toda venta (`createSale`) corre dentro de una transacción
que, por cada `SaleItem`, resuelve la versión activa de la receta y genera un
`InventoryMovement` (tipo `VENTA`) por cada ingrediente consumido. Ver
`docs/pos-module.md`.

## Decisión 2 — Stack tecnológico

| Capa | Elección | Motivo |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server Actions para mutaciones sin API REST redundante; un solo despliegue para POS + futuros módulos de administración. |
| Base de datos | PostgreSQL vía Prisma ORM | Transacciones ACID (crítico para venta + descuento de inventario atómico), tipado fuerte de principio a fin, migraciones versionadas. |
| Backend gestionado (planeado) | Supabase (Auth, Storage, Realtime, RLS) | Evita construir auth/roles desde cero; RLS permite reforzar el modelo de permisos también a nivel de base de datos. **Aún no integrado** — hoy la sesión es un placeholder (ver `docs/pos-module.md`). |
| Estilos / UI | Tailwind CSS + componentes estilo shadcn/ui + Lucide (íconos) | Consistencia visual rápida sin comprometerse aún a la dependencia completa de Radix; los componentes en `components/ui/` son intencionalmente simples y migran a shadcn/Radix real el día que se necesite algo más complejo (menús, popovers anidados, etc.). |
| Estado de cliente | Zustand | Estado del carrito es simple y local a la sesión de venta; no se justifica Redux. Se añadirá TanStack Query si/cuando el volumen de fetching en cliente lo amerite (hoy la mayoría de la carga de datos es en Server Components). |

**Principio general:** modular desde el inicio (cada módulo del roadmap vive
en su propio espacio de rutas/componentes/acciones), evitando
sobreingeniería — no se construyen abstracciones para fases que aún no
llegan.

## Decisión 3 — Multi-sucursal desde el modelo de datos, no desde el día 1 de UI

El schema soporta sucursales (`Branch`, `StockLocation`, `BranchProduct`,
`EmployeeBranch`) desde Fase 0, porque cambiar esto después implicaría migrar
datos de producción. Sin embargo, la **UI y lógica multi-sucursal es Fase 5**:
hasta entonces, el código de aplicación trabaja contra una sola sucursal fija
(`DEFAULT_BRANCH_ID`, ver `lib/constants.ts`), sabiendo que el modelo ya está
listo para más.

## Decisión 4 — Roles y permisos como catálogo abierto

En vez de si-entonces por rol hardcodeados en el código, los permisos son un
enum (`Permission`) atómico asignado a roles vía `RolePermission`, con
posibilidad de excepciones por empleado (`EmployeePermissionOverride`). Esto
permite ajustar qué puede hacer cada rol sin tocar código, y da un camino
directo hacia Row Level Security de Supabase si se adopta más adelante.

Ver la matriz de permisos real en `prisma/seed.ts`.
