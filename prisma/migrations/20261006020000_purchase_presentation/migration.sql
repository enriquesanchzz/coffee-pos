-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "purchasePresentationName" TEXT,
ADD COLUMN     "purchasePresentationSize" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "purchase_order_items" ADD COLUMN     "presentationName" TEXT,
ADD COLUMN     "unitsPerPresentation" DECIMAL(12,4);
