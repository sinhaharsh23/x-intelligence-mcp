# Deployment preflight

This project is not deployed from this repository by Phase 4.6. The installed
`@nitrostack/cli` 1.0.15 supports `build`, `start`, `dev`, `pack`, and project
management commands, but it does not expose `login` or `deploy`.

The current official NitroStack cloud material describes NitroCloud as a
GitHub/CLI/ZIP-oriented hosted platform with automatic SSL, environment
variables, and encrypted secrets. It does not provide enough account-specific
detail in the public docs to verify the exact project creation, secret-entry,
or deploy UI/API for this workspace. Treat those steps as `UNVERIFIED` until
the NitroCloud account/dashboard is available.

## Verified project build/start process

```text
BUILD: npm run build
START: node dist/index.js
LOCAL HTTP: npm run dev:http
PACK CHECK: npx nitrostack-cli pack --dry-run
```

`npm run start:prod` currently delegates to `nitrostack-cli start`, but the
hosted start contract is not verified by this preflight. The direct
`node dist/index.js` process is the project’s actual production bootstrap and
executes the production security gate before creating the NitroStack server.

## Required hosted process environment

Production must inject `NODE_ENV=production`, `HOST=0.0.0.0`, HTTP/dual
transport, `PORT`, and the complete NitroStack OAuth verifier configuration.
The production gate rejects loopback binding, HTTP resource/auth URLs,
disabled MCP authentication, and missing or ambiguous token verification.

`RESOURCE_URI` must be the eventual HTTPS protected-resource URL for this MCP
service. `AUTH_SERVER_URL` must be the HTTPS issuer/authorization-server URL.
They are different settings and must not be substituted for one another.

## NitroCloud items still requiring account verification

- Whether this project is imported by GitHub, uploaded as ZIP, or created via a
  currently available dashboard/API flow.
- The exact NitroCloud project creation and deployment action.
- The exact environment/secret UI and variable-name mapping.
- The assigned public hostname and MCP path.
- Whether a hosted process should run dual transport or HTTP-only.
- Platform request rate limits and whether they are configurable.
- Health-check path and probe configuration.

Do not run `nitrostack login` or `nitrostack deploy` from this checkout based on
the installed CLI; those commands are not present in version 1.0.15.
