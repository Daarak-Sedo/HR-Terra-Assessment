# Security notes

- Authentication uses an 8-hour signed JWT in an HTTP-only, same-site cookie; production cookies are marked secure. Passwords are bcrypt hashes.
- Users and company context are read from MongoDB after validating the signed token. Frontend role claims and request body company IDs are ignored.
- Company-owned database queries carry the authorized `companyId`. Platform-wide company listing is limited to `PLATFORM_ADMIN`.
- Employee role responses are restricted to the employee's own employee record. Salary fields use Mongoose `select: false` and payroll endpoints have separate roles.
- Zod validates inputs and central error handling does not return stack traces or database errors.
- The login route has a 10-attempt / 15-minute rate limit. Helmet and an explicit CORS origin allowlist are enabled.
- Wallet debits and ledger entries update atomically in one MongoDB document with a required idempotency key.
- Payroll is a development mock only. Before production it needs replica-set transactions, per-employee payment records, reconciliation, approval separation, and a real provider adapter.
- No raw face images or biometric templates are stored. Camera events are authenticated by the signed-in HR/admin session and are always held for manual review.

## Limits

The demo does not implement CSRF tokens, refresh tokens/revocation, full manager/resource permission policies, WebSocket authorization, a persisted external-message inbox, or an actual external identity/device signature system. SameSite cookies and origin allowlisting provide browser-origin safeguards in this demo; deploy behind HTTPS and add explicit CSRF protection and device signatures before production.
