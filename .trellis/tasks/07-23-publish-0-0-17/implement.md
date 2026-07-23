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
- [ ] Review the exact release diff and commit it as
  `chore: release 0.0.17` after the workflow commit confirmation gate.
- [ ] Push `main`, create tag `0.0.17` on the release commit, and push the tag.
- [ ] Locate and monitor the triggered `release.yml` run through completion.
- [ ] If the run fails, inspect failed logs and stop before any manual asset
  replacement or same-version rerun.
- [ ] Verify Release metadata and the seven required assets.
- [ ] Fetch and validate the public `latest.json` version and four platform keys.
- [ ] Record the Release URL and workflow run in the task, then run the Trellis
  finish flow.

## Validation Commands

```text
corepack pnpm check
gh run watch <run-id> --repo FingerCaster/PixAI-Tauri
gh release view 0.0.17 --repo FingerCaster/PixAI-Tauri --json tagName,isDraft,isPrerelease,url,assets
```

The public updater feed is additionally parsed as JSON and must report version
`0.0.17` plus all four required platform identifiers.

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
