# Frontend Directory Structure

## Ownership Map

```text
src/
|- adapters/                 Provider protocol implementations and registry
|- components/
|  |- ui/                    shadcn/Radix primitives owned as project source
|  |- layout/                Desktop shell and primary navigation
|  |- workspace/             Prompt, generation, result, and preview workflow
|  |- gallery/               Cross-conversation image library
|  |- prompts/               Prompt-template library
|  |- settings/
|     |- workspace/          High-frequency current-conversation controls
|     |- global/             Low-frequency application preferences/status
|     |- providers/          Provider create/edit management flow
|- lib/                      Cross-feature runtime utilities and Tauri wrappers
|- services/                 Business operations, persistence, bridge, updater
|- shared/                   Domain contracts and pure option/default logic
|- store/                    Zustand application orchestration and helpers
|- test/                     Shared Vitest setup
|- App.tsx                   Lifecycle wiring and top-level view composition
|- index.css                 Tailwind imports, tokens, themes, global baseline
|- main.tsx                  React mount only
```

The native side is under `src-tauri/`; release and local-updater tooling is
under `scripts/`. Read the backend specs before changing either.

## Placement Rules

- Put reusable visual primitives in `src/components/ui/`. They may expose
  variants and accessibility behavior, but must not import the Zustand store
  or PixAI services. `button.tsx`, `dialog.tsx`, and `select.tsx` are examples.
- Group business components by the user surface that owns them. Do not create
  a generic `components/common/` dumping ground unless two real surfaces share
  the same semantic component. `GallerySelect.tsx` is the current intentional
  cross-surface control.
- Keep high-frequency generation parameters in
  `settings/workspace/WorkspaceConfigPanel.tsx`. Application preferences,
  notifications, providers, extensions, and updates belong under
  `settings/global/` or `settings/providers/`.
- Put persisted behavior behind a service. `AppDatabase`,
  `ProviderSettingsStore`, and `AppPreferencesStore` use the platform boundary
  instead of making components read files or browser storage directly.
- Put external provider request construction behind `src/adapters/` and the
  `ProviderAdapter` interface. Service code selects an adapter; UI code never
  assembles OpenAI-compatible HTTP payloads.
- Put domain contracts shared by components, services, and adapters in
  `src/shared/types.ts`. Keep presentation-only types beside their component
  and store-only types in `src/store/`.
- Use `src/lib/platform.ts` as the TypeScript native/browser compatibility
  boundary. Components should not scatter raw `invoke(...)` calls.

## Styling And Assets

- `src/index.css` is the only global style and theme entry. Tailwind v4,
  shadcn tokens, the `.dark` variant, and the fixed desktop baseline live
  there.
- Extend or compose `src/components/ui/*` and use Tailwind utilities in feature
  components. Use `cn(...)` from `src/lib/utils.ts` for conditional classes.
- Do not restore the retired `src/styles.css` or introduce a parallel global
  class system.
- Application-owned images belong in `src/assets/`; Tauri bundle icons belong
  in `src-tauri/icons/`.

## Naming

- React components and their files use PascalCase (`MainLayout.tsx`).
- Services and pure helpers use kebab-case files (`app-update.ts`,
  `generation-state.ts`).
- Tests sit beside the unit as `*.test.ts` or `*.test.tsx`.
- Event names use the `pixai://...` namespace on the Tauri boundary.

## Reference Modules

- `src/services/app-api.ts` shows how services are composed into a UI-facing
  API without exposing storage details.
- `src/components/workspace/Workspace.tsx` is a small container that derives
  state and composes focused children.
- `src/components/settings/global/GlobalSettingsModal.tsx` demonstrates the
  low-frequency settings boundary and tab ownership.
- `src/adapters/openai-compatible.ts` plus `src/adapters/registry.ts` show the
  adapter registration boundary.
