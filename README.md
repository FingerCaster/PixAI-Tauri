# PixAI Tauri

PixAI rebuilt as a Tauri 2 desktop app. The old Electron repository at `D:\UGit\PixAI` is a reference only; this repository is a clean Tauri implementation.

## What is included

- Tauri 2 desktop shell with React 19, TypeScript, Vite, Zustand, and pnpm.
- Multi-provider profile center with independent image-generation and prompt-assistant profile selection.
- Provider adapter boundary with an initial `openai-compatible` adapter for `/v1/images/generations`, `/v1/images/edits`, and `/v1/responses`.
- Local app data for conversations, generation runs, history, reference images, and prompt templates.
- Tauri-side secret boundary using system keyring when available, with a documented app-data fallback for local/dev environments.
- Workspace, gallery, prompt library, prompt assistant, retries, timeout, cancellation hooks, reference image management, and error details.

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
```

## Data and migration

This app intentionally uses a new Tauri app data directory. Electron data migration from the reference app is out of scope for the first version.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
