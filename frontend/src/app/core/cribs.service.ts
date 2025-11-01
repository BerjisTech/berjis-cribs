import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
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
      .get<{ success: boolean; data: LandlordEnrollment | null }>(`${this.base}/v1/landlord/enrollments/me`)
      .pipe(map((res) => res.data ?? null));
  }

  saveEnrollment(payload: Partial<LandlordEnrollment>): Observable<LandlordEnrollment> {
    return this.http
      .patch<{ success: boolean; data: LandlordEnrollment }>(`${this.base}/v1/landlord/enrollments/me`, payload)
      .pipe(map((res) => res.data));
  }

  submitEnrollment(id: string) {
    return this.http.post<{ success: boolean; data: any }>(`${this.base}/v1/landlord/enrollments/${id}/submit`, {});
  }

  getLandlordProfile(): Observable<LandlordProfile | null> {
    return this.http
      .get<{ success: boolean; data: LandlordProfile | null }>(`${this.base}/v1/landlord/profile`)
      .pipe(map((res) => res.data ?? null));
  }

  listProperties(): Observable<Property[]> {
    return this.http
      .get<{ success: boolean; data: Property[] }>(`${this.base}/v1/landlord/properties`)
      .pipe(map((res) => res.data ?? []));
  }

  getProperty(id: string): Observable<Property> {
    return this.http
      .get<{ success: boolean; data: Property }>(`${this.base}/v1/landlord/properties/${id}`)
      .pipe(map((res) => res.data));
  }

  createProperty(input: Partial<Property>): Observable<Property> {
    return this.http
      .post<{ success: boolean; data: Property }>(`${this.base}/v1/landlord/properties`, input)
      .pipe(map((res) => res.data));
  }

  updateProperty(id: string, input: Partial<Property>): Observable<Property> {
    return this.http
      .put<{ success: boolean; data: Property }>(`${this.base}/v1/landlord/properties/${id}`, input)
      .pipe(map((res) => res.data));
  }

  submitProperty(id: string) {
    return this.http.post<{ success: boolean; data: any }>(`${this.base}/v1/landlord/properties/${id}/submit`, {});
  }

  addMedia(id: string, input: { kind: string; url: string; caption?: string; unitId?: string }): Observable<PropertyMedia> {
    return this.http
      .post<{ success: boolean; data: PropertyMedia }>(`${this.base}/v1/landlord/properties/${id}/media`, input)
      .pipe(map((res) => res.data));
  }

  deleteMedia(propertyId: string, mediaId: string) {
    return this.http.delete<{ success: boolean }>(`${this.base}/v1/landlord/properties/${propertyId}/media/${mediaId}`);
  }

  upsertUnits(propertyId: string, units: Partial<PropertyUnit>[]) {
    return this.http
      .put<{ success: boolean; data: PropertyUnit[] }>(`${this.base}/v1/landlord/properties/${propertyId}/units`, { units })
      .pipe(map((res) => res.data ?? []));
  }

  getNotifications(): Observable<NotificationItem[]> {
    return this.http
      .get<{ success: boolean; data: NotificationItem[] }>(`${this.base}/v1/landlord/notifications`)
      .pipe(map((res) => res.data ?? []));
  }

  getAuditTrail(propertyId?: string): Observable<AuditEntry[]> {
    const params = propertyId ? new HttpParams().set("propertyId", propertyId) : undefined;
    return this.http
      .get<{ success: boolean; data: AuditEntry[] }>(`${this.base}/v1/landlord/audit-trail`, { params })
      .pipe(map((res) => res.data ?? []));
  }

  adminListEnrollments(status: string): Observable<LandlordEnrollment[]> {
    const params = new HttpParams().set("status", status);
    return this.http
      .get<{ success: boolean; data: LandlordEnrollment[] }>(`${this.base}/v1/admin/cribs/enrollments`, { params })
      .pipe(map((res) => res.data ?? []));
  }

  adminApproveEnrollment(id: string, payload: { displayName?: string; supportEmail?: string; supportPhone?: string; notes?: string }) {
    return this.http.post(`${this.base}/v1/admin/cribs/enrollments/${id}/approve`, payload);
  }

  adminRejectEnrollment(id: string, reason: string) {
    return this.http.post(`${this.base}/v1/admin/cribs/enrollments/${id}/reject`, { reason });
  }

  adminListProperties(status: string): Observable<Property[]> {
    const params = new HttpParams().set("status", status);
    return this.http
      .get<{ success: boolean; data: Property[] }>(`${this.base}/v1/admin/cribs/properties`, { params })
      .pipe(map((res) => res.data ?? []));
  }

  adminApproveProperty(id: string, notes?: string) {
    return this.http.post(`${this.base}/v1/admin/cribs/properties/${id}/approve`, { notes });
  }

  adminRejectProperty(id: string, reason: string) {
    return this.http.post(`${this.base}/v1/admin/cribs/properties/${id}/reject`, { reason });
  }

  getTenantUnits(): Observable<TenantUnitSummary[]> {
    return this.http
      .get<{ success: boolean; data: TenantUnitSummary[] }>(`${this.base}/v1/tenant/units`)
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
      .get<{ success: boolean; data: TenantUnitDetail }>(`${this.base}/v1/tenant/units/${id}`)
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
}
