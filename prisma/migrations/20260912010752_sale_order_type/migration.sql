-- CreateEnum
CREATE TYPE "SaleOrderType" AS ENUM ('CONSUMO_LOCAL', 'PARA_LLEVAR', 'DOMICILIO');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "orderType" "SaleOrderType" NOT NULL DEFAULT 'PARA_LLEVAR';
