export interface LandlordEnrollment {
  id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  currentStep?: string;
  payload?: any;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface LandlordProfile {
  id: string;
  enrollmentId: string;
  displayName: string;
  status: string;
  supportEmail?: string;
  supportPhone?: string;
  profile?: any;
}

export interface PropertyMedia {
  id: string;
  propertyId: string;
  unitId?: string;
  kind: 'interior' | 'exterior' | 'floorplan' | 'document';
  url: string;
  caption?: string;
  uploadedBy?: string;
  createdAt?: string;
}

export interface PropertyUnit {
  id: string;
  propertyId: string;
  structureLabel?: string;
  addressType: string;
  block?: string;
  phase?: string;
  floor?: number;
  doorNumber?: string;
  displayName?: string;
  unitType?: string;
  status: string;
  maintenanceNote?: string;
  metadata?: any;
  pricing?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface Property {
  id: string;
  landlordId: string;
  name: string;
  slug: string;
  addressType?: string;
  description?: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';
  address?: any;
  location?: any;
  details?: any;
  amenities?: any;
  policies?: any;
  submittedAt?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  media?: PropertyMedia[];
  units?: PropertyUnit[];
}

export interface PublicProperty {
  id: string;
  name: string;
  slug: string;
  addressType?: string;
  summary: string;
  landlordId: string;
  landlordName: string;
  location?: any;
  address?: any;
  details?: any;
  amenities?: any;
  media?: PropertyMedia[];
  updatedAt?: string;
}

export interface NotificationItem {
  id: number;
  kind: string;
  status: string;
  payload: any;
  createdAt: string;
  processedAt?: string;
}

export interface AuditEntry {
  id: number;
  landlordId: string;
  propertyId?: string;
  unitId?: string;
  actorUuid: string;
  action: string;
  payload: any;
  createdAt: string;
}
