-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "loyalty_cards" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "sale_payments" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "tableNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_cards_code_key" ON "loyalty_cards"("code");

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
