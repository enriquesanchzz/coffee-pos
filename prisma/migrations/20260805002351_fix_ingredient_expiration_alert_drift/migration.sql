/*
  Warnings:

  - You are about to drop the column `quantity` on the `purchase_order_items` table. All the data in the column will be lost.
  - You are about to drop the column `unitCost` on the `purchase_order_items` table. All the data in the column will be lost.
  - The `status` column on the `purchase_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `estimatedUnitCost` to the `purchase_order_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderedQuantity` to the `purchase_order_items` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('CREADA', 'PROVEIDA', 'PROVEIDA_PARCIALMENTE', 'CANCELADA');

-- AlterTable
ALTER TABLE "ingredient_suppliers" ADD COLUMN     "minOrderQuantity" DECIMAL(12,4),
ADD COLUMN     "minOrderUnit" "UnitOfMeasure";

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "expirationAlertDays" INTEGER;

-- AlterTable
ALTER TABLE "purchase_order_items" DROP COLUMN "quantity",
DROP COLUMN "unitCost",
ADD COLUMN     "actualUnitCost" DECIMAL(10,4),
ADD COLUMN     "estimatedUnitCost" DECIMAL(10,4) NOT NULL,
ADD COLUMN     "orderedQuantity" DECIMAL(12,4) NOT NULL,
ADD COLUMN     "receivedQuantity" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "paidAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'CREADA';

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "minOrderAmount" DECIMAL(10,2),
ADD COLUMN     "orderDays" INTEGER[];

-- CreateTable
CREATE TABLE "reorder_points" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "stockLocationId" TEXT NOT NULL,
    "manualThreshold" DECIMAL(12,4) NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reorder_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reorder_points_ingredientId_stockLocationId_key" ON "reorder_points"("ingredientId", "stockLocationId");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_points" ADD CONSTRAINT "reorder_points_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_points" ADD CONSTRAINT "reorder_points_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
