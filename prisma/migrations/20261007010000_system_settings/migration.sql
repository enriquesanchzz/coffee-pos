-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "cashDifferenceTolerance" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cashQuickBills" INTEGER[] DEFAULT ARRAY[20, 50, 100, 200, 500, 1000]::INTEGER[],
ADD COLUMN     "defaultOpeningCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "highTipThresholdPercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "loyaltyStampsPerReward" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "maxManualDiscountPercent" INTEGER,
ADD COLUMN     "paymentMethods" "PaymentMethod"[] DEFAULT ARRAY['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']::"PaymentMethod"[],
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pinLockMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "pinMaxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "sessionHours" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "shiftChangeHour" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "shortagePolicy" TEXT NOT NULL DEFAULT 'CONFIRMAR',
ADD COLUMN     "taxMode" TEXT NOT NULL DEFAULT 'NINGUNO',
ADD COLUMN     "taxRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 16,
ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "tipPercents" INTEGER[] DEFAULT ARRAY[10, 15, 20]::INTEGER[],
ADD COLUMN     "welcomeCouponPercent" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "welcomeCouponValidDays" INTEGER;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

