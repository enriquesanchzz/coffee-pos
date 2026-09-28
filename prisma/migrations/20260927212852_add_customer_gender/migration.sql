-- CreateEnum
CREATE TYPE "CustomerGender" AS ENUM ('FEMENINO', 'MASCULINO', 'OTRO');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "gender" "CustomerGender";
