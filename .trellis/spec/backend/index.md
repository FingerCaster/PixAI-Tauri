# PixAI Backend And Desktop Guidelines

This layer covers the Tauri/Rust native boundary and updater/release tooling.
Business workflows remain in TypeScript services; Rust supplies native OS,
filesystem, secret, HTTP transport, window, tray, and loopback Bridge behavior.

## Guides

| Guide | Use it for |
|---|---|
| [Tauri Guidelines](./tauri-guidelines.md) | Commands, plugins, secrets, files, tray, notifications, and native/browser boundaries |
| [Codex Bridge](./codex-bridge.md) | Loopback HTTP transport and TypeScript business dispatch |
| [Updater And Release](./updater-and-release.md) | Signed updater behavior, GitHub fallback, local feeds, and release keys |

## Pre-Development Checklist

1. Decide whether the behavior belongs in Rust transport/OS integration or a
   TypeScript business service. Keep that boundary explicit.
2. Read the focused guide and the frontend state/type/quality guides when a
   command, event, or payload crosses layers.
3. Search `src-tauri/src/lib.rs`, `src/lib/platform.ts`, and all consumers for
   the command/event/field being changed.
4. Keep `src-tauri/capabilities/default.json`, `generate_handler!`, TypeScript
   wrappers, shared types, and tests synchronized.

## Standard Checks

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm check
```
