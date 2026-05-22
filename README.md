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
