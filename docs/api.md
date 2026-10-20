# API overview

Base path: `/api/v1`. Authenticated routes use the `hrterra` HTTP-only cookie. JSON errors follow `{ error: { code, message, requestId } }`.

| Area       | Routes                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Auth       | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                                         |
| Companies  | `GET /companies` (platform admin)                                                               |
| Employees  | `GET/POST /employees`, `GET/PATCH /employees/:id`, `POST /employees/:id/deactivate`             |
| Hiring     | `GET/POST /candidates`, `POST /candidates/:id/offer`, `/accept`, `/convert`                     |
| Attendance | `GET /attendance`, `POST /attendance/check-in`, `/check-out`                                    |
| Camera     | `GET /camera-events`, `POST /camera-events/simulate`                                            |
| Salary     | `GET/POST /salary-structures`                                                                   |
| Payroll    | `GET/POST /payroll-runs`, `GET /payroll-runs/:id`, `POST /payroll-runs/:id/approve`, `/process` |
| Wallets    | `GET /wallets`, `POST /wallets/:id/transactions`                                                |
| HR support | `GET/POST /tickets`, `POST /support/message`                                                    |
| Dashboard  | `GET /dashboard`, `GET /audit-logs`                                                             |
| Health     | `GET /api/health/live`, `GET /api/health/ready` (outside `/v1`)                                 |

Retry-sensitive payroll and wallet operations require `Idempotency-Key`. Tenant selection uses the authenticated user's company. Platform admins may use `X-Company-Id` for a validated company context.
