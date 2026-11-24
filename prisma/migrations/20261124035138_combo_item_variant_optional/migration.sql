-- DropForeignKey
ALTER TABLE "combo_items" DROP CONSTRAINT "combo_items_productVariantId_fkey";

-- AlterTable
ALTER TABLE "combo_items" ALTER COLUMN "productVariantId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
