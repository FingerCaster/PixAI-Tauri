# Legacy Knowledge Audit

## Inventory

| Source | Files | Approximate size | Recovery |
|---|---:|---:|---|
| `.omx/` | 190 | 1.80 MB | Ignored; reference clone recoverable upstream, runtime history is not |
| `.codestable/` | 40 | 387 KB | Fully tracked and recoverable from Git history |

## Knowledge Migration Map

| Legacy knowledge | Current evidence | Target |
|---|---|---|
| Tailwind v4 + shadcn source primitives; no parallel legacy stylesheet | `components.json`, `src/index.css`, `src/components/ui/`, `src/lib/utils.ts` | Frontend components/directory specs |
| Workspace parameters are high-frequency; global settings own low-frequency preferences and provider management | `WorkspaceConfigPanel.tsx`, `GlobalSettingsModal.tsx`, `ServicesSettingsTab.tsx` | Frontend components/directory specs |
| Zustand orchestrates application state; services own persistence and provider behavior | `src/store/app-store.ts`, `src/services/app-api.ts`, `src/services/*` | Frontend state spec |
| Provider adapters are capability-driven and image/prompt provider selections may differ | `src/adapters/*`, `provider-settings.ts`, related tests | Frontend state/type specs |
| Tauri desktop notification permission is not WebView `Notification.permission` | `src/lib/platform.ts`, `platform.test.ts` | Frontend quality and backend Tauri specs |
| Native download uses a save dialog and cancellation is not an error | `src/lib/platform.ts`, download-related fix history | Frontend quality/backend Tauri specs |
| Scroll containers require a bounded flex chain; result grids must not stretch sparse rows | `CanvasArea.tsx`, gallery/workspace regression history | Frontend component/quality specs |
| Single-instance plugin runs first and reuses main-window activation | `src-tauri/src/lib.rs`, `Cargo.toml` | Backend Tauri spec |
| Bridge is loopback-only, Rust owns transport, TypeScript owns business dispatch, bodies are bounded, secrets are not returned | `src-tauri/src/lib.rs`, `src/services/codex-bridge.ts`, bridge tests | Backend Bridge spec |
| Updater is signed, installer-aware, and only falls back for source failures; local feed never replaces production config | `app-update.ts`, tests, updater scripts, Tauri configs, README | Backend updater spec |

## Rejected Stale Statements

- The old Bridge PRD says settings must reject raw API key/base URL fields.
  Current compatibility handling accepts them, stores secrets through the
  secret boundary, and exposes only `apiKeyStored`; the old statement must not
  become a Trellis rule.
- Early notification plans cover successful generation only. Current store
  behavior handles both success and failure completion notifications while the
  app is unfocused, subject to the stored preference/permission contract.
- Old Electron runtime, data-directory, and packaging instructions do not apply
  to the Tauri application.

## Provenance And License

- Upstream: `https://github.com/Adaoer/PixAI-Codex.git`
- Audited commit: `db3eefd5c217b7131f844b855f7c41ea10fd013e`
- License: PolyForm Noncommercial 1.0.0
- Required notice: `Required Notice: Copyright 2026 PixAI`

No files are byte-identical between the current and reference repositories,
but a path-aligned comparison found meaningful retained code in core models,
generation helpers/state, and `scripts/pixai-codex.mjs`. Attribution and the
license text therefore must survive removal of the local clone. The repository
owner, not this migration, decides whether the root project license changes.

## Residue Outside Legacy Directories

- `README.md`: local `.omx/reference` snapshot statement.
- `vitest.config.ts`: `.omx` exclusion.
- `.git/info/exclude`: `.omx/` ignore entry.
- `.codedb-mcp/manifest.json` and `index.bin`: generated index includes the two
  CodeStable YAML tools.

No legacy references were found in package/lock files, Cargo metadata,
application scripts, AGENTS, current Codex integration, or Trellis runtime.
