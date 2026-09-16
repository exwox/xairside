-- Arah penomoran blok concrete per fasilitas.
ALTER TABLE "Facility" ADD COLUMN "slabDirection" TEXT DEFAULT 'FORWARD';
