# Remote 0.0.16 Tag Audit

## Git Relationship

The published `0.0.16` tag points to `cc70e5c335bfa58b89734fcaf7212ab1718ba517`.
It is not contained by any local or remote branch:

```text
                     a6c40dd -> cc70e5c (tag: 0.0.16)
                    /
26f0b34 (origin/main, tag: 0.0.15)
                    \
                     2476eff (local main, Trellis migration)
```

The two tag-only patches do not overlap the migration commit's paths, and a
read-only merge-tree check found no conflict markers. Integration is still a
separate product/history decision because it adds user-facing behavior and a
version bump; this migration task does not perform it.

## Tag-Only Contracts

These contracts become candidates for Trellis specs after `0.0.16` is merged:

- Saving and revealing are separate operations. Download helpers return
  structured `path`, `paths`, `directory`, `savedCount`, and `canceled` data;
  UI preference `ask | always | never` decides whether to reveal a location.
  Reveal failure must not turn a successful download into a failed download.
  Anchors: `src/lib/platform.ts`, `DownloadedFolderPrompt.tsx`.
- Shell open/reveal calls go through `pixaiApi.shell`. Tauri opener-plugin
  failures fall back to the validated `open_directory` and `reveal_paths`
  commands, with matching handler registration and capabilities. Anchors:
  `src/services/app-api.ts`, `src-tauri/src/lib.rs`,
  `src-tauri/capabilities/default.json`.
- Image copying first attempts real image bytes. Text forms (`data`, `path`,
  `url`, or generic text) are explicit fallbacks so UI feedback remains
  accurate. Anchor: `copyImageSourceToClipboard` in `src/lib/platform.ts`.
- Composer accepts user-provided HTTP(S) reference-image links only through
  `readRemoteImageUrl`; the existing PNG/JPEG/WEBP and 20 MiB validation
  boundary still applies. The dialog closes only after the store reports a
  successful import. Anchors: `Composer.tsx`, `app-store.ts`.
- Store actions whose callers must distinguish handled failure from success
  return an explicit result (`importReferenceFiles` and
  `importReferencePayloads` return `boolean`) rather than treating promise
  completion as success.
- `0.0.16` keeps version values synchronized in `package.json`, Cargo, and
  Tauri configuration. It does not change updater selection or release scripts.

## Evidence And Gaps

Frontend tests cover download prompting, preference normalization, shell
fallbacks, clipboard fallback classification, Composer link/local imports,
and import rejection. The new Rust open/reveal commands do not have focused
Rust or real cross-platform tests; macOS and Linux behavior should not be
described as verified solely from TypeScript mocks.

The concrete reference-strip dimensions, CSS classes, labels, and release
version are implementation/history details rather than general coding rules.
