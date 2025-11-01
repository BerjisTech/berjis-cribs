import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

const coreBase = environment.coreApi;
const cribsBase = environment.cribsApi;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const shouldAttachCreds = req.url.startsWith(coreBase) || req.url.startsWith(cribsBase);
  if (shouldAttachCreds) {
    req = req.clone({ withCredentials: true });
    const token = (typeof window !== 'undefined') ? window.sessionStorage.getItem('berjis.accessToken') : null;
    if (token && req.url.startsWith(cribsBase) && !req.headers.has('Authorization')) {
      req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }
    if (typeof window !== 'undefined') {
      const devId = (window as any).__DEV_USER_ID__ as string | undefined;
      if (devId && !req.headers.has('Authorization') && req.url.startsWith(cribsBase)) {
        req = req.clone({ setHeaders: { 'X-User-ID': devId } });
      }
    }
  }
  return next(req);
};
