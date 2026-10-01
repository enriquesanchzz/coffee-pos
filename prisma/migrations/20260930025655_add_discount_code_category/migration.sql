-- CreateEnum
CREATE TYPE "DiscountCodeCategory" AS ENUM ('CLIENTE_ESPECIFICO', 'CAMPANA', 'EMPLEADO');

-- AlterTable
ALTER TABLE "discount_codes" ADD COLUMN     "category" "DiscountCodeCategory";
