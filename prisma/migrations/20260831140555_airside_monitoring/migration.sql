-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lengthM" REAL,
    "widthM" REAL,
    "areaSqm" REAL,
    "surfaceType" TEXT,
    "pcn" TEXT,
    "pcr" TEXT,
    "bearingDeg" REAL,
    "centroidLat" REAL,
    "centroidLng" REAL,
    "polygonJson" TEXT,
    "color" TEXT,
    "status" TEXT,
    "remarks" TEXT,
    "stationDirection" TEXT DEFAULT 'FORWARD',
    "stationIntervalM" REAL DEFAULT 50,
    "locationMode" TEXT DEFAULT 'STA',
    "sampleLengthM" REAL DEFAULT 20,
    "sampleWidthM" REAL DEFAULT 20,
    "blockLengthM" REAL DEFAULT 5,
    "blockWidthM" REAL DEFAULT 5,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MapLayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "refLat" REAL NOT NULL,
    "refLng" REAL NOT NULL,
    "rotationDeg" REAL NOT NULL DEFAULT 0,
    "scale" REAL NOT NULL DEFAULT 1,
    "entitiesJson" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Damage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT,
    "facilityId" TEXT,
    "station" TEXT,
    "sampleCode" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "localX" REAL NOT NULL,
    "localY" REAL NOT NULL,
    "rectJson" TEXT,
    "lengthM" REAL,
    "widthM" REAL,
    "areaSqm" REAL NOT NULL,
    "photoUrl" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Damage_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarkingFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facilityId" TEXT,
    "markingType" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "station" TEXT,
    "lat" REAL,
    "lng" REAL,
    "localX" REAL,
    "localY" REAL,
    "areaSqm" REAL,
    "remarks" TEXT,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarkingFinding_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PciSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facilityId" TEXT,
    "name" TEXT NOT NULL,
    "surfaceType" TEXT NOT NULL,
    "totalAreaSqm" REAL NOT NULL,
    "sampleUnitArea" REAL NOT NULL DEFAULT 225,
    "lastPci" REAL,
    "lastSurveyAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PciSection_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PciSurvey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "inspectorName" TEXT,
    "surveyDate" DATETIME NOT NULL,
    "pci" REAL NOT NULL,
    "rating" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PciSurvey_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PciSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Facility_code_key" ON "Facility"("code");
