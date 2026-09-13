-- CreateEnum
CREATE TYPE "VariantTemperature" AS ENUM ('CALIENTE', 'FRIO', 'FRAPPE');

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "cupCapacityOz" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "color" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "sizeOz" DECIMAL(6,2),
ADD COLUMN     "temperature" "VariantTemperature";

