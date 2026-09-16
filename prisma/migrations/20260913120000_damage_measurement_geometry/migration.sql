-- Existing records remain polygons and retain their measured area.
ALTER TABLE "Damage" ADD COLUMN "geometryType" TEXT NOT NULL DEFAULT 'POLYGON';
ALTER TABLE "Damage" ADD COLUMN "count" INTEGER;
