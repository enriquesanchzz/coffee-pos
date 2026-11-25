-- CreateEnum
CREATE TYPE "BusinessUnit" AS ENUM ('CAFE', 'PET_SHOP');

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "businessUnit" "BusinessUnit" NOT NULL DEFAULT 'CAFE';
