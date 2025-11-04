import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { SessionService } from "./session.service";

function redirectToLanding(currentUrl: string) {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const absolute = currentUrl?.startsWith("http") ? currentUrl : origin + currentUrl;
    const target = "https://berjis.tech/login?returnTo=" + encodeURIComponent(absolute);
    window.location.href = target;
  }
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const ok = await session.ensure();
  if (!ok) {
    redirectToLanding(state.url);
    return false;
  }
  return true;
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const ok = await session.ensure();
  if (!ok) {
    redirectToLanding(state.url);
    return false;
  }
  if (!session.isAdmin()) {
    router.navigateByUrl("/");
    return false;
  }
  return true;
};

export const landlordGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const ok = await session.ensure();
  if (!ok) {
    redirectToLanding(state.url);
    return false;
  }
  if (!session.isLandlordTeam()) {
    router.navigateByUrl("/");
    return false;
  }
  return true;
};
