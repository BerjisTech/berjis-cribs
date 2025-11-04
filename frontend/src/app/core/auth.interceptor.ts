import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { inject } from '@angular/core';
import { SessionService } from './session.service';

const coreBase = environment.coreApi;
const cribsBase = environment.cribsApi;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const shouldAttachCreds = req.url.startsWith(coreBase) || req.url.startsWith(cribsBase);
  if (shouldAttachCreds) {
    req = req.clone({ withCredentials: true });
    // Unified auth: use X-User-UUID for app service calls (like logistics/notes)
    if (req.url.startsWith(cribsBase)) {
      let uuidHeader: string | undefined;
      try {
        const w: any = (typeof window !== 'undefined') ? (window as any) : {};
        uuidHeader = (w.__DEV_USER_ID__ as string | undefined) || (w.__DEV_USER_UUID__ as string | undefined) || undefined;
      } catch {}
      const session = inject(SessionService);
      const user = session.user?.();
      const candidate = uuidHeader || user?.uuid;
      if (candidate) {
        req = req.clone({ setHeaders: { 'X-User-UUID': candidate } });
      }
      // Also forward roles so the service can authorize without JWT roles
      try {
        const allRoles = [
          ...(session.roles?.() ?? []),
          ...(session.cribsRoles?.() ?? []),
        ].filter(Boolean);
        if (allRoles.length > 0) {
          const unique = Array.from(new Set(allRoles));
          req = req.clone({ setHeaders: { 'X-User-Roles': unique.join(',') } });
        }
      } catch {}
    }
  }
  return next(req);
};
