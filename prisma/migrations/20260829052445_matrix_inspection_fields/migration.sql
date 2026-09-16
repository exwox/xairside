-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN "fodCondition" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "matrixResults" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "notam" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "obstacleCondition" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "pavementCondition" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "pavementTempRunway11" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "pavementTempRunway29" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "rubberDepositRunway11" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "rubberDepositRunway29" TEXT;
ALTER TABLE "Inspection" ADD COLUMN "standingWaterCondition" TEXT;

-- AlterTable
ALTER TABLE "InspectionItem" ADD COLUMN "matrixKey" TEXT;
