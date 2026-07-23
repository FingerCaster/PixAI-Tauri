# Remote 0.0.15 Integration Audit

## Authority

This audit follows the migration authority order: current `origin/main` source,
tests, configuration, and README outrank the reintroduced CodeStable records.
The remote branch added 22 historical CodeStable files while advancing the app
from `0.0.7` to `0.0.15`.

## Rules Captured In Trellis

- Destructive UI actions use `confirmDestructiveAction`: native Tauri warning
  dialogs on desktop, browser confirmation only as a fallback, and no mutation
  after decline/error. Anchors: `src/lib/confirm.ts`, callers under `src/`.
- Composer drafts debounce persistence, avoid IME writes, flush before generate
  or enrichment, and clean up native `onDragDropEvent` listeners. Anchor:
  `src/components/workspace/Composer.tsx`.
- Reference images use `storagePath` for native identity and display through
  `imageSourceForDisplay*`; legacy local/asset paths are normalized by
  `AppDatabase`. Remote provider URLs pass through the bounded native
  `read_remote_image_url` command before persistence. Anchors:
  `src/services/app-database.ts`, `src/lib/platform.ts`, `src-tauri/src/lib.rs`.
- Adapter call logs are diagnostic only and redact authorization, data URLs,
  base64, and oversized strings. Responses SSE errors remain provider errors
  even under HTTP 200. Anchor: `src/adapters/openai-compatible.ts`.
- Updater assets and targets are cross-platform: Windows MSI/NSIS, macOS
  `darwin-aarch64`/`darwin-x86_64`, merged same-version manifests, and explicit
  Linux in-app-update rejection. Anchors: `src/services/app-update.ts`,
  `scripts/updater-artifacts.mjs`, `.github/workflows/release.yml`.

## Rejected Historical Material

- Feature checklists, screenshots, test counts, release versions, and local
  process notes are historical evidence, not current engineering rules.
- The old macOS vision marks the work as draft although the current source and
  release pipeline implement it.
- Early reference-image design claims no store action is needed; current code
  intentionally has import actions and persisted reference state.
- Old destructive-action notes describe direct `window.confirm`; current code
  must use the desktop-aware shared helper.
