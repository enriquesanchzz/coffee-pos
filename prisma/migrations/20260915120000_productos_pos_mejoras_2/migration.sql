-- CreateEnum
CREATE TYPE "DomicilioOrigen" AS ENUM ('TELEFONO', 'APP');

-- AlterEnum
ALTER TYPE "SaleStatus" ADD VALUE 'ABIERTA';

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "targetFoodCostPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "standardDoseQuantity" DECIMAL(8,2),
ADD COLUMN     "standardDoseUnit" "UnitOfMeasure";

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "domicilioOrigen" "DomicilioOrigen";

-- Backfill: sucursal(es) ya sembradas quedan con un % de food cost objetivo
-- usable de inmediato (ver Branch.targetFoodCostPercent), en vez de null.
UPDATE "branches" SET "targetFoodCostPercent" = 30 WHERE "targetFoodCostPercent" IS NULL;
