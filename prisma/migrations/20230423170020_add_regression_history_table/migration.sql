-- CreateTable
CREATE TABLE "RegressionHistory" (
    "id" TEXT NOT NULL,
    "levelLogId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "t0" TIMESTAMP(3) NOT NULL,
    "tmax" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "tOnValue" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "RegressionHistory_id_key" ON "RegressionHistory"("id");
