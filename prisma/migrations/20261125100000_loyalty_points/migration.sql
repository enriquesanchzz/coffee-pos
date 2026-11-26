-- Si una venta de la versión anterior está a la mitad, se espera a lo más
-- 10 s por cada tabla en vez de arriesgar un bloqueo mutuo; si no alcanza,
-- la migración falla limpia y se vuelve a correr.
SET lock_timeout = '10s';

-- CreateEnum
CREATE TYPE "LoyaltyMode" AS ENUM ('SEPARADO', 'GLOBAL');

-- CreateEnum
CREATE TYPE "LoyaltyProgram" AS ENUM ('CAFE', 'PET_SHOP', 'GLOBAL');

-- CreateEnum
CREATE TYPE "LoyaltyRewardType" AS ENUM ('NINGUNA', 'CUPON_PORCENTAJE', 'PRODUCTO_GRATIS', 'DESCUENTO_PERMANENTE');

-- CreateEnum
CREATE TYPE "LoyaltyEntryReason" AS ENUM ('VENTA', 'CANCELACION', 'CONVERSION', 'REINICIO');

-- DropIndex
DROP INDEX "loyalty_tiers_name_key";

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "loyaltyMode" "LoyaltyMode" NOT NULL DEFAULT 'SEPARADO',
ADD COLUMN     "loyaltyPointsPer100Cafe" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "loyaltyPointsPer100PetShop" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "loyaltyResetAtTopLevel" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "discount_codes" ADD COLUMN     "businessUnit" "BusinessUnit",
ADD COLUMN     "isReusable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loyaltyProgram" "LoyaltyProgram",
ADD COLUMN     "productVariantId" TEXT;

-- AlterTable
ALTER TABLE "loyalty_tiers" ADD COLUMN     "pointsRequired" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "program" "LoyaltyProgram" NOT NULL DEFAULT 'CAFE',
ADD COLUMN     "rewardPercent" INTEGER,
ADD COLUMN     "rewardType" "LoyaltyRewardType" NOT NULL DEFAULT 'NINGUNA',
ADD COLUMN     "rewardValidDays" INTEGER,
ADD COLUMN     "rewardVariantId" TEXT;

-- Los niveles se medían en visitas (ventas); ahora en puntos. Cada visita
-- se convierte en los puntos que da un ticket promedio a 5 pts por $100
-- (default de Configuración → Lealtad). El admin los ajusta después.
UPDATE "loyalty_tiers" SET "pointsRequired" = "minLifetimeStamps" * (
  SELECT GREATEST(1, COALESCE(ROUND(AVG("total") * 5 / 100), 5))::int
  FROM "sales" WHERE "status" = 'COMPLETADA'
);
-- minLifetimeStamps se conserva (ver schema): la app anterior lo sigue
-- leyendo hasta que se reinicie con la versión nueva.
ALTER TABLE "loyalty_tiers" ALTER COLUMN "minLifetimeStamps" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "loyalty_balances" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,
    "cycle" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_points_entries" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" "LoyaltyEntryReason" NOT NULL,
    "cycle" INTEGER,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "loyalty_points_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_tier_grants" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tierId" TEXT,
    "program" "LoyaltyProgram" NOT NULL,
    "pointsRequired" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL,
    "saleId" TEXT,
    "discountCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_tier_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_customerId_loyaltyProgram_key" ON "discount_codes"("customerId", "loyaltyProgram");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_balances_customerId_program_key" ON "loyalty_balances"("customerId", "program");

-- CreateIndex
CREATE INDEX "loyalty_points_entries_customerId_createdAt_idx" ON "loyalty_points_entries"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_points_entries_saleId_idx" ON "loyalty_points_entries"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_tier_grants_discountCodeId_key" ON "loyalty_tier_grants"("discountCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_tier_grants_customerId_tierId_cycle_key" ON "loyalty_tier_grants"("customerId", "tierId", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_tiers_program_name_key" ON "loyalty_tiers"("program", "name");

-- AddForeignKey
ALTER TABLE "loyalty_tiers" ADD CONSTRAINT "loyalty_tiers_rewardVariantId_fkey" FOREIGN KEY ("rewardVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_balances" ADD CONSTRAINT "loyalty_balances_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_points_entries" ADD CONSTRAINT "loyalty_points_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_points_entries" ADD CONSTRAINT "loyalty_points_entries_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_tier_grants" ADD CONSTRAINT "loyalty_tier_grants_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_tier_grants" ADD CONSTRAINT "loyalty_tier_grants_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "loyalty_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_tier_grants" ADD CONSTRAINT "loyalty_tier_grants_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_tier_grants" ADD CONSTRAINT "loyalty_tier_grants_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

