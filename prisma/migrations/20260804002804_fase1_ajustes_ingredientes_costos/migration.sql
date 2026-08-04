/*
  Warnings:

  - You are about to drop the column `managerConfirmedAt` on the `shifts` table. All the data in the column will be lost.
  - You are about to drop the column `managerId` on the `shifts` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "IngredientAdjustmentType" AS ENUM ('QUITAR', 'AUMENTAR', 'AGREGAR_EXTRA');

-- DropForeignKey
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_managerId_fkey";

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "extraUnitPrice" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "costAtLastPriceReview" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "shifts" DROP COLUMN "managerConfirmedAt",
DROP COLUMN "managerId",
ADD COLUMN     "closingConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "closingConfirmedById" TEXT,
ADD COLUMN     "openingConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "openingConfirmedById" TEXT;

-- AlterTable
ALTER TABLE "transfer_lines" ADD COLUMN     "discrepancyNote" TEXT,
ADD COLUMN     "receivedQuantity" DECIMAL(12,4);

-- CreateTable
CREATE TABLE "ingredient_cost_history" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "ingredientSupplierId" TEXT NOT NULL,
    "previousCost" DECIMAL(10,4),
    "newCost" DECIMAL(10,4) NOT NULL,
    "costUnit" "UnitOfMeasure" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,

    CONSTRAINT "ingredient_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_cost_history" (
    "id" TEXT NOT NULL,
    "recipeVersionId" TEXT NOT NULL,
    "totalCost" DECIMAL(10,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "recipe_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_item_ingredient_adjustments" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" "IngredientAdjustmentType" NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_item_ingredient_adjustments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ingredient_cost_history" ADD CONSTRAINT "ingredient_cost_history_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_cost_history" ADD CONSTRAINT "ingredient_cost_history_ingredientSupplierId_fkey" FOREIGN KEY ("ingredientSupplierId") REFERENCES "ingredient_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_cost_history" ADD CONSTRAINT "recipe_cost_history_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "recipe_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_openingConfirmedById_fkey" FOREIGN KEY ("openingConfirmedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closingConfirmedById_fkey" FOREIGN KEY ("closingConfirmedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_ingredient_adjustments" ADD CONSTRAINT "sale_item_ingredient_adjustments_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_ingredient_adjustments" ADD CONSTRAINT "sale_item_ingredient_adjustments_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
