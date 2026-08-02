-- CreateEnum
CREATE TYPE "ManualDiscountReason" AS ENUM ('GIVEAWAY', 'CORTESIA', 'DESCUENTO_EMPLEADO', 'OTRO');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('ENVIADO', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO');

-- AlterEnum
ALTER TYPE "DiscountType" ADD VALUE 'PRECIO_FINAL';

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "transferLineId" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "isPerishable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "cashDifference" DECIMAL(10,2),
ADD COLUMN     "cashierConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "differenceReason" TEXT,
ADD COLUMN     "expectedCash" DECIMAL(10,2),
ADD COLUMN     "managerConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "transfer_manifests" (
    "id" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'ENVIADO',
    "fromStockLocationId" TEXT NOT NULL,
    "toStockLocationId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "receivedById" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inTransitAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "transfer_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_lines" (
    "id" TEXT NOT NULL,
    "transferManifestId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,

    CONSTRAINT "transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_discounts" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "reason" "ManualDiscountReason" NOT NULL,
    "authorizedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_discounts_saleId_key" ON "manual_discounts"("saleId");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_transferLineId_fkey" FOREIGN KEY ("transferLineId") REFERENCES "transfer_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_manifests" ADD CONSTRAINT "transfer_manifests_fromStockLocationId_fkey" FOREIGN KEY ("fromStockLocationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_manifests" ADD CONSTRAINT "transfer_manifests_toStockLocationId_fkey" FOREIGN KEY ("toStockLocationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_manifests" ADD CONSTRAINT "transfer_manifests_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_manifests" ADD CONSTRAINT "transfer_manifests_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_transferManifestId_fkey" FOREIGN KEY ("transferManifestId") REFERENCES "transfer_manifests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_lines" ADD CONSTRAINT "transfer_lines_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_discounts" ADD CONSTRAINT "manual_discounts_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_discounts" ADD CONSTRAINT "manual_discounts_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
