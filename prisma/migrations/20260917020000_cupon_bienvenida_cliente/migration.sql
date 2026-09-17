-- AlterTable
ALTER TABLE "discount_codes" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "usedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
