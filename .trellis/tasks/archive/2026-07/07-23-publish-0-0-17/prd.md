# Publish 0.0.17 release

## Goal

Publish the verified current `main` branch as PixAI `0.0.17` through the
repository's production GitHub Actions pipeline so desktop users receive the
latest fixes and the signed updater feed advances from `0.0.16`.

## Background

- GitHub Release `0.0.16` is already published and is currently Latest. Its tag
  points to `4706ea8`.
- The application metadata in `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml`, and the root package entry in `src-tauri/Cargo.lock`
  is still `0.0.16`.
- Local `main` is clean apart from this planning task and is eight commits ahead
  of `origin/main`. It includes the user-tested live Bridge generation status
  fix (`e2d8a45`) and the current production release workflow.
- The user installed the locally built `0.0.16` MSI and verified Bridge image
  generation with the configured provider. No product defect was found during
  that acceptance test.
- The production workflow builds Windows x64, macOS arm64, and macOS x64,
  signs updater bundles with GitHub Secrets, merges `latest.json`, publishes a
  draft Release only after all platform jobs succeed, and then marks it Latest.

## Requirements

- Release version and tag must be exactly `0.0.17`, without a `v` prefix.
- Synchronize the version in all four authoritative metadata locations:
  `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the
  `pixai-tauri` package entry in `src-tauri/Cargo.lock`.
- Preserve the existing updater endpoint and public key; do not rotate, print,
  download, or commit the production private key.
- Before publishing, confirm `origin/main` and remote tags have not advanced,
  confirm tag/Release `0.0.17` do not exist, and run `pnpm check`.
- Commit the version bump as `chore: release 0.0.17`, then push `main` and the
  `0.0.17` tag according to `docs/release-github-actions.md`.
- Monitor the triggered Release workflow until it completes. Do not report the
  release as successful while any check, build, or publish job is pending or
  failed.
- A failed matrix build must leave the release unpublished or draft. Do not
  manually upload a partial cross-platform asset set.
- After success, verify the GitHub Release state, required downloadable assets,
  tag target, and public updater manifest.
- Finish the Trellis task only after remote publication and verification are
  complete.

## Acceptance Criteria

- [x] All four application metadata locations report `0.0.17`.
- [x] `pnpm check` passes before the release commit is pushed.
- [x] Remote `main` contains the release commit and tag `0.0.17` points to that
  same commit.
- [x] The GitHub Release workflow completes successfully.
- [x] GitHub Release `0.0.17` is public, non-draft, non-prerelease, and Latest.
- [x] The Release contains `latest.json`, Windows MSI and NSIS installers, both
  macOS updater archives, and both macOS DMGs.
- [x] Public `latest.json` reports version `0.0.17` and contains
  `windows-x86_64-msi`, `windows-x86_64-nsis`, `darwin-aarch64`, and
  `darwin-x86_64`.
- [x] The local worktree is clean after Trellis bookkeeping is committed.

## Out Of Scope

- Changing updater behavior, release workflow structure, application features,
  or production signing keys.
- Rebuilding or uploading release assets manually outside the established
  GitHub Actions pipeline unless a separately approved recovery plan is needed.
- Publishing a prerelease or retaining `0.0.16` as Latest after `0.0.17` passes
  verification.
