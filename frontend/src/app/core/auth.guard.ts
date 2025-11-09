import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { SessionService } from "./session.service";
import { redirectToCentralLogin } from "@berjis/angular-auth";

export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const ok = await session.ensure();
  if (!ok) {
    redirectToCentralLogin(state.url);
    return false;
  }
  return true;
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);
  const ok = await session.ensure();
  if (!ok) {
    redirectToCentralLogin(state.url);
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
    redirectToCentralLogin(state.url);
    return false;
  }
  if (!session.isLandlordTeam()) {
    router.navigateByUrl("/");
    return false;
  }
  return true;
};
