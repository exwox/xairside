export interface User {
  id: string;
  name: string;
  email: string;
  role: 'INSPECTOR' | 'SUPERVISOR' | 'ADMIN';
}

export interface InspectionItem {
  id: string;
  zone: 'RUNWAY' | 'TAXIWAY' | 'APRON';
  category: string;
  name: string;
  order: number;
}

export interface InspectionDetail {
  id: string;
  inspectionId: string;
  itemId: string;
  status: 'BAIK' | 'RUSAK' | 'NA';
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
  createdAt: string;
  updatedAt: string;
}
