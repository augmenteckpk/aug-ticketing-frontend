import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { getToken, setToken } from '../services/api';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = getToken();
  const withJson = req.body && !req.headers.has('Content-Type') ? req.clone({ setHeaders: { 'Content-Type': 'application/json' } }) : req;
  const request = token ? withJson.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : withJson;
  return next(request).pipe(
    catchError((err) => {
      if (err?.status === 401) {
        setToken(null);
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
