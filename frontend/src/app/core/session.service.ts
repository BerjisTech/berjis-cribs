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
  private state = signal({
    user: null as UserProfile | null,
    roles: [] as string[],
    cribsRoles: [] as string[],
    loading: false,
  });

  private inflight: Promise<boolean> | null = null;

  readonly user = computed(() => this.state().user);
  readonly roles = computed(() => this.state().roles);
  readonly cribsRoles = computed(() => this.state().cribsRoles);
  readonly loading = computed(() => this.state().loading);
  readonly isAuthenticated = computed(() => !!this.state().user);
  readonly isPlatformAdmin = computed(() => this.state().roles.includes("platform.admin"));
  readonly isCribsAdmin = computed(() => this.state().cribsRoles.some((role) => role === "cribs.admin" || role.startsWith("cribs.admin.")));
  readonly canManageLandlord = computed(() =>
    this.state().cribsRoles.some(
      (role) =>
        role === "cribs.landlord" || role.startsWith("cribs.landlord.") || role.startsWith("cribs.staff") || role.startsWith("cribs.admin"),
    ),
  );
  readonly canAccessAdmin = computed(() => this.isPlatformAdmin() || this.isCribsAdmin());

  async ensure(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    this.state.update((s) => ({ ...s, loading: true }));
    this.inflight = (async () => {
      let verify = await firstValueFrom(
        this.http.get<VerifyResponse>(environment.coreApi + "/v1/auth/verify", { withCredentials: true })
      );
      if (!verify?.data?.valid) {
        await firstValueFrom(
          this.http.post(environment.coreApi + "/v1/auth/refresh", {}, { withCredentials: true })
        );
        verify = await firstValueFrom(
          this.http.get<VerifyResponse>(environment.coreApi + "/v1/auth/verify", { withCredentials: true })
        );
      }
      if (!verify?.data?.valid) {
        this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [], loading: false }));
        return false;
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
    })().catch((_err) => {
      this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [], loading: false }));
      return false;
    }).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  signOutLocal() {
    this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [] }));
  }

  hasRole(role: string) {
    if (!role) {
      return false;
    }
    const current = this.state();
    return current.roles.includes(role) || current.cribsRoles.includes(role);
  }

  hasAnyRole(...roles: string[]) {
    return roles.some((role) => this.hasRole(role));
  }

  hasRoleWithPrefix(prefix: string) {
    if (!prefix) {
      return false;
    }
    const current = this.state();
    return current.roles.some((role) => role.startsWith(prefix)) || current.cribsRoles.some((role) => role.startsWith(prefix));
  }

  isAdmin() {
    return this.isPlatformAdmin() || this.isCribsAdmin();
  }

  isLandlordTeam() {
    return this.canManageLandlord();
  }

  // No front-end managed tokens in unified auth; cookie session + X-User-UUID is used.
}
