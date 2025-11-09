import { Injectable, computed, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";
import { CoreAuthService, CoreAuthSession } from "@berjis/angular-auth";
import { environment } from "../../environments/environment";

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
  private auth = inject(CoreAuthService);

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
        role === "cribs.landlord" ||
        role.startsWith("cribs.landlord.") ||
        role.startsWith("cribs.staff") ||
        role.startsWith("cribs.admin"),
    ),
  );
  readonly canAccessAdmin = computed(() => this.isPlatformAdmin() || this.isCribsAdmin());

  async ensure(): Promise<boolean> {
    if (this.inflight) {
      return this.inflight;
    }
    this.state.update((s) => ({ ...s, loading: true }));
    this.inflight = (async () => {
      try {
        const session = await this.auth.ensureAuth({ maxAgeMs: 1500 });
        if (!session?.valid) {
          this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [], loading: false }));
          return false;
        }

        const [profileRes, rolesRes, cribsRes] = await Promise.all([
          this.getCore<{ success: boolean; data: UserProfile }>("/v1/me"),
          this.getCore<{ success: boolean; data: string[] }>("/v1/auth/roles"),
          this.getCore<{ success: boolean; data: string[] }>("/v1/apps/cribs/roles"),
        ]);

        const profile = this.buildProfile(session, profileRes?.data ?? null);
        const globalRoles = this.mergeRoleSets(
          this.normalizeRoles(rolesRes?.data),
          this.collectGlobalRoles(session),
        );
        let cribsRoles = this.mergeRoleSets(
          this.normalizeRoles(cribsRes?.data),
          this.collectCribsRoles(session),
        );

        if (!cribsRoles.some((role) => role === "cribs.landlord" || role.startsWith("cribs.landlord."))) {
          const landlord = await this.getCribs<{ success: boolean; data: any | null }>("/v1/landlord/profile");
          if (landlord?.data && landlord.data.status === "active") {
            cribsRoles = this.mergeRoleSets(["cribs.landlord"], cribsRoles);
          }
        }

        this.state.update((s) => ({
          ...s,
          user: profile,
          roles: globalRoles,
          cribsRoles,
          loading: false,
        }));
        return true;
      } catch (_err) {
        this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [], loading: false }));
        return false;
      }
    })().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  signOutLocal() {
    this.auth.clearCache();
    this.state.update((s) => ({ ...s, user: null, roles: [], cribsRoles: [] }));
  }

  hasRole(role: string) {
    if (!role) {
      return false;
    }
    const current = this.state();
    const target = role.trim().toLowerCase();
    return current.roles.includes(target) || current.cribsRoles.includes(target);
  }

  hasAnyRole(...roles: string[]) {
    return roles.some((role) => this.hasRole(role));
  }

  hasRoleWithPrefix(prefix: string) {
    if (!prefix) {
      return false;
    }
    const pref = prefix.toLowerCase();
    const current = this.state();
    return current.roles.some((role) => role.startsWith(pref)) || current.cribsRoles.some((role) => role.startsWith(pref));
  }

  isAdmin() {
    return this.isPlatformAdmin() || this.isCribsAdmin();
  }

  isLandlordTeam() {
    return this.canManageLandlord();
  }

  private normalizeRoles(values?: string[] | null): string[] {
    if (!values || !values.length) {
      return [];
    }
    const set = new Set<string>();
    for (const value of values) {
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim().toLowerCase();
      if (trimmed) {
        set.add(trimmed);
      }
    }
    return Array.from(set);
  }

  private mergeRoleSets(...sets: Array<string[] | undefined>): string[] {
    const set = new Set<string>();
    for (const list of sets) {
      if (!list) {
        continue;
      }
      for (const value of list) {
        const trimmed = typeof value === "string" ? value.trim().toLowerCase() : "";
        if (trimmed) {
          set.add(trimmed);
        }
      }
    }
    return Array.from(set);
  }

  private collectGlobalRoles(session: CoreAuthSession): string[] {
    return this.mergeRoleSets(session.roles ?? [], session.platformRoles ?? []);
  }

  private collectCribsRoles(session: CoreAuthSession): string[] {
    const appRoles = session.appRoles?.["cribs"] ?? [];
    return this.normalizeRoles(appRoles);
  }

  private buildProfile(session: CoreAuthSession, apiProfile: UserProfile | null): UserProfile {
    const baseProfile = (session.profile || {}) as Record<string, unknown>;
    const merged: UserProfile = {
      uuid: this.pickString(session.uuid) ||
        this.pickString(baseProfile["uuid"]) ||
        this.pickString(apiProfile?.uuid) ||
        "",
      email: this.pickString(session.email) || this.pickString(baseProfile["email"]) || this.pickString(apiProfile?.email) || "",
      name: this.pickString(baseProfile["name"]) || this.pickString(apiProfile?.name),
      username: this.pickString(baseProfile["username"]) || this.pickString(apiProfile?.username),
      avatarUrl: this.pickString(baseProfile["avatarUrl"] ?? baseProfile["avatar_url"]) || this.pickString(apiProfile?.avatarUrl),
      publicProfile: typeof baseProfile["publicProfile"] === "boolean"
        ? baseProfile["publicProfile"]
        : apiProfile?.publicProfile,
    };
    if (!merged.uuid && apiProfile?.uuid) {
      merged.uuid = apiProfile.uuid;
    }
    if (!merged.email && apiProfile?.email) {
      merged.email = apiProfile.email;
    }
    return merged;
  }

  private pickString(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length) {
      return value.trim();
    }
    return undefined;
  }

  private async getCore<T>(path: string): Promise<T | null> {
    try {
      return await firstValueFrom(this.http.get<T>(environment.coreApi + path, { withCredentials: true }));
    } catch {
      return null;
    }
  }

  private async getCribs<T>(path: string): Promise<T | null> {
    try {
      return await firstValueFrom(this.http.get<T>(environment.cribsApi + path, { withCredentials: true }));
    } catch {
      return null;
    }
  }
}
