-- AlterTable
ALTER TABLE "sale_payments" ADD COLUMN     "tipAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Ventas históricas con un solo pago: toda su propina entró por ese método.
UPDATE "sale_payments" sp
SET "tipAmount" = s."tipAmount"
FROM "sales" s
WHERE sp."saleId" = s.id
  AND s."tipAmount" > 0
  AND (SELECT count(*) FROM "sale_payments" sp2 WHERE sp2."saleId" = s.id) = 1;
