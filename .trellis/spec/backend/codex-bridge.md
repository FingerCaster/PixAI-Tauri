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

## Scenario: Live Generation Lifecycle

### 1. Scope / Trigger

- Trigger: `/generate` and `/images/:id/reedit` are long-running Bridge
  mutations whose persisted `running` state must be visible before the HTTP
  response completes.

### 2. Signatures

```ts
type ImageGenerationLifecycle = {
  onRunStarted?: (run: GenerationRun) => void | Promise<void>
}

image.generate(input: GenerateImageInput, lifecycle?: ImageGenerationLifecycle)
```

`ImageService.generate` invokes `onRunStarted` after `insertRun` and request
controller registration, but before awaiting provider work. The observer is
best-effort and must not turn a persisted run into a generation failure.

### 3. Contracts

Generation changes use `pixai://codex-bridge/changed`:

```ts
type CodexBridgeGenerationChange = {
  type: 'generation'
  phase: 'started' | 'finished'
  conversationId: string
  runId: string
  createdAt: string
  conversation?: Conversation
}
```

- `started` carries the resolved conversation snapshot so a newly created
  project conversation can render immediately. Strip reference `dataUrl`
  payloads before emitting it.
- `finished` identifies the same run and is emitted in `finally` after every
  started request, including success, provider failure, cancellation, and an
  unexpected post-start error.
- Project-path routing and explicit `conversationId` precedence are resolved
  before lifecycle emission and must not be reimplemented by the UI.
- Register the changed-event listener before marking the renderer Bridge
  handler ready, or the first request can race past the listener.

### 4. Validation & Error Matrix

| Condition | Run | Lifecycle events | Bridge result |
|---|---|---|---|
| Invalid prompt/provider/capability preflight | none | none | existing 400 error |
| Provider succeeds | running -> succeeded | started, finished | 201 |
| Provider returns a handled batch failure | running -> failed | started, finished | 202 |
| Request is canceled | running -> failed | started, finished | existing canceled result |
| Event emission fails | unchanged | best effort | generation continues |

### 5. Good/Base/Bad Cases

- Good: a new `projectPath` emits a sanitized conversation plus running run ID,
  and the workbench renders that workspace before the provider resolves.
- Base: an existing conversation receives the same lifecycle without changing
  Bridge response fields.
- Bad: emit one unstructured `generation` event only after awaiting
  `image.generate`; this hides the only observable running interval.

### 6. Tests Required

- Defer provider completion and assert the start callback observes a persisted
  `status: 'running'` run before provider fetch.
- Assert `/generate` has not settled when the running run becomes observable.
- Assert `/reedit` uses the same lifecycle helper.
- Assert preflight failure invokes no start callback and persists no run.
- Store tests must cover first-frame conversation insertion, concurrent run-ID
  deduplication, completion cleanup, and stale-refresh rejection.

### 7. Wrong vs Correct

```ts
// Wrong: completion-only notification.
const result = await api.image.generate(input)
await notifyBridgeChange('generation')

// Correct: persist -> started -> provider -> finished.
await api.image.generate(input, { onRunStarted })
// The Bridge wrapper emits finished in finally for the same runId.
```

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
  generation lifecycle/history, prompt routing, preflight errors, and unknown
  routes.
- Run the Rust and frontend suites after any route, payload, event, port, or
  timeout change.
