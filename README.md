# PixAI Tauri

PixAI rebuilt as a Tauri 2 desktop app. The old Electron repository at `D:\UGit\PixAI` is a reference only; this repository is a clean Tauri implementation.

## What is included

- Tauri 2 desktop shell with React 19, TypeScript, Vite, Zustand, and pnpm.
- Multi-provider profile center with independent image-generation and prompt-assistant profile selection.
- Provider adapter boundary with an initial `openai-compatible` adapter for `/v1/images/generations`, `/v1/images/edits`, and `/v1/responses`.
- Local app data for conversations, generation runs, history, reference images, and prompt templates.
- Tauri-side secret boundary using system keyring when available, with a documented app-data fallback for local/dev environments.
- Workspace, gallery, prompt library, prompt assistant, retries, timeout, cancellation hooks, reference image management, and error details.
- Local Codex Bridge for same-machine automation over `http://127.0.0.1:43117`.

## Local test provider

The default provider profile points at:

```text
http://127.0.0.1:37123
```

Use `sk-123456789` as the local test API key when your mock provider is running. The key is not committed as a default secret; enter it in the Provider profile editor or set it from tests.

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
pnpm tauri dev
pnpm dist
pnpm codex -- health
```

## App updates

PixAI uses the Tauri updater plugin for in-app update checks. The settings panel shows the current runtime version, can check for updates manually, and checks once on desktop startup when the updater is configured.

Before producing a public installer, add updater configuration to `src-tauri/tauri.conf.json`:

```json
"bundle": {
  "createUpdaterArtifacts": true
},
"plugins": {
  "updater": {
    "endpoints": ["https://your-release-host.example.com/pixai/{{target}}/{{current_version}}"],
    "pubkey": "YOUR_TAURI_UPDATER_PUBLIC_KEY"
  }
}
```

Generate and keep the Tauri updater private key outside the repository, then set `TAURI_SIGNING_PRIVATE_KEY` and, if needed, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the release environment before running `pnpm dist`. Without configured updater endpoints and signing keys, update checks fail gracefully and do not affect image generation.

### Local updater verification

Real releases can keep using GitHub Release and `latest.json`. For local updater verification, use the separate local feed workflow instead of uploading test builds to GitHub.

1. Generate a local updater signing key once:

```bash
pnpm updater:local:keygen
```

2. Build and install a baseline local-test app version. This is the app instance you will launch and click "检查更新" from:

```bash
pnpm updater:local:build -- --version 0.0.2 --port 14333
```

This build:

- overrides the app version for both Tauri and the frontend version label
- points the updater to `http://127.0.0.1:14333/latest.json`
- enables updater artifact generation
- signs the build with the local test key under `artifacts/local-updater/keys/`

Install the generated NSIS package from:

```text
src-tauri/target/release/bundle/nsis/PixAI_0.0.2_x64-setup.exe
```

3. Build the newer version that the installed app should discover:

```bash
pnpm updater:local:build -- --version 0.0.3 --port 14333
```

4. Publish the generated updater artifacts into a local feed:

```bash
pnpm updater:local:publish -- --version 0.0.3 --port 14333
```

5. Start the local feed server:

```bash
pnpm updater:local:serve -- --port 14333
```

6. Launch the installed `0.0.2` local-test app and trigger "检查更新" inside the app. It should discover `0.0.3` from the local feed and stay entirely off GitHub during verification.

Local feed output is written to:

```text
artifacts/local-updater/feed/
```

Local updater keys are written to:

```text
artifacts/local-updater/keys/
```

Notes:

- The local feed preserves Windows installer type boundaries: MSI installs update from MSI artifacts, and NSIS installs update from NSIS artifacts.
- If the app is built without the local updater config, it will continue using the production GitHub updater endpoint.
- The GitHub release fallback is only used when the configured Tauri updater source is unavailable or invalid; a normal "no update" result does not redirect to GitHub.

## Codex Bridge

When the Tauri app is running it starts a local bridge at:

```text
http://127.0.0.1:43117
```

Set `PIXAI_CODEX_PORT` before launch to change the port, or `PIXAI_CODEX_BRIDGE=0` to disable it. The bridge binds to `127.0.0.1` only and is intended for local Codex automation.

Useful commands:

```bash
pnpm codex -- health
pnpm codex -- generate --prompt "一座清晨玻璃温室，自然光，干净摄影风格" --ratio 1:1 --n 1
pnpm codex -- history --limit 5
pnpm codex -- inspire
pnpm codex -- enrich --prompt "清爽产品摄影"
```

## Data and migration

This app intentionally uses a new Tauri app data directory. Electron data migration from the reference app is out of scope for the first version.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
