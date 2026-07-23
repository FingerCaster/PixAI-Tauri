# PixAI Frontend Guidelines

PixAI is a React 19 desktop workbench rendered inside Tauri 2. The frontend
owns the user workflow and business orchestration; Rust owns native transport
and operating-system integration. These guides describe current repository
patterns, not generic React recommendations.

## Guides

| Guide | Use it for |
|---|---|
| [Directory Structure](./directory-structure.md) | Deciding where components, services, adapters, contracts, and utilities belong |
| [Component Guidelines](./component-guidelines.md) | Building desktop UI with shadcn primitives and Tailwind v4 |
| [Hook Guidelines](./hook-guidelines.md) | Effects, subscriptions, timers, memoization, and Zustand selectors |
| [State Management](./state-management.md) | Separating component state, Zustand orchestration, services, persistence, and providers |
| [Type Safety](./type-safety.md) | Shared contracts, discriminated unions, update shapes, and runtime normalization |
| [Quality Guidelines](./quality-guidelines.md) | Tests, regression traps, review checks, and provenance rules |

## Pre-Development Checklist

1. Identify the owning layer before editing: component, store, service,
   adapter, shared contract, or native platform wrapper.
2. Read the guide for that layer plus `quality-guidelines.md`.
3. For changes crossing `src/` and `src-tauri/`, also read
   `../backend/index.md` and the relevant backend guide.
4. Search for the value, contract, event name, or state field being changed.
   Provider fields, updater states, and bridge routes have multiple consumers.
5. Find the closest test and preserve its mock boundary. Tests must not call a
   real image provider or depend on a running Tauri shell.

## Standard Checks

```bash
pnpm check
pnpm build
```

Use `pnpm test -- <path>` for a focused iteration, then run `pnpm check` before
finishing. There is no separate lint script; strict TypeScript plus Vitest is
the current frontend quality gate.
