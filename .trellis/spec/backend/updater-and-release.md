# Updater And Release Guidelines

## Runtime Flow

`src/services/app-update.ts` owns update checks/install behavior. The Zustand
store owns the user-visible `AppUpdateState` state machine and starts one silent
desktop check after initial load.

- Guard concurrent checking, downloading, and installing states.
- A normal Tauri updater `null` result means up to date and must not trigger
  GitHub or open a browser.
- Fall back to GitHub Releases only for recognized endpoint, 404, public-key,
  signature, or missing-release-source failures.
- Compare normalized numeric version segments; do not compare version strings
  lexicographically.
- Detect MSI versus NSIS and request/select the matching target. An unknown
  installed bundle type is an actionable error, not permission to install an
  arbitrary Windows asset.
- Preserve workspace state when a check fails; store the error and show
  feedback without reloading the app.

`src/services/app-update.test.ts` is the behavioral contract for fallback,
installer choice, no-update handling, and serialized updater errors.

## Production Configuration

- `src-tauri/tauri.conf.json` contains the production endpoint and public key.
- Keep versions synchronized across `package.json`, `src-tauri/Cargo.toml`,
  `src-tauri/tauri.conf.json`, and the lockfile where applicable.
- `scripts/release-updater.mjs` builds signed artifacts, stages `latest.json`,
  and publishes to an existing GitHub release. Preserve both MSI and NSIS
  target names.
- The private signing key belongs only under ignored
  `artifacts/release-updater/keys/` or the configured secret manager. Never
  commit it, print it, or embed it in runtime config. The repository stores the
  public key only.

## Local Validation Feed

`scripts/local-updater.mjs` and `src-tauri/tauri.local-updater.conf.json` are a
separate test system. They may generate a localhost HTTP endpoint and temporary
keys under `artifacts/local-updater/`, but must never overwrite production
configuration or production signing material.

The intended local sequence is key generation, old-version build, new-version
build, feed publication, and localhost serving as documented in README.

## Change Checklist

- Update runtime service, Zustand state/feedback, settings UI, tests, README,
  and scripts together when the update contract changes.
- Use the platform HTTP path for GitHub HTML/assets so packaged Windows builds
  retain native TLS/system-proxy behavior.
- Keep temporary generated configs and all signing artifacts ignored.
- Run `pnpm check`, then the relevant release script in its non-publishing
  stage. Never publish or rotate keys as part of a routine code change.
