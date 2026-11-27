-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('CAFE_TE_EXTRANAMOS', 'PET_SHOP_RESURTIDO');

-- CreateEnum
CREATE TYPE "ReminderAction" AS ENUM ('ENVIADO', 'OMITIDO');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "reminderCafeDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "reminderCafeMessage" TEXT,
ADD COLUMN     "reminderPetShopDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "reminderPetShopMessage" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "reminderDays" INTEGER,
ADD COLUMN     "reminderMessage" TEXT;

-- CreateTable
CREATE TABLE "customer_reminders" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "productId" TEXT,
    "action" "ReminderAction" NOT NULL,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_reminders_customerId_kind_idx" ON "customer_reminders"("customerId", "kind");

-- AddForeignKey
ALTER TABLE "customer_reminders" ADD CONSTRAINT "customer_reminders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_reminders" ADD CONSTRAINT "customer_reminders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

