-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "sale_item_voids" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "authorizedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_item_voids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_item_voids_saleId_idx" ON "sale_item_voids"("saleId");

-- AddForeignKey
ALTER TABLE "sale_item_voids" ADD CONSTRAINT "sale_item_voids_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_voids" ADD CONSTRAINT "sale_item_voids_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_voids" ADD CONSTRAINT "sale_item_voids_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

