# Publish 0.0.17 execution plan

## Checklist

- [x] Fetch `origin/main` and tags; verify branch divergence and a clean task
  scope.
- [x] Confirm GitHub secrets are configured by name, and confirm tag/Release
  `0.0.17` do not exist locally or remotely.
- [x] Update `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` to `0.0.17`.
- [x] Verify all authoritative versions are identical.
- [x] Run `corepack pnpm check`.
- [x] Review the exact release diff and commit it as
  `chore: release 0.0.17` after the workflow commit confirmation gate.
- [x] Push `main`, create tag `0.0.17` on the release commit, and push the tag.
- [x] Locate and monitor the triggered `release.yml` run through completion.
- [x] Workflow completed successfully; no failure recovery, manual asset
  replacement, or same-version rerun was required.
- [x] Verify Release metadata and the seven required assets.
- [x] Fetch and validate the public `latest.json` version and four platform keys.
- [x] Record the Release URL and workflow run in the task, then run the Trellis
  finish flow.

## Validation Commands

```text
corepack pnpm check
gh run watch <run-id> --repo FingerCaster/PixAI-Tauri
gh release view 0.0.17 --repo FingerCaster/PixAI-Tauri --json tagName,isDraft,isPrerelease,url,assets
```

The public updater feed is additionally parsed as JSON and must report version
`0.0.17` plus all four required platform identifiers.

## Release Evidence

- Release commit and tag target: `506e90134d89d3d583594369c589f3717b4a5026`.
- GitHub Actions run `30004994681` completed successfully:
  `https://github.com/FingerCaster/PixAI-Tauri/actions/runs/30004994681`.
- Public release: `https://github.com/FingerCaster/PixAI-Tauri/releases/tag/0.0.17`.
- The published updater feed reports version `0.0.17` and these platform keys:
  `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64-msi`, and
  `windows-x86_64-nsis`.

## Rollback Points

- Before the release commit: restore only the four version files and task
  artifacts if the release is canceled.
- After the release commit but before push: no remote state exists; add a normal
  corrective commit if needed rather than amending after review.
- After pushing `main` but before tag push: do not tag until remote `main` is
  confirmed at the intended release commit.
- After tag push: treat the tag and workflow as externally visible state; stop
  on failure and follow the documented same-version recovery flow only after a
  specific recovery decision.
