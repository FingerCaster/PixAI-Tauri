# Legacy Knowledge Migration Plan

## Implementation Checklist

- [x] Reconfirm exact legacy paths, Git tracking state, upstream commit, and
      license required notice before destructive actions.
- [x] Rewrite all six `.trellis/spec/frontend/` guides and its index from
      current code/tests plus verified legacy decisions.
- [x] Add the `.trellis/spec/backend/` index and Tauri, Bridge, and updater
      guides with current source anchors.
- [x] Add the complete `PixAI-Codex` third-party license and update README
      provenance without changing the repository's root-license status.
- [x] Remove the obsolete `.omx` Vitest exclusion and `.git/info/exclude` entry.
- [x] Delete stale CodeDB index/manifest data while preserving its TOML config.
- [x] Delete the validated `.omx/` and `.codestable/` directories.
- [x] Mark the original Trellis bootstrap-guidelines checklist complete once
      the spec tree passes its quality gate.
- [x] Run the full validation set and inspect the final Git diff/status.

## Validation

1. Confirm `.omx/` and `.codestable/` are absent with `Test-Path`.
2. Search tracked/project files for `.omx`, `.codestable`, `CodeStable`, OMX
   workflow names, and obsolete `cs-*` command references.
3. Search `.trellis/spec/` for `To fill`, `TODO: fill`, and placeholder prose.
4. Run `python .trellis/scripts/get_context.py --mode packages` and confirm both
   frontend and backend spec layers are listed.
5. Run `python -m compileall -q .trellis/scripts .codex/hooks`.
6. Run `pnpm check`.
7. Run `cargo test --manifest-path src-tauri/Cargo.toml`.
8. Run `git diff --check` and inspect `git status --short --ignored` for stale
   legacy directories or accidental unrelated changes.
9. Verify `THIRD_PARTY_NOTICES/PixAI-Codex-LICENSE.txt` retains the exact
   required notice and license heading from the reference clone.

## Risk And Rollback Gates

- Do not delete `.omx/reference/PixAI-Codex` until the notice file and README
  provenance have been compared with its Git metadata and license.
- Do not delete `.codestable` until every migrated rule has a current code/test
  anchor and stale statements have been rejected.
- If validation exposes a behavior mismatch, keep the legacy directories in
  place, fix the spec, and rerun checks before deletion.
- Do not create a root `LICENSE` or commit changes without separate owner
  authorization.
