# Publish 0.0.17 release design

## Release Boundary

The release source is the tip of `main` after one metadata-only release commit.
Tag `0.0.17` must point to that commit. Pushing the tag invokes
`.github/workflows/release.yml`; no local installer is treated as a production
release artifact.

## Version Contract

The version is synchronized across:

1. `package.json`
2. `src-tauri/tauri.conf.json`
3. `src-tauri/Cargo.toml`
4. the `name = "pixai-tauri"` entry in `src-tauri/Cargo.lock`

The workflow strips an optional `v` prefix but the established repository tag
style is the plain version, so both the requested version and tag are `0.0.17`.

## Publication Flow

1. Fetch `origin/main` and tags, then verify the local branch has no unexpected
   divergence and `0.0.17` has no tag or Release collision.
2. Update version metadata and run the local quality gate.
3. Commit the release metadata.
4. Push `main`, create tag `0.0.17` on the release commit, and push the tag.
5. The workflow runs `prepare -> check -> build matrix -> publish`.
6. The publish job creates a draft, uploads the complete merged updater asset
   set, and only then makes it public and Latest.
7. Verify Git refs, Release metadata/assets, and the public updater manifest.

## Security And Compatibility

- GitHub Secrets remain the only source of the production updater private key.
- `src-tauri/tauri.conf.json` retains the existing public key and
  `releases/latest/download/latest.json` endpoint.
- The release must retain Windows MSI/NSIS and both supported macOS
  architectures so existing clients receive an installer matching their
  platform and bundle type.

## Failure And Recovery

- If preflight or local checks fail, do not create or push the tag.
- If pushing `main` succeeds but tag creation has not occurred, fix the release
  commit locally and push a new commit before tagging.
- If the workflow fails after tag push, inspect failed job logs. Do not move or
  recreate the published tag without an explicit recovery decision. The normal
  same-version recovery is a manual workflow dispatch from current `main`, as
  documented in `docs/release-github-actions.md`.
- If a draft Release exists after failure, keep it draft until all required
  platforms are regenerated and merged.
- If publication succeeds but verification fails, stop and report the precise
  remote mismatch before editing or replacing assets.
