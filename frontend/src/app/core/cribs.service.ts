import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { SessionService } from './session.service';
import { Observable, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { environment } from "../../environments/environment";
import {
  LandlordEnrollment,
  LandlordProfile,
  Property,
  PropertyMedia,
  PropertyUnit,
  PublicProperty,
  NotificationItem,
  AuditEntry,
  TenantUnitSummary,
  TenantUnitDetail,
} from "../shared/models";

@Injectable({ providedIn: "root" })
export class CribsService {
  private http = inject(HttpClient);
  private base = environment.cribsApi;
  // unified auth: forward user identity to cribs-api via headers (middleware supports X-User-UUID/X-User-Roles)
  private session = inject(SessionService);

  private authHeaders(): { headers?: HttpHeaders } {
    try {
      const user = this.session.user?.();
      const roles = [
        ...(this.session.roles?.() ?? []),
        ...(this.session.cribsRoles?.() ?? []),
      ].filter(Boolean);
      let headers = new HttpHeaders();
      if (user?.uuid) headers = headers.set('X-User-UUID', String(user.uuid));
      if (roles.length) headers = headers.set('X-User-Roles', Array.from(new Set(roles)).join(','));
      return { headers };
    } catch {
      return {};
    }
  }

  getPublicProperties(params?: { q?: string; landlordId?: string; limit?: number; offset?: number; bbox?: string }): Observable<PublicProperty[]> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }
    return this.http
      .get<{ success: boolean; data: PublicProperty[] }>(`${this.base}/v1/public/properties`, { params: httpParams })
      .pipe(map((res) => res.data ?? []));
  }

  getEnrollment(): Observable<LandlordEnrollment | null> {
    return this.http
      .get<{ success: boolean; data: LandlordEnrollment | null }>(`${this.base}/v1/landlord/enrollments/me`, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data ?? null));
  }

  saveEnrollment(payload: Partial<LandlordEnrollment>): Observable<LandlordEnrollment> {
    return this.http
      .patch<{ success: boolean; data: LandlordEnrollment }>(`${this.base}/v1/landlord/enrollments/me`, payload, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data));
  }

  submitEnrollment(id: string) {
    return this.http.post<{ success: boolean; data: any }>(`${this.base}/v1/landlord/enrollments/${id}/submit`, {}, { withCredentials: true, ...this.authHeaders() });
  }

  getLandlordProfile(): Observable<LandlordProfile | null> {
    return this.http
      .get<{ success: boolean; data: LandlordProfile | null }>(`${this.base}/v1/landlord/profile`, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data ?? null));
  }

  listProperties(): Observable<Property[]> {
    return this.http
      .get<{ success: boolean; data: Property[] }>(`${this.base}/v1/landlord/properties`, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data ?? []));
  }

  getProperty(id: string): Observable<Property> {
    return this.http
      .get<{ success: boolean; data: Property }>(`${this.base}/v1/landlord/properties/${id}`, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data));
  }

  createProperty(input: Partial<Property>): Observable<Property> {
    return this.http
      .post<{ success: boolean; data: Property }>(`${this.base}/v1/landlord/properties`, input, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data));
  }

  updateProperty(id: string, input: Partial<Property>): Observable<Property> {
    return this.http
      .put<{ success: boolean; data: Property }>(`${this.base}/v1/landlord/properties/${id}`, input, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data));
  }

  deleteProperty(id: string) {
    return this.http.delete<{ success: boolean }>(`${this.base}/v1/landlord/properties/${id}`, { withCredentials: true, ...this.authHeaders() });
  }

  submitProperty(id: string) {
    return this.http.post<{ success: boolean; data: any }>(`${this.base}/v1/landlord/properties/${id}/submit`, {}, { withCredentials: true, ...this.authHeaders() });
  }

  addMedia(id: string, input: { kind: string; url: string; caption?: string; unitId?: string }): Observable<PropertyMedia> {
    return this.http
      .post<{ success: boolean; data: PropertyMedia }>(`${this.base}/v1/landlord/properties/${id}/media`, input, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data));
  }

  deleteMedia(propertyId: string, mediaId: string) {
    return this.http.delete<{ success: boolean }>(`${this.base}/v1/landlord/properties/${propertyId}/media/${mediaId}`, { withCredentials: true, ...this.authHeaders() });
  }

  upsertUnits(propertyId: string, units: Partial<PropertyUnit>[], opts?: { replaceExisting?: boolean }) {
    const replaceExisting = !!opts?.replaceExisting;
    return this.http
      .put<{ success: boolean; data: PropertyUnit[] }>(`${this.base}/v1/landlord/properties/${propertyId}/units`, { units, replaceExisting }, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data ?? []));
  }

  getNotifications(): Observable<NotificationItem[]> {
    return this.http
      .get<{ success: boolean; data: NotificationItem[] }>(`${this.base}/v1/landlord/notifications`, { withCredentials: true, ...this.authHeaders() })
      .pipe(map((res) => res.data ?? []));
  }

  getAuditTrail(propertyId?: string): Observable<AuditEntry[]> {
    const params = propertyId ? new HttpParams().set("propertyId", propertyId) : undefined;
    return this.http
      .get<{ success: boolean; data: AuditEntry[] }>(`${this.base}/v1/landlord/audit-trail`, { withCredentials: true, params, ...this.authHeaders() })
      .pipe(map((res) => res.data ?? []));
  }

  adminListEnrollments(status: string): Observable<LandlordEnrollment[]> {
    const params = new HttpParams().set("status", status);
    return this.http
      .get<{ success: boolean; data: LandlordEnrollment[] }>(`${this.base}/v1/admin/cribs/enrollments`, { withCredentials: true, params })
      .pipe(map((res) => res.data ?? []));
  }

  adminApproveEnrollment(id: string, payload: { displayName?: string; supportEmail?: string; supportPhone?: string; notes?: string }) {
    return this.http.post(`${this.base}/v1/admin/cribs/enrollments/${id}/approve`, payload, { withCredentials: true });
  }

  adminRejectEnrollment(id: string, reason: string) {
    return this.http.post(`${this.base}/v1/admin/cribs/enrollments/${id}/reject`, { reason }, { withCredentials: true });
  }

  adminListProperties(status: string): Observable<Property[]> {
    const params = new HttpParams().set("status", status);
    return this.http
      .get<{ success: boolean; data: Property[] }>(`${this.base}/v1/admin/cribs/properties`, { withCredentials: true, params })
      .pipe(map((res) => res.data ?? []));
  }

  adminApproveProperty(id: string, notes?: string) {
    return this.http.post(`${this.base}/v1/admin/cribs/properties/${id}/approve`, { notes }, { withCredentials: true });
  }

  adminRejectProperty(id: string, reason: string) {
    return this.http.post(`${this.base}/v1/admin/cribs/properties/${id}/reject`, { reason }, { withCredentials: true });
  }

  uploadEnrollmentDocuments(files: File[]): Observable<string[]> {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return this.http
      .post<{ success: boolean; data: string[] }>(`${this.base}/v1/landlord/uploads`, fd, { withCredentials: true })
      .pipe(map((res) => res.data ?? []));
  }

  getTenantUnits(): Observable<TenantUnitSummary[]> {
    return this.http
      .get<{ success: boolean; data: TenantUnitSummary[] }>(`${this.base}/v1/tenant/units`, { withCredentials: true })
      .pipe(
        map((res) => res.data ?? []),
        catchError((error) => {
          if (error?.status === 403 || error?.status === 404) {
            return of([]);
          }
          throw error;
        }),
      );
  }

  getTenantUnit(id: string): Observable<TenantUnitDetail | null> {
    return this.http
      .get<{ success: boolean; data: TenantUnitDetail }>(`${this.base}/v1/tenant/units/${id}`, { withCredentials: true })
      .pipe(
        map((res) => res.data ?? null),
        catchError((error) => {
          if (error?.status === 404 || error?.status === 403) {
            return of(null);
          }
          throw error;
        }),
      );
  }

  // Generate units for a property based on a numbering scheme
  generateUnits(propertyId: string, input: {
    addressType: 'simple' | 'block' | 'floor' | 'hybrid' | 'standalone',
    totalUnits?: number,
    blocks?: string[],
    phases?: string[],
    floors?: number,
    includeGround?: boolean,
    unitsPerFloor?: number,
    unitType?: string,
    defaultStatus?: string,
    replaceExisting?: boolean,
  }) {
    return this.http.post<{ success: boolean }>(`${this.base}/v1/landlord/properties/${propertyId}/units/generate`, input, { withCredentials: true, ...this.authHeaders() });
  }

  // Public occupancy map for a property
  getPublicUnitStatus(propertyId: string): Observable<Array<{ id: string; doorNumber: string; status: string; addressType: string; block?: string; phase?: string; floor?: number }>> {
    return this.http
      .get<{ success: boolean; data: any[] }>(`${this.base}/v1/public/properties/${propertyId}/units/status`, this.authHeaders())
      .pipe(map((res) => res.data ?? []));
  }

  // Landlord leases
  listLeases() {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.base}/v1/landlord/leases`, { withCredentials: true }).pipe(map(r => r.data || []));
  }
  createLease(input: { unitId: string; tenantUuid: string; type: string; startDate: string; endDate?: string; rate: number; frequency: string; deposit?: number; status?: string }) {
    return this.http.post<{ success: boolean; data: { id: string } }>(`${this.base}/v1/landlord/leases`, input, { withCredentials: true }).pipe(map(r => r.data));
  }
  updateLease(id: string, input: { status?: string; endDate?: string }) {
    return this.http.put<{ success: boolean }>(`${this.base}/v1/landlord/leases/${id}`, input, { withCredentials: true });
  }
  addPayment(leaseId: string, input: { amount: number; method?: string; reference?: string; paidOn?: string }) {
    return this.http.post<{ success: boolean; data: { paymentId: string; receiptNo: string } }>(`${this.base}/v1/landlord/leases/${leaseId}/payments`, input, { withCredentials: true }).pipe(map(r => r.data));
  }
  getLeasePayments(leaseId: string) {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.base}/v1/landlord/leases/${leaseId}/payments`, { withCredentials: true }).pipe(map(r => r.data || []));
  }
  getTenantLease(id: string) {
    return this.http.get<{ success: boolean; data: { lease: any; payments: any[] } }>(`${this.base}/v1/tenant/leases/${id}`, { withCredentials: true }).pipe(map(r => r.data));
  }

  // Core API messaging stub (composer)
  sendCoreMessage(input: { toUuid: string; subject: string; body: string }) {
    // Post to Core API stub; ignore errors for now (stub)
    return this.http
      .post(`${environment.coreApi}/v1/messages`, input, { withCredentials: true })
      .pipe(
        catchError(() => of({ success: false }))
      );
  }
}
