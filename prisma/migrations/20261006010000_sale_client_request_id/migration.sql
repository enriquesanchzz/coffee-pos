-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sales_clientRequestId_key" ON "sales"("clientRequestId");
