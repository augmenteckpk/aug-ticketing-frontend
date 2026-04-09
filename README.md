# Web

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.2.6.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Migration Notes (React -> Angular)

This folder now contains the Angular migration target for the former React staff console.

- Route parity implemented for:
  - `/login`
  - `/display/waiting`
  - `/app` and child routes (dashboard, appointments, reports, registration, waiting-area, consultation, laboratory, queue, hospitals, centers, departments, clinics, patients, users, roles)
- Core auth/API parity implemented:
  - Token key `opd_token`
  - Auth bootstrap (`/auth/me`)
  - Login (`/auth/login`)
  - Auth HTTP interceptor (`Authorization: Bearer ...`)
  - Guard behavior (redirect unauthenticated; patient role blocked from staff shell)
- Waiting board parity foundation implemented:
  - Public centers API
  - Waiting board SSE stream
  - Polling fallback
- Reporting parity foundation implemented:
  - Daily report JSON load
  - CSV export with bearer token

## Cutover Checklist

1. Set API URL in `src/environments/environment*.ts`.
2. Run build verification:
   - `npm run build`
3. Smoke test key flows:
   - login
   - appointments
   - queue
   - reports
   - waiting display SSE fallback
4. Switch deployment source from React `frontend` to Angular `frontend-new/dist/web`.
5. Keep React app available as rollback until UAT sign-off.
