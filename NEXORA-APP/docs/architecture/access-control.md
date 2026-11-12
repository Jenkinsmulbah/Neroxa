# NEXORA Access-Control Matrix

| Resource/API area | Visitor | Client | Designer | Administrator |
|---|---:|---:|---:|---:|
| Public pages and service catalogue | Read | Read | Read | Read |
| Submit an application | Yes | Yes, where appropriate | Yes, where appropriate | Yes, where appropriate |
| Activate an account | Approved application only | Existing account | Existing account | CLI bootstrap only |
| Client API | No | Yes | No | Yes |
| Team/designer API | No | No | Yes | Yes |
| Application decisions | No | No | No | Yes |
| Account suspension/disablement | No | No | No | Yes |
| Identity verification status | No | No | No | Yes |

## Enforcement rules

1. The browser never chooses or upgrades a role.
2. Role assignment comes from an approved application type; administrator creation is a controlled CLI operation.
3. API authorization is server-side. A hidden link or JavaScript redirect is not authorization.
4. Protected middleware reloads role and account status from PostgreSQL, so a suspended or disabled account loses API access on its next protected request.
5. Identity verification is a separate status from application approval and account activation. A client or designer can be active while identity status remains `unverified`; later policies may require verification for specific sensitive actions.
6. Administrators cannot disable their own account through the current account-status endpoint.
7. Application decisions and account/verification changes are written to `audit_logs`.

## Status meanings

- `account_status`: `active`, `suspended`, `disabled` — controls account access.
- `identity_verification_status`: `unverified`, `pending`, `verified`, `rejected` — records the separate verification process.
- `applications.status`: application-review lifecycle — determines whether an applicant is eligible to activate an account.
