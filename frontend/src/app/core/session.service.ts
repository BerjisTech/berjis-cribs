import { Injectable, computed, signal, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { environment } from "../../environments/environment";

interface VerifyResponse {
  success: boolean;
  data: { valid: boolean; uid?: number; uuid?: string; email?: string };
}

export interface UserProfile {
  uuid: string;
  email: string;
  name?: string;
  username?: string;
  avatarUrl?: string;
  publicProfile?: boolean;
}

@Injectable({ providedIn: "root" })
export class SessionService {
  private http = inject(HttpClient);
  private state = signal({ user: null as UserProfile | null, roles: [] as string[], cribsRoles: [] as string[], loading: false });

  readonly user = computed(() => this.state().user);
  readonly roles = computed(() => this.state().roles);
  readonly cribsRoles = computed(() => this.state().cribsRoles);
  readonly loading = computed(() => this.state().loading);

  async ensure(): Promise<boolean> {
    if (this.state().loading) {
      return !!this.state().user;
    }
    this.state.update((s) => ({ ...s, loading: true }));
    try {
      let verify = await firstValueFrom(
        this.http.get<VerifyResponse>(environment.coreApi + "/v1/auth/verify", { withCredentials: true })
      );
      if (!verify?.data?.valid) {
        await firstValueFrom(this.http.post(environment.coreApi + "/v1/auth/refresh", {}, { withCredentials: true }));
        verify = await firstValueFrom(
          this.http.get<VerifyResponse>(environment.coreApi + "/v1/auth/verify", { withCredentials: true })
        );
        if (!verify?.data?.valid) {
          this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [], loading: false }));
          return false;
        }
      }
      const [profileRes, rolesRes, cribsRes] = await Promise.all([
        firstValueFrom(
          this.http.get<{ success: boolean; data: UserProfile }>(environment.coreApi + "/v1/me", { withCredentials: true })
        ),
        firstValueFrom(
          this.http.get<{ success: boolean; data: string[] }>(environment.coreApi + "/v1/auth/roles", { withCredentials: true })
        ),
        firstValueFrom(
          this.http.get<{ success: boolean; data: string[] }>(environment.coreApi + "/v1/apps/cribs/roles", { withCredentials: true })
        ),
      ]);
      this.state.update((s) => ({
        ...s,
        user: profileRes?.data ?? null,
        roles: rolesRes?.data ?? [],
        cribsRoles: cribsRes?.data ?? [],
        loading: false,
      }));
      return true;
    } catch (error) {
      console.error("session ensure failed", error);
      this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [], loading: false }));
      return false;
    }
  }

  signOutLocal() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("berjis.accessToken");
    }
    this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [] }));
  }

  hasRole(role: string) {
    const current = this.state();
    return current.roles.includes(role) || current.cribsRoles.includes(role);
  }

  isAdmin() {
    const current = this.state();
    return current.roles.some((r) => r.includes("admin")) || current.cribsRoles.some((r) => r.includes("admin"));
  }
}
