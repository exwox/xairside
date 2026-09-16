import type { DxfEntity } from '@/lib/dxf';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'INSPECTOR' | 'SUPERVISOR' | 'ADMIN';
}

export interface InspectionItem {
  id: string;
  zone: 'RUNWAY' | 'TAXIWAY' | 'APRON' | 'DRAINAGE' | 'PERIMETER_FENCE';
  category: string;
  name: string;
  matrixKey: string | null;
  order: number;
}

export interface InspectionDetail {
  id: string;
  inspectionId: string;
  itemId: string;
  status: 'S' | 'US';
  remarks: string | null;
  photoUrl: string | null;
  item: InspectionItem;
}

export interface Inspection {
  id: string;
  date: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  inspectorId: string;
  inspector: User;
  supervisorId: string | null;
  supervisor: User | null;
  details: InspectionDetail[];
  signature: string | null;
  // Matrix-style results
  matrixResults: Record<string, string> | null;
  // Bottom panel fields
  rubberDepositRunway11: string | null;
  rubberDepositRunway29: string | null;
  notam: string | null;
  fodCondition: string | null;
  standingWaterCondition: string | null;
  obstacleCondition: string | null;
  pavementCondition: string | null;
  pavementTempRunway11: string | null;
  pavementTempRunway29: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===== Airside Monitoring =====

export interface Facility {
  id: string;
  code: string;
  name: string;
  type: 'RUNWAY' | 'TAXIWAY' | 'APRON';
  lengthM: number | null;
  widthM: number | null;
  areaSqm: number | null;
  surfaceType: string | null;
  pcn: string | null;
  pcr: string | null;
  bearingDeg: number | null;
  stationDirection?: 'FORWARD' | 'REVERSE' | null;
  stationIntervalM?: number | null;
  locationMode?: 'STA' | 'SAM' | null;
  sampleLengthM?: number | null;
  sampleWidthM?: number | null;
  blockLengthM?: number | null;
  blockWidthM?: number | null;
  slabDirection?: 'FORWARD' | 'REVERSE' | null;
  pciCorrection?: number;
  centroidLat: number | null;
  centroidLng: number | null;
  polygonJson: string | null;
  color: string | null;
  status: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MapLayer {
  id: string;
  name: string;
  fileName: string;
  refLat: number;
  refLng: number;
  rotationDeg: number;
  scale: number;
  entities: DxfEntity[]; // hasil parse dari entitiesJson
  visible: boolean;
  createdAt: string;
}

export interface Damage {
  id: string;
  groupId?: string | null;
  facilityId: string | null;
  facility?: Facility | null;
  station: string | null;
  sampleCode?: string | null;
  type: string;
  severity: 'L' | 'M' | 'H' | '-';
  lat: number;
  lng: number;
  localX: number;
  localY: number;
  rectJson: string | null;
  geometryType?: 'POLYGON' | 'LINE' | 'POINT' | 'SLAB';
  lengthM: number | null;
  widthM: number | null;
  areaSqm: number;
  count?: number | null;
  photoUrl: string | null;
  remarks: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  reportedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarkingFinding {
  id: string;
  facilityId: string | null;
  facility?: Facility | null;
  markingType: string;
  condition: 'BAIK' | 'PERLU_PERBAIKAN' | 'USANG';
  station: string | null;
  lat: number | null;
  lng: number | null;
  localX: number | null;
  localY: number | null;
  areaSqm: number | null;
  remarks: string | null;
  photoUrl: string | null;
  status: 'OPEN' | 'CLOSED';
  reportedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PciSection {
  id: string;
  facilityId: string | null;
  facility?: Facility | null;
  name: string;
  surfaceType: 'ASPHALT' | 'JPCP';
  totalAreaSqm: number;
  sampleUnitArea: number;
  lastPci: number | null;
  lastSurveyAt: string | null;
  surveys?: PciSurvey[];
  createdAt: string;
  updatedAt: string;
}

export interface PciSurvey {
  id: string;
  sectionId: string;
  inspectorName: string | null;
  surveyDate: string;
  pci: number;
  rating: string;
  details: PciSurveyDetail[];
  createdAt: string;
}

export interface PciSurveyDetail {
  no: number;
  areaSqm: number;
  distresses: { code: number; name: string; severity: 'L' | 'M' | 'H' | '-'; quantity: number; density: number }[];
  dvLines: { code: number; name: string; severity: string; density: number; dv: number }[];
  totalDv: number;
  maxCdv: number;
  allowableDeducts?: number;
  cdvIterations?: {
    q: number;
    curveQs: [number, number];
    totalDv: number;
    cdv: number;
    deductValues: number[];
  }[];
  pci: number;
}

export interface DamageTypeEntry {
  code: string;
  name: string;
}

export interface SurfaceDamageCatalogEntry {
  id: string;
  code: string;
  name: string;
  pciCode: number | null;
  aliases: string[];
}

export interface AppConfig {
  arpLat: number;
  arpLng: number;
  airportName: string;
  mapRotationDeg: number;
  stationIntervalM?: number;
  damageTypesConfig?: DamageTypeEntry[];
  damageCatalogs?: {
    ASPHALT: SurfaceDamageCatalogEntry[];
    JPCP: SurfaceDamageCatalogEntry[];
  };
}
