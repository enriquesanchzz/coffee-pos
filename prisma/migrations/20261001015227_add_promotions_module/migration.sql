-- CreateEnum
CREATE TYPE "PromotionCategory" AS ENUM ('DOS_POR_UNO', 'DIA_TEMATICO');

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'PROMOCION_GESTIONAR';

-- AlterTable
ALTER TABLE "combos" ADD COLUMN     "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "startTime" TEXT;

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PromotionCategory" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startTime" TEXT,
    "endTime" TEXT,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(10,2),

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_variants" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,

    CONSTRAINT "promotion_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotion_variants_promotionId_productVariantId_key" ON "promotion_variants"("promotionId", "productVariantId");

-- AddForeignKey
ALTER TABLE "promotion_variants" ADD CONSTRAINT "promotion_variants_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_variants" ADD CONSTRAINT "promotion_variants_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
