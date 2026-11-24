-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "lastRoundRequestId" TEXT;

-- No representable en schema.prisma (índice único parcial): a lo más una
-- venta ABIERTA por sucursal+mesa, sin importar mayúsculas — antes solo lo
-- evitaba una validación en la aplicación (openTab en actions/pos.ts), que
-- una condición de carrera (dos clics casi simultáneos, o un reintento sin
-- idempotencia) podía saltarse.
CREATE UNIQUE INDEX "sales_open_tab_per_table_idx" ON "sales" ("branchId", lower("tableNumber")) WHERE "status" = 'ABIERTA';
