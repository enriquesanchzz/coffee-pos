# Nomada Café POS

Punto de venta para Nomada Café, construido para poder crecer hacia un ERP
ligero de alimentos y bebidas (compras, inventario multi-sucursal, reportes,
lealtad de clientes) sin rehacer el modelo de datos en cada fase.

**Decisión de arquitectura clave:** el inventario se descuenta por
ingrediente vía receta, nunca por producto terminado. Ver el porqué completo
en [`docs/adr-nomada-pos.md`](docs/adr-nomada-pos.md).

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/adr-nomada-pos.md`](docs/adr-nomada-pos.md) | Decisiones de arquitectura (ADR-001) y stack tecnológico. |
| [`docs/roadmap.md`](docs/roadmap.md) | Fases 0–5 del proyecto y qué incluye cada una. |
| [`docs/pos-module.md`](docs/pos-module.md) | Cómo funciona el módulo POS ya construido: catálogo, carrito, venta, descuento de inventario. |
| [`docs/CONTINUE.md`](docs/CONTINUE.md) | Estado exacto del repo, qué falta, y cómo retomar el desarrollo. **Léelo primero si vas a seguir construyendo.** |

## Stack

Next.js 15 (App Router) + TypeScript · Prisma + PostgreSQL · Tailwind CSS +
componentes estilo shadcn/ui · Zustand · Supabase (planeado, aún no
integrado).

## Puesta en marcha

Requisitos: Node.js 20+, una base PostgreSQL accesible.

```bash
npm install

cp .env.example .env
# Edita .env con tu DATABASE_URL real (local o Supabase).

npx prisma migrate deploy   # aplica las migraciones existentes
npm run prisma:seed         # roles, permisos, sucursal y ubicaciones de stock
npm run prisma:seed-demo    # datos de demo: productos, recetas, empleados, turno abierto

npm run dev                 # http://localhost:3000
```

Empleados de demo para entrar al POS (selector por PIN — identifica rápido
quién opera en el mostrador, ver `docs/CONTINUE.md`):

- Ana — PIN `1234` (rol GERENTE)
- Luis — PIN `5678` (rol BARISTA)

Para entrar a **Administración** (`/administracion`) hace falta login con
email + password, no PIN — solo Ana tiene una cuenta de demo con acceso:

- Ana — `ana@nomada.cafe` / `admin1234`

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` / `npm run start` | Build y arranque de producción. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (config de Next.js). |
| `npm run prisma:generate` | Regenera el cliente de Prisma tras cambiar el schema. |
| `npm run prisma:migrate` | Crea/aplica una migración en desarrollo (`prisma migrate dev`). |
| `npm run prisma:studio` | UI de Prisma para explorar/editar datos. |
| `npm run prisma:seed` | Seed base: roles, permisos, sucursal principal, ubicaciones de stock. |
| `npm run prisma:seed-demo` | Seed de demo: ingredientes, productos, recetas, empleados, turno abierto, stock inicial. |

## Estructura del repo

```
app/                  Rutas (App Router): "/" login por PIN, "/pos" el POS
actions/              Server Actions (mutaciones): venta, apertura de turno, sesión
components/
  ui/                 Componentes base estilo shadcn/ui (sin Radix todavía)
  pos/                Componentes del módulo POS (carrito, catálogo, checkout)
  layout/             Sidebar de navegación entre módulos
lib/                  Cliente de Prisma, sesión, catálogo, utilidades, constantes
prisma/               schema.prisma, migraciones, seeds
docs/                 ADR, roadmap, documentación del módulo POS, handoff
```

## Verificado en este repo

`npm install`, `prisma generate`, `tsc --noEmit` y `next build` corren
limpios. Adicionalmente se probó el flujo completo contra una base
PostgreSQL real: migraciones aplicadas, seeds corridos, y una venta de
prueba (Latte Grande + shot extra + Capuccino Chico = $112.00) ejecutada
desde el navegador contra `createSale`, confirmando que el total y el
descuento de inventario por ingrediente (incluida la resolución recursiva
del ingrediente compuesto "jarabe de vainilla casero") son exactamente los
esperados por receta.
