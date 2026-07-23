# Tauri Runtime Guidelines

## Native Boundary

`src-tauri/src/lib.rs` owns capabilities that require native access: window and
tray control, notifications, app-data files, secrets, HTTP proxying, local
image files, Codex skill installation, updater plugin registration, and the
loopback Bridge transport. TypeScript accesses these through
`src/lib/platform.ts`.

Keep product/business decisions in TypeScript services. A Tauri command should
validate and perform a native operation, return a typed/structured result, and
avoid duplicating store or provider workflow logic.

## Builder And Plugin Invariants

- Register `tauri_plugin_single_instance` first. Its callback must reuse
  `activate_main_window_for` so a second process focuses the existing window.
- Register dialog, notification, opener, process, and updater plugins before
  setup. Setup creates the tray and starts the Bridge once.
- When adding a command, update all four surfaces: the Rust function,
  `tauri::generate_handler!`, the `lib/platform.ts` wrapper, and relevant
  shared types/tests. Plugin permissions also belong in
  `src-tauri/capabilities/default.json`.
- Keep platform-specific registry/notification code under `cfg` gates so other
  targets compile.

## Files And Persistence

- Application JSON lives below `app.path().app_data_dir()`. State names pass
  through `sanitize_name`; never concatenate untrusted names directly into a
  path.
- File/data-URL commands validate input, generate collision-safe paths, and
  return normalized metadata. UI code uses the native save dialog through
  `lib/platform.ts`; cancellation remains a typed non-error path.
- Image display may use stored paths, asset URLs, data URLs, or remote URLs.
  Preserve conversion/caching behavior in the platform wrapper rather than
  teaching components filesystem rules.
- `read_remote_image_url` is the native boundary for provider-returned image
  URLs. It accepts HTTP(S) only, validates PNG/JPEG/WEBP content, enforces the
  20 MiB limit both from headers and while streaming, and returns a normalized
  data URL payload before service persistence. Do not make desktop components
  fetch arbitrary provider URLs directly.

## Remote Reference Image Contract

### 1. Scope / Trigger

Provider responses can contain an external image URL. This crosses Rust HTTP,
the `lib/platform.ts` wrapper, `ImageService`, and `AppDatabase`; it must be
normalized before it becomes an image or reference record.

### 2. Signatures

- Rust command: `read_remote_image_url(url: String) -> Result<RemoteImageReadResult, String>`.
- TypeScript boundary: `readRemoteImageUrl(url: string): Promise<ReferenceImageFilePayload>`.

### 3. Contracts

- Input is a trimmed HTTP(S) URL only.
- Output is a named PNG/JPEG/WEBP payload with a base64 data URL and file size.
- The native command enforces the 20 MiB limit from both `Content-Length` and
  streamed bytes; `ImageService` then uses the ordinary storage pipeline.

### 4. Validation And Error Matrix

- Invalid/non-HTTP URL -> actionable validation error; no network request.
- Unsupported MIME or oversized body -> actionable image-import error; no
  persistence write.
- Valid image -> normalized payload -> app-data storage -> display through the
  TypeScript platform helper.

### 5. Good, Base, And Bad Cases

- Good: an HTTPS PNG URL is normalized and stored before history persistence.
- Base: a data URL continues through the existing storage path unchanged.
- Bad: a component fetches a remote URL directly and stores the raw URL or an
  unverified path in `dataUrl`.

### 6. Tests Required

- `src/lib/platform.test.ts` verifies platform normalization/mock boundaries.
- `src/services/image-service.test.ts` verifies provider image URLs enter the
  existing storage pipeline.
- Add Rust helper coverage when changing URL scheme, MIME, or byte limits.

### 7. Wrong Vs Correct

#### Wrong

```ts
item.dataUrl = providerImageUrl
```

#### Correct

```ts
const payload = await readRemoteImageUrl(providerImageUrl)
// Pass payload through the owning service/database persistence path.
```

## Secrets

- Store provider keys in the native keyring when available. The app-data JSON
  fallback is explicit and returns `insecure_storage: true` so the UI can warn.
- Persist only secret presence/backend metadata in provider profiles. Never
  emit raw keys through public settings, Bridge responses, logs, or errors.
- Deleting a provider must remove both keyring and fallback entries.

## Native HTTP And Errors

- Provider/GitHub traffic uses the Rust HTTP proxy in Tauri to honor system
  proxy and native TLS behavior. Preserve timeouts, streaming event ordering,
  and structured diagnostics from `format_http_proxy_error`.
- Validate URL scheme and HTTP method before sending. Do not turn arbitrary
  non-HTTP URLs into a generic native fetch primitive.
- Keep remote-reference URL validation separate from the general proxy:
  `read_remote_image_url` has its own scheme, image MIME, and byte-limit
  contract so untrusted image content cannot enter the app-data persistence
  path unchecked.
- Errors crossing `invoke` should retain enough stage/source-chain data for
  `PlatformHttpProxyError` and `ErrorDetailsModal`, without exposing secrets.

## Window, Tray, And Notifications

- Close-to-tray is a preference-driven frontend decision; Rust provides
  activate, hide, quit, tray-menu, and native notification operations.
- Tauri notification permission is not the WebView permission. Preserve the
  platform wrapper's desktop behavior and native activation event.
- Native notification failure is non-fatal to generation and window state.

## Tests And Anti-Patterns

`src-tauri/src/lib.rs` contains focused unit tests for sanitization, Bridge
parsing/CORS/binding, filenames, and structured errors. Add tests next to pure
Rust helpers when changing those contracts.

Avoid:

- Moving provider/domain orchestration into Rust commands.
- Registering the single-instance plugin after plugins with visible setup.
- Raw path concatenation or unsanitized skill relative paths.
- Silent keyring fallback without surfacing its insecure status.
- Adding an invoke command without its capability/wrapper/test surfaces.
