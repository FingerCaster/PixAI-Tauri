# Legacy Knowledge Migration Design

## Authority Order

Migration decisions use this evidence order:

1. Current source, tests, package manifests, and runtime configuration.
2. Current README behavior and release instructions.
3. CodeStable architecture/decision documents after source verification.
4. OMX plans and interviews only as historical leads.

This avoids importing stale rules. For example, the old Bridge PRD says raw
provider fields are rejected, while `src/services/codex-bridge.ts` currently
accepts compatibility fields and only redacts secrets from responses.

Published tags do not outrank the checked-out branch automatically. A release
tag that is not an ancestor of `main` is useful research evidence, but its
unique behavior stays out of current-branch specs until the release commits
are explicitly integrated.

## Trellis Spec Shape

The existing frontend scaffold remains the stable navigation surface, but each
file will be rewritten from repository evidence:

- `frontend/directory-structure.md`: runtime and source ownership map.
- `frontend/component-guidelines.md`: Tailwind v4, shadcn primitives, desktop
  layout, settings-layer, and interaction composition rules.
- `frontend/hook-guidelines.md`: actual hook/effect ownership and cleanup rules;
  explicitly document that the project has no shared custom-hook layer today.
- `frontend/state-management.md`: Zustand orchestration, services, persistence,
  adapters, and transient UI state boundaries.
- `frontend/type-safety.md`: shared contracts, adapter capability typing,
  normalization, and error-shape rules.
- `frontend/quality-guidelines.md`: test patterns and known regression traps.

A new `backend/` layer will hold concerns owned by `src-tauri/` and release
tooling:

- `backend/index.md`: navigation and ownership summary.
- `backend/tauri-guidelines.md`: command boundary, filesystem/secrets, tray,
  notification, and single-instance invariants.
- `backend/codex-bridge.md`: loopback transport, request limits, CORS, frontend
  business dispatch, structured responses, and secret redaction.
- `backend/updater-and-release.md`: signed updater, installer-aware fallback,
  production/local feed separation, and key handling.

The specs describe current behavior, not the retired tools or their workflows.

## Third-Party Provenance

The reference clone is not treated as disposable because current files retain
meaningful adapted code. Before deletion:

- Copy its complete license text, including the required notice, into
  `THIRD_PARTY_NOTICES/PixAI-Codex-LICENSE.txt`.
- Update README to link `https://github.com/Adaoer/PixAI-Codex`, record commit
  `db3eefd5c217b7131f844b855f7c41ea10fd013e`, name its license, and state that
  parts of the implementation were adapted.
- Add a Trellis anti-pattern against copying more upstream code without first
  checking license compatibility.

This preserves attribution without making an unrequested decision about the
root repository license.

## Cleanup Boundaries

Delete:

- All of `.omx/` after provenance and useful invariants are preserved.
- All of `.codestable/` after current rules are represented in Trellis.
- The `.omx/` line in `.git/info/exclude`.
- The `.omx` test exclusion in `vitest.config.ts`.
- Stale generated `.codedb-mcp/manifest.json` and `.codedb-mcp/index.bin`.

Preserve:

- `.codedb-mcp/codedb-mcp.toml` and `.gitignore` CodeDB rules.
- Application Codex Bridge code, tests, skill installer, and CLI script.
- Historical `.codestable` commits in Git.
- README product/release documentation, except for correcting provenance and
  removing the local `.omx` snapshot statement.

## Compatibility And Rollback

No runtime contract changes are intended. Removing the Vitest exclusion only
makes future accidental `.omx` content visible to test discovery.

Rollback sources:

- `.codestable/`: restore from Git history.
- `.omx/reference/PixAI-Codex`: clone the recorded upstream commit.
- Other ignored `.omx` runtime/history files: intentionally not retained.
- CodeDB cache: regenerated automatically by the next index operation.

The directories are deleted only after their targets and provenance artifacts
have been verified on disk.
