# Owner Control Centre

## Entry and authorization

- Page: `frontend/pages/owner/dashboard.html`
- Script: `frontend/assets/js/core/owner-dashboard.js`
- The page declares `data-nexora-roles="owner"` and checks the current server session through `GET /api/auth/me`.
- Login and registration role routing now includes the `owner` destination. Owner accounts should only be created through the one-time server bootstrap process.
- The application review page permits both `admin` and `owner`; the API remains authoritative and owner access bypasses delegated permission grants.

## Current capabilities

- Displays Owner identity from the authenticated session.
- Lists delegated administrators and their active permission grants.
- Creates time-limited administrator invitations and displays the one-time acceptance token for secure out-of-band delivery.
- Replaces an administrator's permission set through the Owner-only API.
- Suspends or reactivates delegated administrator accounts.
- Displays application totals and recent audit activity where the existing APIs are available.

## Limitations

The page is a first operational control centre, not the complete NEXORA business-management dashboard. Project operations, client management, designer workload, finance, detailed reporting, MFA controls, and security configuration interfaces remain future work. Some counts may show unavailable when the corresponding API or permission is not yet implemented. Invitation email delivery is not integrated; the token must be handled securely by the Owner.

All sensitive actions must continue to be authorized by backend middleware and database rules. Frontend role guards and hidden controls are navigation aids only.
