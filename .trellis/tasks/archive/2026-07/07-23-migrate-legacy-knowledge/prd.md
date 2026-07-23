# Migrate legacy OMX and CodeStable knowledge

## Goal

Replace the obsolete project-local OMX and CodeStable systems with current,
source-backed Trellis guidance while preserving required third-party notices.

## Background

- `.omx/` contains 190 ignored files (about 1.80 MB): runtime state, logs,
  completed planning material, and a local clone of `Adaoer/PixAI-Codex`.
- `.codestable/` contains 40 tracked files (about 387 KB): framework material,
  completed feature/issue records, and several still-useful architecture rules.
- `.trellis/spec/frontend/` is still template scaffolding and does not yet teach
  future agents the repository's actual conventions.
- The current Tauri app substantially adapts parts of `PixAI-Codex`; the local
  reference clone is licensed under PolyForm Noncommercial 1.0.0 and contains
  the required notice `Copyright 2026 PixAI`.

## Requirements

1. Replace every placeholder frontend Trellis spec with concise, English,
   source-backed guidance for the repository as it exists now.
2. Add a backend Trellis spec layer for Tauri runtime boundaries, the local
   Codex Bridge, notifications/single-instance behavior, and updater/release
   invariants that do not belong in frontend guidance.
3. Treat current source, tests, configuration, and README behavior as more
   authoritative than old OMX or CodeStable documents. Do not preserve stale
   requirements as current rules.
4. Preserve the complete `PixAI-Codex` license text, required notice, upstream
   URL, and audited commit before deleting the local reference clone. Clarify
   in the README that portions were adapted rather than describing the clone
   as a disposable local snapshot.
5. Remove `.omx/`, `.codestable/`, repository-local references to those systems,
   and stale CodeDB index data that names deleted CodeStable tools.
6. Preserve unrelated current capabilities and configuration, including the
   PixAI Codex Bridge, `scripts/pixai-codex.mjs`, `.codedb-mcp/codedb-mcp.toml`,
   and the CodeDB cache ignore rules.
7. Make no product behavior changes. The only non-document source/config edit
   is removing the obsolete `.omx` test exclusion.

## Out of Scope

- Selecting or changing the root license for the entire PixAI-Tauri repository.
- Uninstalling global OMX/oh-my-codex packages or deleting user-global state.
- Reproducing completed OMX/CodeStable task histories verbatim in Trellis.
- Refactoring application code or changing any user-facing feature.

## Acceptance Criteria

- [x] All frontend Trellis spec files contain current project rules, real file
      references, examples, and explicit anti-patterns; no template placeholders
      remain.
- [x] A backend spec index and focused Tauri, Bridge, and updater/release guides
      exist and are discoverable through Trellis package context.
- [x] The `PixAI-Codex` PolyForm Noncommercial 1.0.0 license and required notice
      are retained in a third-party notice file, and README records the upstream
      URL plus commit `db3eefd5c217b7131f844b855f7c41ea10fd013e`.
- [x] `.omx/` and `.codestable/` no longer exist.
- [x] README, Vitest configuration, `.git/info/exclude`, and CodeDB cache contain
      no stale project-local OMX or CodeStable references.
- [x] Current Codex Bridge and CodeDB project configuration remain intact.
- [x] Trellis context/scripts work, spec placeholder/reference scans pass, and
      the existing frontend and Rust test suites pass.

## Notes

- `.codestable/` is recoverable from Git history after deletion. `.omx/` is not;
  its recoverable upstream, audited commit, and license therefore must be
  recorded before removal.
- There are no remaining blocking product or scope questions.

## Post-Rebase Update

After rebasing this migration onto `origin/main` at release `0.0.15`, 22 newer
`.codestable/` records were reintroduced by upstream history. They are subject
to the same authority order and removal requirement: retain only rules verified
against the current source/tests, then delete the directory again. The audited
findings live in `research/remote-0.0.15-audit.md`.

## Release Tag Divergence

Remote tag `0.0.16` exists at `cc70e5c`, but neither local `main` nor
`origin/main` contains it. The tag is a two-commit descendant of
`origin/main` (`a6c40dd`, then `cc70e5c`), while this migration commit is on a
separate child of the same `0.0.15` base. Its behavior is audited in
`research/remote-0.0.16-audit.md`, but rules unique to that tag must not be
presented as current `main` behavior until the tag is explicitly integrated.
Integrating the release is a separate product/history change and remains
outside this documentation-only migration task.
