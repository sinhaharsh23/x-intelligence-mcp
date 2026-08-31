# NitroCloud preflight findings

## Evidence status

| Area | Finding | Status |
|---|---|---|
| Public deployment description | Official NitroCloud page describes GitHub/CLI/ZIP source workflows | VERIFIED FROM PUBLIC DOCS |
| Public hostname | Official page describes a NitroCloud subdomain/custom domains | VERIFIED FROM PUBLIC DOCS; exact project URL UNVERIFIED |
| HTTPS | Official page describes automatic Let's Encrypt SSL, HSTS, and TLS 1.3 | VERIFIED FROM PUBLIC DOCS; this project has not been hosted |
| Secrets | Official page describes encrypted secrets and RBAC | VERIFIED FROM PUBLIC DOCS; exact variable UI/mapping UNVERIFIED |
| CLI login/deploy | Not present in installed `@nitrostack/cli` 1.0.15 | VERIFIED ABSENT LOCALLY |
| Platform rate limiting | No public NitroCloud-specific limit/configuration found | UNVERIFIED |
| Health probe | No NitroCloud-specific path/contract found | UNVERIFIED |
| Widget hosting | Public material says MCP apps/widgets are supported, but exact project packaging contract is not specified | UNVERIFIED |
| GitHub requirement | Official cloud page describes GitHub-native deployment but also advertises CLI/ZIP | GITHUB LIKELY SUPPORTED, REQUIREDNESS UNVERIFIED |

## Project-side readiness

The project supplies a production `dist/index.js`, native NitroStack dual/HTTP
transport, bundled widget output, and a fail-closed MCP OAuth gate. The gate
requires hosted `HOST=0.0.0.0` because NitroStack’s documented dual-transport
example binds that address.

The current local X OAuth state remains separate and intentionally disabled:
`X_AUTH_ENABLED=false`. That does not disable MCP OAuth enforcement in a
production process.

## Manual account actions for Phase 5

1. Obtain NitroCloud access through the official NitroCloud account flow.
2. Choose the supported source workflow shown by the account UI (GitHub,
   upload/ZIP, or CLI if the account exposes one).
3. Enter non-secret production configuration values in the project settings.
4. Enter secrets directly into the NitroCloud encrypted secret facility.
5. Confirm the assigned HTTPS URL and configure `RESOURCE_URI` and
   `TOKEN_AUDIENCE` to that exact protected-resource URL.
6. Verify the hosted health probe and authenticated MCP execution before
   enabling any public client.

Do not send secret values to chat or commit them to the repository.
