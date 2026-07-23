# Frontend Quality Guidelines

## Quality Gate

Run `pnpm check` for strict TypeScript plus the complete Vitest suite. Run
`pnpm build` when changing Vite, Tailwind, aliases, assets, or bundle-facing
code. Tests use jsdom and colocated `*.test.ts(x)` files.

## Test Boundaries

- Unit-test pure state/formatting helpers directly. Examples include
  `generation-state.test.ts`, `workspace-placeholders.test.ts`,
  `workspace-summary.test.ts`, and `shared/image-options.test.ts`.
- Mock the platform or service boundary for store and component tests. Never
  call a real provider, require a running Tauri shell, or depend on GitHub.
- For store workflows, reset platform memory and Zustand state between tests;
  assert both the visible state and the delegated service effect.
- For components, test behavior users can observe: opening/closing previews,
  event propagation, settings navigation, and disabled/pending states.
- Add regression coverage when changing a previously fragile boundary listed
  below.

## Known Regression Traps

- **Notifications:** Tauri desktop permission is granted by the native path;
  WebView `Notification.permission` is not authoritative. Send generation
  notifications only while unfocused and never fail generation because native
  notification delivery failed. See `lib/platform.test.ts` and
  `store/app-store.test.ts`.
- **Downloads:** Tauri downloads open the native save dialog and write the
  selected path. `DownloadCanceledError` is a quiet user cancellation, not an
  error toast. See `ImageTile.tsx` and `GalleryPage.tsx`.
- **Nested scrolling:** preserve `min-h-0` through every flex/grid ancestor.
  Result grids require `auto-rows-max`; sparse pages must not stretch cards.
- **Generation slots:** completed, failed, retrying, and removed request indexes
  keep their stable positions. Do not rebuild this behavior ad hoc in JSX.
- **Provider secrets:** tests must prove metadata writes use the secret boundary
  and edits without a new key retain the existing secret.
- **Updater fallback:** a normal no-update result must not open GitHub. Fallback
  is only for known updater source/signature failures, version comparison is
  numeric, and installer selection respects MSI versus NSIS. See
  `services/app-update.test.ts`.
- **Modal/tile propagation:** close/remove actions must not bubble into an
  underlying preview opener.

## Review Checklist

- Does the change stay in the correct component/store/service/adapter layer?
- Are new shared fields reflected in every constructor, normalizer, persisted
  shape, bridge contract, and test fixture?
- Are loading/error paths visible without clearing unrelated workspace state?
- Do async listeners and timers clean up on unmount?
- Does the desktop layout keep stable dimensions and bounded scrolling?
- Are secrets, local paths, and structured transport diagnostics handled at
  the intended boundary?
- Do focused tests and `pnpm check` pass?

## Provenance

Parts of PixAI-Tauri were adapted from `Adaoer/PixAI-Codex` at commit
`db3eefd5c217b7131f844b855f7c41ea10fd013e`, which is covered by the
PolyForm Noncommercial 1.0.0 notice stored under `THIRD_PARTY_NOTICES/`.
Before copying or adapting more upstream code, verify license compatibility and
preserve required notices. Do not describe adapted code as clean-room work.
