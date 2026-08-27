-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "merchant" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_merchant_idx" ON "Transaction"("merchant");
