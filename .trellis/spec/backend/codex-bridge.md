# Codex Bridge Guidelines

## Architecture

The Bridge is deliberately split:

- Rust (`src-tauri/src/lib.rs`) owns the loopback TCP listener, minimal HTTP
  parsing, body limits, CORS, request/response transport, and readiness/timeout
  handling.
- TypeScript (`src/services/codex-bridge.ts`) owns routes, input validation,
  PixAI business calls, compatibility fields, and public response shapes.
- `src/lib/platform.ts` owns the typed Tauri event/invoke wrappers.
- `scripts/pixai-codex.mjs` is the user-facing CLI client.

Do not duplicate TypeScript business logic in the Rust listener.

## Network And Parser Invariants

- Bind only to `127.0.0.1`. The default port is `43117`; honor
  `PIXAI_CODEX_PORT` when explicitly set, otherwise fall back to an ephemeral
  local port if the default is occupied.
- `PIXAI_CODEX_BRIDGE=0` disables startup. Startup is guarded by `OnceLock` and
  must happen at most once.
- Cap the declared body at 2 MiB, keep header and incremental buffer reads
  bounded, enforce the read timeout, validate UTF-8, and return structured 4xx
  responses for malformed or oversized requests.
- CORS accepts absent/null or localhost/loopback origins only. Never bind to
  `0.0.0.0`, accept arbitrary origins, or add remote-network discovery.
- Keep the health route available before the renderer handler is ready. Other
  routes return 503 until ready and use the existing bounded response wait.

## Business Dispatch

- Normalize method/path once and route through `PixaiApi`; Bridge handlers do
  not instantiate parallel stores or bypass image/prompt services.
- Validate finite inputs against the shared unions/options and return
  `BridgeHttpError` for client mistakes. Unknown failures become structured
  JSON errors.
- Keep endpoint lists synchronized across Rust health, TypeScript health,
  README examples, CLI behavior, shared types, and tests.
- Binary image responses cross the Tauri transport as base64 plus explicit
  content headers; JSON remains UTF-8.
- Mutations emit the existing changed event so the UI reloads affected state.

## Settings And Secrets

The Bridge intentionally accepts legacy `baseURL`/`baseUrl`, model, endpoint,
and optional `apiKey` fields for compatibility. This input compatibility is not
a license to expose secrets:

- Route keys through `ProviderSettingsStore` and the native secret boundary.
- Public settings may expose `apiKeyStored` and `insecureStorage`, never the raw
  key.
- Preserve separate image and prompt provider/model selections.

## Verification

- Rust tests cover loopback binding, fallback ports, parser size/error cases,
  and CORS.
- `src/services/codex-bridge.test.ts` covers routes, compatibility settings,
  generation/history, prompt routing, preflight errors, and unknown routes.
- Run the Rust and frontend suites after any route, payload, event, port, or
  timeout change.
