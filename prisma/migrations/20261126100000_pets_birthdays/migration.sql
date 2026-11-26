-- Mascotas (CRM-01), alergias (CRM-02) y cupones de cumpleaños (CRM-05).
-- Solo agrega: columnas con default y tablas nuevas.
SET lock_timeout = '10s';

-- CreateEnum
CREATE TYPE "PetSpecies" AS ENUM ('PERRO', 'GATO', 'OTRO');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "birthdayCouponValidDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "birthdayCustomerPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "birthdayPetPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "birthDateSetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "allergenTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "pets" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" "PetSpecies" NOT NULL DEFAULT 'PERRO',
    "breed" TEXT,
    "weightKg" DECIMAL(5,2),
    "birthDate" DATE,
    "birthDateSetAt" TIMESTAMP(3),
    "photoUrl" TEXT,
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "birthday_grants" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "petId" TEXT,
    "discountCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "birthday_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pets_customerId_idx" ON "pets"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "birthday_grants_discountCodeId_key" ON "birthday_grants"("discountCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "birthday_grants_subjectKey_year_key" ON "birthday_grants"("subjectKey", "year");

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_grants" ADD CONSTRAINT "birthday_grants_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_grants" ADD CONSTRAINT "birthday_grants_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_grants" ADD CONSTRAINT "birthday_grants_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

